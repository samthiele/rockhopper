---
name: vft-development
description: >-
  Build and edit RockHopper virtual field trips (VFTs): markdown content,
  index.json / annotations.json structure, Python rockhopper.VFT API, PLY→zarr
  point-cloud export, textured OBJ meshes, languages, tabs, sites, photospheres, and local Flask
  development server. Use for tour authoring, content structure, cloud
  conversion, or deployment layout — not for React viewer internals unless
  the task also needs rockhopper-frontend.
---

# VFT development

Use this skill for **tour authoring**: content, structure, and the Python interface. For React/Three.js viewer changes, also load `rockhopper-frontend`. For educational prose tone, load `vft-writing` and confirm audience first.

## What a VFT is

A VFT directory is a static web root. Minimum useful layout:

```
my_tour/
  index.html          # from rockhopper.ui (copied on VFT init)
  index.json          # tour structure (sites, tabs, languages, URLs)
  annotations.json    # lines / planes / traces / labels per site
  md/                 # markdown pages (*_en.md, *_de.md, …)
  img/                # photospheres and figures
  static/, icon/, …   # UI assets from rockhopper.ui
```

Point-cloud streams usually live in a separate `cloud_path` (e.g. `*.zarr` folders) referenced by `cloudURL` or served locally via the Flask server.

For small / simple tours, these static `.zarr` files can be served via GitHub Pages. Larger files require hosting on more appropriate static file-servers. The (local) Flask server is only for local development and testing. 

## Python API (primary interface)

Public exports (`rockhopper/__init__.py`):

- `VFT` — create/structure tours + local editable server
- `loadPLY`, `savePLY`, `exportZA` — point-cloud I/O and streaming export
- `loadOBJ`, `exportMesh` — textured OBJ → PLY mesh folder on `cloud_path`
- `exportMap` — GeoTIFF or lon/lat box → terrain mesh folder on `cloud_path`

### Typical workflow

```python
from rockhopper import VFT, loadPLY, exportZA

vft = VFT(vft_path="my_tour", cloud_path="my_clouds", overwrite=False, devMode=True)
vft.setLanguages(["en"])          # do this before addTab
vft.addCloud("outcrop", "outcrop", cloud="data/outcrop.ply", resolution=0.05)
vft.addPhotosphere("camp", "photos/camp_ps.jpg")
vft.addMesh("outcrop_mesh", "outcrop_mesh", obj="data/outcrop.obj", up="z")  # up="y" for Y-up OBJ
vft.addMap("island", "island", base="data/island.tif", textures=["esri", "elevation"], defaultColor="esri", zoom=2)
vft.addTab("Geology", site="outcrop")   # site-local tab → md/outcrop/geology_en.md
vft.addTab("Help")                      # global tab → md/help_en.md
vft.start(port=4002)                    # http://127.0.0.1:4002 — double-click tabs to edit
# vft.stop()
```

### `VFT` methods (what they do)

| Method | Role |
|--------|------|
| `setLanguages([...])` | Language codes; MD files use `name_{lang}.md` |
| `addSite(name, mediaURL, mediaType=…)` | Register a stop (`cloud`, `mesh`, or `photosphere`) |
| `addCloud(site, name, cloud=…, stylesheet=…, groups=…)` | PLY/array → `{name}.zarr` + site |
| `addPhotosphere(site, image, …)` | Copy panorama into `img/{site}/`. On a new site this is a photosphere stop. On a site that already has a cloud or mesh, it is attached as a second view mode |
| `addMesh(site, name, obj=…, up="z", materials=None)` | OBJ → `{name}/mesh.ply` + preview/full JPEG + `mesh.json`. Extra MTL files become more JPEGs the viewer can switch. `up="y"` remaps Y-up OBJ to Z-up |
| `addMap(site, name, base, dem=None, textures=None, …)` | GeoTIFF or `(min_lon, max_lon, min_lat, max_lat)` → terrain mesh. `verticalExaggeration` defaults to 2.5. `defaultColor` names the layer shown first |
| `addTab(name, site=None)` | Create MD stubs + register tab paths in index |
| `start` / `stop` | Flask thread; in `devMode` enables `POST /update` |

Site names are **lowercased**. First site gets synonym `"start"` → that site.

### Point clouds

- Input: PLY via `loadPLY`, or `(N, d)` array with **first six columns** `x,y,z,r,g,b` (extra bands optional).
- `exportZA` / `addCloud`: spatial culling by `resolution`, chunking, Blosc compression, metadata (`origin`, `stylesheet`, `groups`, …).
- **Multi-symbology (core novelty):** one zarr cloud can expose many colour styles and highlight/mask groups without duplicate geometry. Styles live in zarr `.zattrs` and become UI toggles. See **`references/stylesheets-and-groups.md`** (Penguin + La Palma examples).
- **Stylesheet:** ternary RGB maps and/or chroma colour-ramps on any column.
- **Groups:** highlight (`iq`) or hide (`mask`) by attribute conditions.
- Optional `styles=[...]` sets button order/subset; `index.json` site `view.style` / `view.group` pre-selects on entry.

### Textured meshes

`addMesh` / `exportMesh` write a folder on `cloud_path` (same static server as `.zarr`):

```
{name}/
  mesh.json          # geometry, texture, preview, origin
  mesh.ply           # binary float32 x,y,z,s,t and triangle indices
  texture_low.jpg    # preview, under 1 MB
  texture.jpg        # original full-resolution JPEG
```

- `up="z"` (default) keeps OBJ axes. `up="y"` remaps `(x, y, z)` to `(x, -z, y)` before centering. An unedited Scaniverse OBJ is Y-up. The demo gabbro file has been edited into Z-up and is exported with `up="z"`.
- No normals and no vertex colours. UVs are per unique `(vertex, uv)` corner. The viewer keeps `texture.flipY` on so `v = 0` is the bottom of the image.
- `origin` is the integer mean of the vertices (same convention as `exportZA`) and is subtracted from the PLY. The viewer draws those centered coordinates.
- The preview JPEG is subsampled with Pillow by `n = 1, 2, 4, …` until the file is under 1 MB. The viewer shows it immediately, then replaces it with `texture.jpg`. That swap has no status label.
- A site with several clouds or meshes uses a `media` array instead of a single `mediaType` / `mediaURL`. The viewer then shows a top-right eye toggle. On a mixed stop the cloud stays put and each mesh is shifted by `mesh origin − cloud origin`.
- A photosphere added to a cloud or mesh site (or the other way around) is also stored in `media`, but the viewer does not draw it in the same scene. **Photosphere** in the lower-right opens it, and the button then reads **3D View**. The eye list stays in the top-right for the clouds and meshes. The site `view` stays the model camera. The photosphere item carries its own `view`. `view.mode` of `"photosphere"` opens in the panorama. Annotations for the panorama are stored under `annotations[site].photosphere`, and its labels under `photoLabels`, because the two views do not share coordinates.

```python
vft.addMesh("outcrop", "outcrop", obj="data/outcrop.obj", up="z")
vft.addPhotosphere("outcrop", "photos/camp.jpg")  # attaches; does not replace the mesh
```
- `materials` is one extra MTL path, or a list of them. The OBJ's own `map_Kd` stays the first style and is still written as `texture.jpg` / `texture_low.jpg`. Each extra MTL adds its `map_Kd` as `{stem}.jpg` plus a preview under 1 MB. The style name is the MTL filename stem. With more than one image, `mesh.json` gains `styles` and `textures` in the same shape as a map, and the viewer shows the same top-left buttons. Geometry and UVs stay one PLY. `view.style` names the style shown on entry.
- Those extra images are ordinary colour JPEGs. The viewer does not light the mesh, so a normal style is an RGB picture of the face normal (`n * 0.5 + 0.5`), not a tangent-space normal map. `bakeNormalTexture(obj, image, up="z")` rasterises that picture into the diffuse texture's UV layout (`v = 0` at the bottom; uncovered texels stay the upward colour) and writes a sibling MTL whose `map_Kd` points at the image.

```python
bakeNormalTexture("data/gabbro.obj", "data/gabbro_normals.jpg", up="z")
vft.addMesh("meshes", "gabbro", obj="data/gabbro.obj", up="z",
            materials=["data/gabbro_normals.mtl"])
```

The demo gabbro mesh does this. Its buttons are **texture** and **gabbro_normals**.

Demo: `demo/demo_clouds/gabbro/` and the `meshes` / `overlay` stops in `demo/demo_tour/`.

### Maps

`addMap` / `exportMap` write the same kind of folder as a mesh (`mesh.ply`, JPEGs, `mesh.json`). `rasterio` is imported only when a map is built.

- `base` is a GeoTIFF (its bounds and image are the map) or `(min_lon, max_lon, min_lat, max_lat)`. A bounding box is drawn in EPSG:3857 and the first colour is a viridis elevation ramp.
- `dem` is an elevation GeoTIFF. `None` fetches Mapzen terrarium tiles. Nearly planar blocks are merged; `tolerance` is the vertical error in metres (starts at 1). `resolution` forces a uniform grid instead.
- `textures` adds more colour layers: `"esri"`, `"google"`, `"elevation"`, or another GeoTIFF. Omitted, a GeoTIFF also gets Esri imagery and a bounding box does not. Each layer is an RGB JPEG (quality 85, long edge ≤ 4096) plus a preview under 1 MB. Texture coordinates are just X and Y across the rectangle.
- `verticalExaggeration` multiplies elevation after simplification. The default is 2.5.
- `zoom` offsets the automatic DEM and imagery tile level. ``0`` keeps it, ``+2`` fetches two levels finer, and ``-1`` one level coarser. Terrarium elevation stops at level 15.
- `defaultColor` names the layer listed first and shown on entry (`"esri"`, `"google"`, `"elevation"`, or a GeoTIFF stem). Omit it to keep the base image first, or the elevation ramp for a bounding box.
- With more than one JPEG, `mesh.json` lists `styles` and `textures`. `view.style` selects the one shown on entry. The viewer uses the same top-left buttons as a point-cloud stylesheet.

Demo: `demo/demo_clouds/island/` and the `island` stop. It opens on `esri`, with `island` and `elevation` as the other colours.

### Utilities

`rockhopper.utils.equirect_to_latlon(...)` — six cube faces → one equirectangular photosphere (needs Pillow).

## `index.json` (core of every VFT)

`index.json` glues media, markdown, languages, navigation, and camera poses so the front-end can serve the tour. **Read `references/index-and-markdown.md` before non-trivial edits.**

**Reference tour:** [LaPalmaVFT](https://github.com/samthiele/LaPalmaVFT) — full multi-site VFT ([live](https://samthiele.github.io/LaPalmaVFT/#/start), [`index.json`](https://github.com/samthiele/LaPalmaVFT/blob/main/index.json)). Smaller example: `demo/demo_tour/`.

Top-level keys:

| Key | Role |
|-----|------|
| `sites` | Stops: `mediaType` (`cloud`\|`mesh`\|`photosphere`), `mediaURL`, optional `pointSize`, `view`, site `tabs`, `labels`. Optional `media` array for several clouds or meshes (eye toggle). A photosphere in that list beside a cloud or mesh is a second view mode, with its own `view`; panorama labels live in `photoLabels` |
| `synonyms` | URL alias → site id; `#/start` must resolve |
| `tabs` | Global sidebar tabs + optional `_order` |
| `languages` | Ordered codes; each tab path list is indexed the same way |
| `annotURL` | Path to drawn annotations JSON |
| `cloudURL` | Base URL for relative cloud and mesh `mediaURL`s when deployed |

Site `view`: `{ "pos": [x,y,z], "tgt": [x,y,z] }`, optional `style` (a point-cloud stylesheet name, or a mesh/map texture style).  
`labels`: `{ "labelN": { "html": "...", "pos": [x,y,z] } }` — often used for `./#nextsite` navigation (see La Palma).  
Never persist `devURL`; Flask injects it when `devMode=True`.

## Markdown conventions

- Paths: global `./md/{name}_{lang}.md`; site-local `./md/{site}/{name}_{lang}.md`
- GFM supported (tables, task lists, images, …)
- **Quizzes**: task-list items; checked item = correct answer (see multimedia demo)
- **Audio / YouTube** blockquote commands:

```markdown
> audio https://example.com/clip.mp3
> youtube https://www.youtube.com/embed/VIDEO_ID
```

- In-browser edit (dev): double-click tab → edit → `Shift+Enter` saves via `/update`
- Notebook tab is editable even without full dev mode

When writing educational copy, follow **vft-writing** (ask audience first).

## Annotations

`annotations.json` is per-site geometry/labels (lines, planes, traces). Labels can also live under `sites[site].labels` in `index.json` as HTML + `pos`. Prefer existing demo patterns in `demo/demo_tour/`. Annotations are typically created and saved by the developer using the front-end GUI (React app) in local dev-mode. 

## Deployment sketch

1. Host zarr and mesh folders under a stable base URL → set `cloudURL`
2. Host tour folder (md + json + static UI) on any static host (often GitHub Pages)
3. Test with `devMode=False` before publishing

## References in this skill

- `references/index-and-markdown.md` — full `index.json` structure (La Palma walkthrough)
- `references/stylesheets-and-groups.md` — multi-style / group visualisation of one zarr cloud
- Production example: [LaPalmaVFT](https://github.com/samthiele/LaPalmaVFT)
- In-repo demo: `demo/demo_tour/` + `demo/demo_clouds/Penguin.zarr`, `gabbro/`, and `island/`
- Tutorial notebook: `examples/tutorial.ipynb`
