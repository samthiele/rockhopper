"""
Load a textured OBJ and write a geometry-only PLY plus preview and full JPEG.
"""
import io
import json
import os
import shutil
import struct

import numpy as np


def loadOBJ(path):
    """
    Read an OBJ mesh. Vertex positions and texture coordinates are kept.
    Normals (``vn``) are ignored. Faces are returned as triangles of
    ``(vertex_index, uv_index)`` pairs (OBJ is 1-based; these are 0-based).

    Returns
    -------
    verts, uvs, faces, texture
        ``texture`` is the ``map_Kd`` path from the sibling MTL, or None.
    """
    verts = []
    uvs = []
    faces = []
    mtl_name = None
    with open(path, "r", encoding="utf-8", errors="replace") as handle:
        for line in handle:
            if line.startswith("v "):
                parts = line.split()
                verts.append((float(parts[1]), float(parts[2]), float(parts[3])))
            elif line.startswith("vt "):
                parts = line.split()
                uvs.append((float(parts[1]), float(parts[2])))
            elif line.startswith("f "):
                corners = []
                for token in line.split()[1:]:
                    bits = token.split("/")
                    vi = int(bits[0])
                    vi = vi - 1 if vi > 0 else len(verts) + vi
                    ti = None
                    if len(bits) > 1 and bits[1] != "":
                        ti = int(bits[1])
                        ti = ti - 1 if ti > 0 else len(uvs) + ti
                    corners.append((vi, ti))
                for k in range(1, len(corners) - 1):
                    faces.append((corners[0], corners[k], corners[k + 1]))
            elif line.startswith("mtllib ") and mtl_name is None:
                mtl_name = line.split(maxsplit=1)[1].strip()

    texture = None
    if mtl_name:
        mtl_path = os.path.join(os.path.dirname(os.path.abspath(path)), mtl_name)
        if os.path.exists(mtl_path):
            with open(mtl_path, "r", encoding="utf-8", errors="replace") as handle:
                for line in handle:
                    if line.startswith("map_Kd"):
                        texture = line.split(maxsplit=1)[1].strip()
                        if not os.path.isabs(texture):
                            texture = os.path.join(os.path.dirname(mtl_path), texture)
                        break
    return verts, uvs, faces, texture


def _apply_up(xyz, up):
    up = (up or "z").lower()
    if up == "z":
        return xyz
    if up == "y":
        # Y-up (typical OBJ) -> Z-up viewer: (x, y, z) -> (x, -z, y)
        return np.column_stack([xyz[:, 0], -xyz[:, 2], xyz[:, 1]])
    raise ValueError("up must be 'z' or 'y', got %r" % up)


def _weld(verts, uvs, faces):
    """One output vertex per unique (position, uv) corner."""
    lookup = {}
    xyz = []
    uv = []
    indices = []
    for tri in faces:
        row = []
        for vi, ti in tri:
            key = (vi, ti)
            slot = lookup.get(key)
            if slot is None:
                slot = len(xyz)
                lookup[key] = slot
                xyz.append(verts[vi])
                if ti is None:
                    uv.append((0.0, 0.0))
                else:
                    uv.append(uvs[ti])
            row.append(slot)
        indices.append(row)
    return np.asarray(xyz, dtype=np.float64), np.asarray(uv, dtype=np.float32), np.asarray(indices, dtype=np.int32)


def _write_ply(path, xyz, uv, faces):
    """Binary little-endian PLY: float32 xyz + uv, triangle indices. No normals or colours."""
    n = xyz.shape[0]
    m = faces.shape[0]
    header = (
        "ply\n"
        "format binary_little_endian 1.0\n"
        "element vertex %d\n"
        "property float x\n"
        "property float y\n"
        "property float z\n"
        "property float s\n"
        "property float t\n"
        "element face %d\n"
        "property list uchar int vertex_indices\n"
        "end_header\n" % (n, m)
    )
    with open(path, "wb") as handle:
        handle.write(header.encode("ascii"))
        vert = np.empty((n, 5), dtype="<f4")
        vert[:, 0:3] = xyz
        vert[:, 3:5] = uv
        handle.write(vert.tobytes())
        # uchar count + 3 int32 indices, packed tightly (no struct padding)
        handle.write(b"".join(
            struct.pack("<Biii", 3, int(tri[0]), int(tri[1]), int(tri[2]))
            for tri in faces
        ))


def _preview_jpeg(src, dest, limit=1_000_000):
    """Write a JPEG under ``limit`` bytes by subsampling with n = 1, 2, 4, ..."""
    try:
        from PIL import Image
    except ImportError:
        assert False, "Please install the Pillow library to build mesh previews (`pip install Pillow`)."
    image = Image.open(src).convert("RGB")
    n = 1
    blob = None
    while True:
        if n == 1:
            resized = image
        else:
            width, height = image.size
            resized = image.resize((max(1, width // n), max(1, height // n)), Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        resized.save(buf, format="JPEG", quality=85, optimize=True)
        blob = buf.getvalue()
        if len(blob) < limit or n >= 64 or min(resized.size) <= 32:
            break
        n *= 2
    with open(dest, "wb") as handle:
        handle.write(blob)
    return n, len(blob)


def _map_kd(mtl_path):
    """Return the ``map_Kd`` image path declared by an MTL file."""
    mtl_path = os.path.abspath(mtl_path)
    with open(mtl_path, "r", encoding="utf-8", errors="replace") as handle:
        for line in handle:
            if line.startswith("map_Kd"):
                texture = line.split(maxsplit=1)[1].strip()
                if not os.path.isabs(texture):
                    texture = os.path.join(os.path.dirname(mtl_path), texture)
                return texture
    raise ValueError("No map_Kd image in %s" % mtl_path)


def _store_jpeg(src, dest):
    """Copy a JPEG, or convert another image to JPEG quality 85."""
    ext = os.path.splitext(src)[1].lower()
    if ext in (".jpg", ".jpeg") and os.path.abspath(src) != os.path.abspath(dest):
        shutil.copy(src, dest)
        return
    try:
        from PIL import Image
    except ImportError:
        assert False, "Please install the Pillow library to build mesh textures (`pip install Pillow`)."
    Image.open(src).convert("RGB").save(dest, format="JPEG", quality=85, optimize=True)


def _paint_normal(rgb, uvs, normal):
    """Fill one triangle in an image whose row 0 is the top. ``v = 0`` is the bottom."""
    height, width = rgb.shape[:2]
    px = np.asarray(uvs[:, 0], dtype=np.float64) * (width - 1)
    py = (1.0 - np.asarray(uvs[:, 1], dtype=np.float64)) * (height - 1)
    minx = max(int(np.floor(px.min())), 0)
    maxx = min(int(np.ceil(px.max())), width - 1)
    miny = max(int(np.floor(py.min())), 0)
    maxy = min(int(np.ceil(py.max())), height - 1)
    if minx > maxx or miny > maxy:
        return
    xs = np.arange(minx, maxx + 1)
    ys = np.arange(miny, maxy + 1)
    gx, gy = np.meshgrid(xs, ys)
    x0, y0 = px[0], py[0]
    x1, y1 = px[1], py[1]
    x2, y2 = px[2], py[2]
    den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
    if abs(den) < 1e-8:
        return
    w0 = ((y1 - y2) * (gx - x2) + (x2 - x1) * (gy - y2)) / den
    w1 = ((y2 - y0) * (gx - x2) + (x0 - x2) * (gy - y2)) / den
    w2 = 1.0 - w0 - w1
    mask = (w0 >= -1e-4) & (w1 >= -1e-4) & (w2 >= -1e-4)
    color = np.clip((np.asarray(normal) * 0.5 + 0.5) * 255.0, 0, 255).astype(np.uint8)
    rgb[miny:maxy + 1, minx:maxx + 1][mask] = color


def bakeNormalTexture(obj_path, image_path, up="z"):
    """
    Bake an RGB picture of each face normal into the diffuse texture's UV layout.

    The colour is ``n * 0.5 + 0.5`` in the viewer's Z-up frame (after ``up``).
    Texels no triangle covers stay the neutral upward colour. A sibling MTL
    is written next to ``image_path`` with that image as ``map_Kd``, so the
    result can be passed to ``exportMesh(..., materials=...)``.
    """
    try:
        from PIL import Image
    except ImportError:
        assert False, "Please install the Pillow library to bake normal textures (`pip install Pillow`)."
    verts, uvs, faces, texture = loadOBJ(obj_path)
    if texture is None or not os.path.exists(texture):
        raise ValueError("No diffuse texture found for %s" % obj_path)
    with Image.open(texture) as image:
        width, height = image.size
    positions = _apply_up(np.asarray(verts, dtype=np.float64), up)
    uv = np.asarray(uvs, dtype=np.float64)
    # Neutral is +Z, which is (0.5, 0.5, 1).
    rgb = np.empty((height, width, 3), dtype=np.uint8)
    rgb[:] = (128, 128, 255)
    for tri in faces:
        idx = [corner[0] for corner in tri]
        ti = [corner[1] for corner in tri]
        if any(t is None for t in ti):
            continue
        points = positions[idx]
        normal = np.cross(points[1] - points[0], points[2] - points[0])
        length = np.linalg.norm(normal)
        if length < 1e-12:
            continue
        _paint_normal(rgb, uv[ti], normal / length)
    os.makedirs(os.path.dirname(os.path.abspath(image_path)) or ".", exist_ok=True)
    Image.fromarray(rgb, "RGB").save(image_path, format="JPEG", quality=85, optimize=True)
    stem = os.path.splitext(os.path.basename(image_path))[0]
    mtl_path = os.path.splitext(image_path)[0] + ".mtl"
    with open(mtl_path, "w", encoding="utf-8") as handle:
        handle.write(
            "newmtl %s\nKa 1 1 1\nKd 1 1 1\nKs 0 0 0\nillum 1\nmap_Kd %s\n"
            % (stem, os.path.basename(image_path))
        )
    return mtl_path


def exportMesh(obj_path, out_dir, up="z", materials=None):
    """
    Convert an OBJ (plus its MTL texture) into a mesh folder.

    Parameters
    ----------
    obj_path : str
        Path to the ``.obj`` file.
    out_dir : str
        Output directory. Created if needed. Contains ``mesh.ply``,
        ``texture.jpg``, ``texture_low.jpg`` and ``mesh.json``.
    up : str
        ``"z"`` (default) leaves coordinates unchanged. ``"y"`` treats the
        OBJ as Y-up and remaps it into the viewer's Z-up frame before centering.
    materials : str | list | None
        Extra MTL files. Each ``map_Kd`` is another JPEG on the same mesh,
        named from the MTL filename. With more than one image, ``mesh.json``
        lists ``styles`` and ``textures`` so the viewer can switch them.

    The PLY stores float32 positions and UVs only. An integer origin (the
    truncated mean of the vertices, same convention as point-cloud export)
    is subtracted and recorded in ``mesh.json``.
    """
    verts, uvs, faces, texture = loadOBJ(obj_path)
    if len(verts) == 0 or len(faces) == 0:
        raise ValueError("OBJ %s has no vertices or faces" % obj_path)
    xyz, uv, indices = _weld(verts, uvs, faces)
    xyz = _apply_up(xyz, up)
    origin = np.mean(xyz, axis=0).astype(int)
    xyz = (xyz - origin).astype(np.float32)

    os.makedirs(out_dir, exist_ok=True)
    _write_ply(os.path.join(out_dir, "mesh.ply"), xyz, uv, indices)

    if texture is None or not os.path.exists(texture):
        raise ValueError("No texture image found for %s (expected map_Kd in the MTL)" % obj_path)
    images = [("texture", texture)]
    extras = [materials] if isinstance(materials, (str, os.PathLike)) else list(materials or [])
    used = {"texture"}
    for mtl in extras:
        name = os.path.splitext(os.path.basename(os.fspath(mtl)))[0] or "material"
        base = name
        suffix = 2
        while name in used:
            name = "%s_%d" % (base, suffix)
            suffix += 1
        used.add(name)
        images.append((name, _map_kd(mtl)))

    written = {}
    for name, src in images:
        if not os.path.exists(src):
            raise ValueError("Texture image %s was not found" % src)
        full_name = "texture.jpg" if name == "texture" else "%s.jpg" % name
        preview_name = "texture_low.jpg" if name == "texture" else "%s_low.jpg" % name
        full_path = os.path.join(out_dir, full_name)
        _store_jpeg(src, full_path)
        _preview_jpeg(full_path, os.path.join(out_dir, preview_name))
        written[name] = {"preview": preview_name, "texture": full_name}

    manifest = {
        "geometry": "mesh.ply",
        "texture": written["texture"]["texture"],
        "preview": written["texture"]["preview"],
        "origin": [int(v) for v in origin],
    }
    if len(written) > 1:
        manifest["styles"] = [name for name, _src in images]
        manifest["textures"] = written
    with open(os.path.join(out_dir, "mesh.json"), "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2)
        handle.write("\n")
    return manifest
