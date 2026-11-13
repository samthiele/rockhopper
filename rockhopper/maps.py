"""
Build a Z-up terrain mesh from a GeoTIFF or a longitude/latitude box.

The mesh is a float32 PLY (positions and texture coordinates only). Each
colour layer is an RGB JPEG: the source image, a viridis elevation ramp,
and optional orthoimagery.
"""
import io
import json
import os
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

import numpy as np

from rockhopper.meshes import _preview_jpeg, _write_ply

_EARTH = 6378137.0
_ORIGIN = 20037508.342789244
_MAX_VERTICES = 200_000
_MAX_EDGE = 2049  # 2^11 + 1, about four million samples
_MAX_TEXTURE = 4096
_DEM_METRES = 5.0

# Viridis anchors (matplotlib), interpolated across the ramp.
_VIRIDIS_ANCHORS = np.array([
    [68, 1, 84],
    [72, 35, 116],
    [64, 67, 135],
    [52, 94, 141],
    [33, 144, 141],
    [53, 183, 121],
    [143, 215, 68],
    [253, 231, 37],
], dtype=np.float64)


def _require_rasterio():
    try:
        import rasterio
    except ImportError:
        assert False, "Please install rasterio to build map meshes (`pip install rasterio`)."
    return rasterio


def _viridis(steps=256):
    slots = np.linspace(0, 1, len(_VIRIDIS_ANCHORS))
    tone = np.linspace(0, 1, steps)
    rgb = np.empty((steps, 3), dtype=np.uint8)
    for channel in range(3):
        rgb[:, channel] = np.clip(np.interp(tone, slots, _VIRIDIS_ANCHORS[:, channel]), 0, 255)
    return rgb


def _is_box(base):
    return not isinstance(base, (str, os.PathLike))


def _lonlat_to_mercator(lon, lat):
    lat = np.clip(np.asarray(lat, dtype=np.float64), -85.05112878, 85.05112878)
    x = _EARTH * np.radians(lon)
    y = _EARTH * np.log(np.tan(np.pi / 4.0 + np.radians(lat) / 2.0))
    return float(x), float(y)


def _ground_metres(lat, zoom):
    return 156543.03392 * np.cos(np.radians(lat)) / (2 ** zoom)


def _extent(base):
    """Return (xmin, ymin, xmax, ymax), crs, and the image path or None."""
    if not _is_box(base):
        rasterio = _require_rasterio()
        with rasterio.open(os.fspath(base)) as src:
            bounds = src.bounds
            return (bounds.left, bounds.bottom, bounds.right, bounds.top), src.crs, os.fspath(base)
    vals = [float(v) for v in base]
    if len(vals) != 4:
        raise ValueError("base bounding box must be (min_lon, max_lon, min_lat, max_lat)")
    min_lon, max_lon, min_lat, max_lat = vals
    xmin, ymin = _lonlat_to_mercator(min_lon, min_lat)
    xmax, ymax = _lonlat_to_mercator(max_lon, max_lat)
    return (xmin, ymin, xmax, ymax), "EPSG:3857", None


def _warp_bounds(bounds, src_crs, dst_crs):
    from rasterio.warp import transform_bounds
    return transform_bounds(src_crs, dst_crs, *bounds, densify_pts=21)


def _vertex_transform(bounds, width, height):
    """Affine whose pixel centres sit on the vertex grid. Row 0 is north."""
    from rasterio.transform import Affine
    xmin, ymin, xmax, ymax = bounds
    xres = (xmax - xmin) / (width - 1)
    yres = (ymax - ymin) / (height - 1)
    return Affine(xres, 0.0, xmin - xres / 2.0, 0.0, -yres, ymax + yres / 2.0)


def _fill_voids(mosaic):
    """Replace terrarium spikes that sit far from the local median."""
    try:
        from scipy.ndimage import median_filter
    except ImportError:
        return mosaic
    local = median_filter(mosaic, size=15)
    bad = np.abs(mosaic - local) > 400
    if not np.any(bad):
        return mosaic
    out = np.array(mosaic, dtype=np.float32, copy=True)
    out[bad] = local[bad]
    return out


def _despike(grid, tol=20.0, size=5, passes=8):
    """Replace samples more than ``tol`` metres below the local median.

    Terrarium tiles contain clusters of pits. Each pit still has a bad
    neighbour, so a test against every adjacent sample leaves them in place.
    The decimation then keeps a tiny triangle around each one, which appears
    as a hanging needle. A real slope stays within ``tol`` of the local median.
    """
    try:
        from scipy.ndimage import median_filter
    except ImportError:
        return grid
    out = np.array(grid, dtype=np.float32, copy=True)
    for _pass in range(passes):
        local = median_filter(out, size=size)
        bad = out < local - tol
        if not np.any(bad):
            break
        out[bad] = local[bad]
    return out


def _sample_dem(source, bounds, crs, width, height):
    """Warp a DEM path, or an in-memory EPSG:3857 mosaic, onto the vertex grid."""
    rasterio = _require_rasterio()
    from rasterio.transform import from_bounds
    from rasterio.warp import Resampling, reproject
    dest = np.zeros((height, width), dtype=np.float32)
    transform = _vertex_transform(bounds, width, height)
    if isinstance(source, str):
        with rasterio.open(source) as src:
            reproject(
                rasterio.band(src, 1), dest,
                src_transform=src.transform, src_crs=src.crs,
                dst_transform=transform, dst_crs=crs,
                resampling=Resampling.bilinear,
            )
    else:
        image, src_bounds = source
        reproject(
            image, dest,
            src_transform=from_bounds(*src_bounds, image.shape[1], image.shape[0]),
            src_crs="EPSG:3857",
            dst_transform=transform, dst_crs=crs,
            resampling=Resampling.bilinear,
        )
    return np.nan_to_num(dest, nan=0.0)


def _tile_range(merc_bounds, zoom):
    xmin, ymin, xmax, ymax = merc_bounds
    n = 2 ** zoom
    span = 2.0 * _ORIGIN / n

    def xy(x, y):
        tx = int(np.floor((x + _ORIGIN) / span))
        ty = int(np.floor((_ORIGIN - y) / span))
        return int(np.clip(tx, 0, n - 1)), int(np.clip(ty, 0, n - 1))

    tx0, ty0 = xy(xmin, ymax)
    tx1, ty1 = xy(xmax, ymin)
    return tx0, ty0, tx1, ty1


def _tile_url(kind, zoom, tx, ty):
    if kind == "terrarium":
        return "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/%d/%d/%d.png" % (zoom, tx, ty)
    if kind == "esri":
        return ("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/%d/%d/%d"
                % (zoom, ty, tx))
    if kind == "google":
        return "https://mt1.google.com/vt/lyrs=s&x=%d&y=%d&z=%d" % (tx, ty, zoom)
    raise ValueError("Unknown tile set %r" % kind)


def _fetch_bytes(url):
    request = urllib.request.Request(url, headers={"User-Agent": "rockhopper"})
    last = None
    for attempt in range(5):
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                return response.read()
        except Exception as error:
            last = error
            time.sleep(0.5 * (attempt + 1))
    raise RuntimeError("Failed to fetch %s (%s)" % (url, last))


def _download_mosaic(kind, zoom, merc_bounds):
    from PIL import Image
    tx0, ty0, tx1, ty1 = _tile_range(merc_bounds, zoom)
    jobs = [(tx, ty) for ty in range(ty0, ty1 + 1) for tx in range(tx0, tx1 + 1)]
    print("Fetching %d %s tiles at zoom %d" % (len(jobs), kind, zoom), flush=True)
    tile_rows = ty1 - ty0 + 1
    tile_cols = tx1 - tx0 + 1
    if kind == "terrarium":
        mosaic = np.zeros((tile_rows * 256, tile_cols * 256), dtype=np.float32)
    else:
        mosaic = np.zeros((tile_rows * 256, tile_cols * 256, 3), dtype=np.uint8)

    def one(job):
        tx, ty = job
        try:
            blob = _fetch_bytes(_tile_url(kind, zoom, tx, ty))
        except RuntimeError as error:
            print(error, flush=True)
            return tx, ty, None
        image = Image.open(io.BytesIO(blob)).convert("RGB")
        return tx, ty, np.asarray(image)

    failed = []
    done = 0
    with ThreadPoolExecutor(max_workers=8) as pool:
        for tx, ty, rgb in pool.map(one, jobs):
            done += 1
            if rgb is None:
                failed.append((tx, ty))
                continue
            row = (ty - ty0) * 256
            col = (tx - tx0) * 256
            if kind == "terrarium":
                mosaic[row:row + 256, col:col + 256] = (
                    rgb[:, :, 0].astype(np.float32) * 256.0
                    + rgb[:, :, 1].astype(np.float32)
                    + rgb[:, :, 2].astype(np.float32) / 256.0
                    - 32768.0
                )
            else:
                mosaic[row:row + 256, col:col + 256] = rgb
            if done % 25 == 0 or done == len(jobs):
                print("  %d/%d %s tiles" % (done, len(jobs), kind), flush=True)

    if failed:
        print("Retrying %d %s tiles" % (len(failed), kind), flush=True)
        for tx, ty in failed:
            try:
                blob = _fetch_bytes(_tile_url(kind, zoom, tx, ty))
            except RuntimeError as error:
                print(error, flush=True)
                continue
            rgb = np.asarray(Image.open(io.BytesIO(blob)).convert("RGB"))
            row = (ty - ty0) * 256
            col = (tx - tx0) * 256
            if kind == "terrarium":
                mosaic[row:row + 256, col:col + 256] = (
                    rgb[:, :, 0].astype(np.float32) * 256.0
                    + rgb[:, :, 1].astype(np.float32)
                    + rgb[:, :, 2].astype(np.float32) / 256.0
                    - 32768.0
                )
            else:
                mosaic[row:row + 256, col:col + 256] = rgb

    n = 2 ** zoom
    span = 2.0 * _ORIGIN / n
    west = -_ORIGIN + tx0 * span
    north = _ORIGIN - ty0 * span
    east = -_ORIGIN + (tx1 + 1) * span
    south = _ORIGIN - (ty1 + 1) * span
    return mosaic, (west, south, east, north)


def _offset_zoom(chosen, offset, limit):
    """Shift an automatic tile zoom by ``offset`` levels and keep it in range."""
    requested = int(chosen) + int(offset)
    level = int(min(limit, max(0, requested)))
    if level != requested:
        print("Tile zoom %d is outside 0..%d; using %d" % (requested, limit, level))
    return level


def _dem_zoom(lat, target_m, finer_than=False):
    chosen = 0
    for zoom in range(0, 16):
        metres = _ground_metres(lat, zoom)
        if finer_than:
            if metres <= target_m:
                return zoom
        elif metres >= target_m:
            chosen = zoom
        else:
            break
    return chosen


def _imagery_zoom(lat, merc_bounds):
    xmin, ymin, xmax, ymax = merc_bounds
    long_m = max(xmax - xmin, ymax - ymin)
    zoom = 1
    for candidate in range(1, 19):
        pixels = long_m / _ground_metres(lat, candidate)
        tx0, ty0, tx1, ty1 = _tile_range(merc_bounds, candidate)
        if pixels > _MAX_TEXTURE or (tx1 - tx0) > 24 or (ty1 - ty0) > 24:
            break
        zoom = candidate
    return zoom


def _block_errors(grid):
    """Max |height − bilinear corners| for every power-of-two block."""
    errors = {}
    n = grid.shape[0] - 1
    size = 2
    while size <= n:
        blocks = n // size
        if blocks >= size:
            errors[size] = _errors_by_offset(grid, size, blocks)
        else:
            errors[size] = _errors_by_block(grid, size, blocks)
        size *= 2
    return errors


def _corner_planes(grid, size, blocks):
    n = grid.shape[0] - 1
    northwest = grid[0:n:size, 0:n:size][:blocks, :blocks]
    southwest = grid[size:n + 1:size, 0:n:size][:blocks, :blocks]
    northeast = grid[0:n:size, size:n + 1:size][:blocks, :blocks]
    southeast = grid[size:n + 1:size, size:n + 1:size][:blocks, :blocks]
    return northwest, southwest, northeast, southeast


def _errors_by_offset(grid, size, blocks):
    northwest, southwest, northeast, southeast = _corner_planes(grid, size, blocks)
    error = np.zeros((blocks, blocks), dtype=np.float32)
    for row in range(size + 1):
        v = row / size
        for col in range(size + 1):
            if (row in (0, size)) and (col in (0, size)):
                continue
            u = col / size
            estimate = (
                northwest * (1 - v) * (1 - u)
                + southwest * v * (1 - u)
                + northeast * (1 - v) * u
                + southeast * v * u
            )
            sample = grid[row:row + blocks * size:size, col:col + blocks * size:size][:blocks, :blocks]
            np.maximum(error, np.abs(sample - estimate), out=error)
    return error


def _errors_by_block(grid, size, blocks):
    error = np.empty((blocks, blocks), dtype=np.float32)
    step = np.linspace(0, 1, size + 1, dtype=np.float32)
    ii = step[:, None]
    jj = step[None, :]
    for bi in range(blocks):
        for bj in range(blocks):
            patch = grid[bi * size:(bi + 1) * size + 1, bj * size:(bj + 1) * size + 1]
            estimate = (
                patch[0, 0] * (1 - ii) * (1 - jj)
                + patch[-1, 0] * ii * (1 - jj)
                + patch[0, -1] * (1 - ii) * jj
                + patch[-1, -1] * ii * jj
            )
            error[bi, bj] = np.max(np.abs(patch - estimate))
    return error


def _simplify(grid, bounds, tolerance, errors):
    """
    Collapse blocks whose interior lies within ``tolerance`` metres of the
    corner bilinear surface.
    """
    n = grid.shape[0] - 1
    xmin, ymin, xmax, ymax = bounds
    include = np.zeros(grid.shape, dtype=bool)
    include[0, 0] = include[0, -1] = include[-1, 0] = include[-1, -1] = True

    def split(i, j, size):
        if size <= 1 or errors[size][i // size, j // size] <= tolerance:
            return
        half = size // 2
        include[i, j + half] = True
        include[i + size, j + half] = True
        include[i + half, j] = True
        include[i + half, j + size] = True
        include[i + half, j + half] = True
        split(i, j, half)
        split(i, j + half, half)
        split(i + half, j, half)
        split(i + half, j + half, half)

    split(0, 0, n)

    lookup = {}
    xyz = []
    uv = []

    def vertex(i, j):
        key = (int(i), int(j))
        slot = lookup.get(key)
        if slot is None:
            slot = len(xyz)
            lookup[key] = slot
            xyz.append((
                xmin + j / n * (xmax - xmin),
                ymax - i / n * (ymax - ymin),
                float(grid[i, j]),
            ))
            uv.append((j / n, 1.0 - i / n))
        return slot

    def edge(i0, j0, i1, j1):
        points = []
        if i0 == i1:
            step = 1 if j1 > j0 else -1
            for j in range(j0, j1, step):
                if include[i0, j]:
                    points.append(vertex(i0, j))
        else:
            step = 1 if i1 > i0 else -1
            for i in range(i0, i1, step):
                if include[i, j0]:
                    points.append(vertex(i, j0))
        return points

    faces = []

    def emit(i, j, size):
        if size > 1 and errors[size][i // size, j // size] > tolerance:
            half = size // 2
            emit(i, j, half)
            emit(i, j + half, half)
            emit(i + half, j, half)
            emit(i + half, j + half, half)
            return
        # Counter-clockwise when looking down on the Z-up surface.
        polygon = (
            edge(i + size, j, i + size, j + size)
            + edge(i + size, j + size, i, j + size)
            + edge(i, j + size, i, j)
            + edge(i, j, i + size, j)
        )
        for k in range(1, len(polygon) - 1):
            faces.append((polygon[0], polygon[k], polygon[k + 1]))

    emit(0, 0, n)
    return (
        np.asarray(xyz, dtype=np.float64),
        np.asarray(uv, dtype=np.float32),
        np.asarray(faces, dtype=np.int32),
    )


def _uniform(grid, bounds):
    height, width = grid.shape
    xmin, ymin, xmax, ymax = bounds
    rows = np.arange(height)
    cols = np.arange(width)
    jj, ii = np.meshgrid(cols, rows)
    x = xmin + jj / (width - 1) * (xmax - xmin)
    y = ymax - ii / (height - 1) * (ymax - ymin)
    xyz = np.column_stack([x.ravel(), y.ravel(), grid.ravel()]).astype(np.float64)
    uv = np.column_stack([
        (jj / (width - 1)).ravel(),
        (1.0 - ii / (height - 1)).ravel(),
    ]).astype(np.float32)
    a = (ii[:-1, :-1] * width + jj[:-1, :-1]).ravel()
    b = a + 1
    c = a + width
    faces = np.empty((a.size * 2, 3), dtype=np.int32)
    faces[0::2, 0] = a
    faces[0::2, 1] = c
    faces[0::2, 2] = b
    faces[1::2, 0] = b
    faces[1::2, 1] = c
    faces[1::2, 2] = c + 1
    return xyz, uv, faces


def _grid_edge(long_m, spacing, cap=_MAX_EDGE):
    need = int(np.ceil(long_m / spacing)) + 1
    power = 1
    while (2 ** power + 1) < need and (2 ** power + 1) < cap:
        power += 1
    return 2 ** power + 1


def _save_rgb(rgb, full_path, preview_path, max_edge=_MAX_TEXTURE):
    from PIL import Image
    image = Image.fromarray(np.ascontiguousarray(rgb), "RGB")
    long_edge = max(image.size)
    if long_edge > max_edge:
        scale = max_edge / long_edge
        image = image.resize(
            (max(1, int(round(image.size[0] * scale))), max(1, int(round(image.size[1] * scale)))),
            Image.Resampling.LANCZOS,
        )
    image.save(full_path, format="JPEG", quality=85, optimize=True)
    _preview_jpeg(full_path, preview_path)


def _read_base_rgb(path):
    rasterio = _require_rasterio()
    with rasterio.open(path) as src:
        indexes = [1, 2, 3] if src.count >= 3 else [1, 1, 1]
        data = src.read(indexes)
    rgb = np.moveaxis(data, 0, -1)
    if rgb.dtype == np.uint8:
        return rgb
    finite = np.asarray(rgb, dtype=np.float64)
    finite = finite[np.isfinite(finite)]
    low = float(np.min(finite)) if finite.size else 0.0
    high = float(np.max(finite)) if finite.size else 1.0
    if high <= low:
        return np.zeros((*rgb.shape[:2], 3), dtype=np.uint8)
    scaled = np.clip((rgb.astype(np.float64) - low) / (high - low), 0, 1)
    return (scaled * 255).astype(np.uint8)


def _texture_shape(bounds, pixel, max_edge=_MAX_TEXTURE):
    xmin, ymin, xmax, ymax = bounds
    long_m = max(xmax - xmin, ymax - ymin)
    edge = int(min(max_edge, max(2, round(long_m / max(pixel, 1e-6)))))
    if (xmax - xmin) >= (ymax - ymin):
        width = edge
        height = max(2, int(round(edge * (ymax - ymin) / (xmax - xmin))))
    else:
        height = edge
        width = max(2, int(round(edge * (xmax - xmin) / (ymax - ymin))))
    return width, height


def _warp_rgb(path, bounds, crs, max_edge=_MAX_TEXTURE):
    rasterio = _require_rasterio()
    from rasterio.transform import from_bounds
    from rasterio.warp import Resampling, reproject
    with rasterio.open(path) as src:
        pixel = max(abs(src.transform.a), abs(src.transform.e))
        width, height = _texture_shape(bounds, pixel, max_edge)
        dest = np.zeros((height, width, 3), dtype=np.uint8)
        transform = from_bounds(*bounds, width, height)
        indexes = [1, 2, 3] if src.count >= 3 else [1, 1, 1]
        for band, index in enumerate(indexes):
            plane = np.zeros((height, width), dtype=np.uint8)
            reproject(
                rasterio.band(src, index), plane,
                src_transform=src.transform, src_crs=src.crs,
                dst_transform=transform, dst_crs=crs,
                resampling=Resampling.bilinear,
            )
            dest[:, :, band] = plane
    return dest


def _sample_rgb(source, bounds, crs, max_edge=_MAX_TEXTURE):
    """Warp an in-memory EPSG:3857 RGB mosaic onto the map rectangle."""
    _require_rasterio()
    from rasterio.transform import from_bounds
    from rasterio.warp import Resampling, reproject
    image, src_bounds = source
    pixel = (src_bounds[2] - src_bounds[0]) / image.shape[1]
    width, height = _texture_shape(bounds, pixel, max_edge)
    dest = np.zeros((height, width, 3), dtype=np.uint8)
    src_transform = from_bounds(*src_bounds, image.shape[1], image.shape[0])
    dst_transform = from_bounds(*bounds, width, height)
    for band in range(3):
        plane = np.zeros((height, width), dtype=np.uint8)
        reproject(
            image[:, :, band], plane,
            src_transform=src_transform, src_crs="EPSG:3857",
            dst_transform=dst_transform, dst_crs=crs,
            resampling=Resampling.bilinear,
        )
        dest[:, :, band] = plane
    return dest


def _elevation_rgb(grid):
    low = float(np.min(grid))
    high = float(np.max(grid))
    if high <= low:
        tone = np.zeros(grid.shape, dtype=np.int32)
    else:
        tone = np.clip((grid - low) / (high - low) * 255.0, 0, 255).astype(np.int32)
    return _viridis()[tone]


def _style_list(base, textures):
    if textures is None:
        return [] if _is_box(base) else ["esri"]
    if isinstance(textures, str):
        return [textures]
    return list(textures)


def _style_name(entry):
    if isinstance(entry, str) and entry.lower() in ("esri", "google", "elevation"):
        return entry.lower()
    return os.path.splitext(os.path.basename(os.fspath(entry)))[0] or "texture"


def _frame(centered):
    low = centered.min(axis=0)
    high = centered.max(axis=0)
    center = (low + high) / 2.0
    dist = float(np.linalg.norm(high - low)) * 1.4
    return {
        "pos": [float(center[0]), float(center[1] - dist * 0.6), float(center[2] + dist * 0.45)],
        "tgt": [float(v) for v in center],
    }


def exportMap(base, out_dir, dem=None, textures=None, resolution=None, tolerance=None,
              verticalExaggeration=2.5, defaultColor=None, zoom=0):
    """
    Write a terrain mesh folder.

    Parameters
    ----------
    base : str | tuple
        GeoTIFF path, or ``(min_lon, max_lon, min_lat, max_lat)``. A GeoTIFF
        defines the extent and is the first texture. A bounding box is
        projected to EPSG:3857 and the first texture is a coloured DEM.
    out_dir : str
        Destination folder (``mesh.ply``, JPEGs, ``mesh.json``).
    dem : str | None
        Elevation GeoTIFF. ``None`` downloads Mapzen terrarium tiles.
    textures : str | list | None
        Extra images: GeoTIFF paths and the strings ``"esri"``, ``"google"``,
        and ``"elevation"``. ``None`` means ``"esri"`` for a GeoTIFF and no
        extras for a bounding box.
    resolution : float | None
        Uniform vertex spacing in map metres. The default simplifies the fine
        DEM, merging blocks that stay within ``tolerance`` metres of a plane.
    tolerance : float | None
        Vertical error in metres for that merge. Starts at 1 m and doubles
        until the mesh has at most about 200,000 vertices. Measured on the
        true elevations, before ``verticalExaggeration``.
    verticalExaggeration : float
        Multiplier applied to elevation after the mesh is simplified.
        Defaults to 2.5.
    defaultColor : str | None
        Which layer is listed first and shown on entry: ``"esri"``,
        ``"google"``, ``"elevation"``, or the filename stem of a GeoTIFF.
        ``None`` keeps the base image first, or the elevation ramp when
        ``base`` is a bounding box.
    zoom : int
        Offset, in tile levels, from the automatic DEM and imagery zoom.
        ``0`` keeps that choice, ``+2`` fetches two levels finer, and ``-1``
        one level coarser. Terrarium stops at level 15.
    """
    _require_rasterio()
    bounds, crs, image_path = _extent(base)
    xmin, ymin, xmax, ymax = bounds
    west, south, east, north = _warp_bounds(bounds, crs, "EPSG:4326")
    merc_bounds = _warp_bounds(bounds, crs, "EPSG:3857")
    mid_lat = (south + north) / 2.0
    textures = _style_list(base, textures)

    if image_path:
        rasterio = _require_rasterio()
        with rasterio.open(image_path) as src:
            pixel = max(abs(src.transform.a), abs(src.transform.e))
    else:
        pixel = _DEM_METRES

    zoom = int(zoom)
    # A finer tile level is 2^zoom times more detailed, so the sample grid
    # and the stored JPEG follow it instead of being capped at the default.
    detail = 2 ** zoom if zoom > 0 else 1
    texture_edge = min(16384, _MAX_TEXTURE * detail)
    grid_cap = _MAX_EDGE if zoom <= 0 else min(4097, _MAX_EDGE * 2)

    if resolution is None:
        spacing = max(_DEM_METRES, float(pixel)) / (2.0 ** zoom)
        edge = _grid_edge(max(xmax - xmin, ymax - ymin), spacing, grid_cap)
        width = height = edge
    else:
        width = max(2, int(round((xmax - xmin) / float(resolution))) + 1)
        height = max(2, int(round((ymax - ymin) / float(resolution))) + 1)
        if width * height > _MAX_EDGE * _MAX_EDGE:
            raise ValueError(
                "resolution produces more than %d samples; coarsen it" % (_MAX_EDGE * _MAX_EDGE)
            )

    if dem:
        grid = _despike(_sample_dem(os.fspath(dem), bounds, crs, width, height))
    else:
        target = float(resolution) if resolution else max(_DEM_METRES, float(pixel))
        dem_zoom = _offset_zoom(
            _dem_zoom(mid_lat, target, finer_than=resolution is not None), zoom, 15)
        print("DEM zoom %d" % dem_zoom)
        mosaic, mosaic_bounds = _download_mosaic("terrarium", dem_zoom, merc_bounds)
        grid = _despike(_sample_dem((_fill_voids(mosaic), mosaic_bounds), bounds, crs, width, height))

    if resolution is None:
        errors = _block_errors(grid)
        tol = 1.0 if tolerance is None else float(tolerance)
        xyz, uv, faces = _simplify(grid, bounds, tol, errors)
        while xyz.shape[0] > _MAX_VERTICES and tol < 1.0e6:
            tol *= 2.0
            print("Mesh has %d vertices; retrying at %.1f m tolerance" % (xyz.shape[0], tol))
            xyz, uv, faces = _simplify(grid, bounds, tol, errors)
        print("Terrain mesh: %d vertices, %d triangles, tolerance %.1f m"
              % (xyz.shape[0], faces.shape[0], tol))
    else:
        xyz, uv, faces = _uniform(grid, bounds)

    xyz[:, 2] *= float(verticalExaggeration)
    origin = np.mean(xyz, axis=0).astype(int)
    centered = (xyz - origin).astype(np.float32)

    os.makedirs(out_dir, exist_ok=True)
    _write_ply(os.path.join(out_dir, "mesh.ply"), centered, uv, faces)

    styles = []
    if image_path:
        styles.append((_style_name(image_path), _read_base_rgb(image_path)))
    else:
        styles.append(("elevation", _elevation_rgb(grid)))

    for entry in textures:
        name = _style_name(entry)
        if any(existing == name for existing, _rgb in styles):
            continue
        key = entry.lower() if isinstance(entry, str) else ""
        if key == "elevation":
            rgb = _elevation_rgb(grid)
        elif key in ("esri", "google"):
            image_zoom = _offset_zoom(_imagery_zoom(mid_lat, merc_bounds), zoom, 19)
            print("%s zoom %d" % (key, image_zoom))
            mosaic, mosaic_bounds = _download_mosaic(key, image_zoom, merc_bounds)
            rgb = _sample_rgb((mosaic, mosaic_bounds), bounds, crs, texture_edge)
        else:
            rgb = _warp_rgb(os.fspath(entry), bounds, crs, texture_edge)
        styles.append((name, rgb))

    if defaultColor is not None:
        chosen = _style_name(defaultColor)
        names = [name for name, _rgb in styles]
        if chosen not in names:
            raise ValueError("defaultColor %r is not one of %s" % (defaultColor, ", ".join(names)))
        styles.sort(key=lambda item: 0 if item[0] == chosen else 1)

    written = {}
    for name, rgb in styles:
        full_name = "%s.jpg" % name
        preview_name = "%s_low.jpg" % name
        _save_rgb(rgb, os.path.join(out_dir, full_name), os.path.join(out_dir, preview_name), texture_edge)
        written[name] = {"preview": preview_name, "texture": full_name}

    first = styles[0][0]
    manifest = {
        "geometry": "mesh.ply",
        "preview": written[first]["preview"],
        "texture": written[first]["texture"],
        "origin": [int(v) for v in origin],
    }
    if len(written) > 1:
        manifest["styles"] = [name for name, _rgb in styles]
        manifest["textures"] = written
    with open(os.path.join(out_dir, "mesh.json"), "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2)
        handle.write("\n")
    manifest["frame"] = _frame(centered)
    return manifest
