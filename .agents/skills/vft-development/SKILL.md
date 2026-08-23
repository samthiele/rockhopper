---
name: vft-development
description: >-
  Build and edit RockHopper virtual field trips (VFTs): markdown content,
  index.json / annotations.json structure, Python rockhopper.VFT API, PLY→zarr
  point-cloud export, languages, tabs, sites, photospheres, and local Flask
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

### Typical workflow

```python
from rockhopper import VFT, loadPLY, exportZA

vft = VFT(vft_path="my_tour", cloud_path="my_clouds", overwrite=False, devMode=True)
vft.setLanguages(["en"])          # do this before addTab
vft.addCloud("outcrop", "outcrop", cloud="data/outcrop.ply", resolution=0.05)
vft.addPhotosphere("camp", "photos/camp_ps.jpg")
vft.addTab("Geology", site="outcrop")   # site-local tab → md/outcrop/geology_en.md
vft.addTab("Help")                      # global tab → md/help_en.md
vft.start(port=4002)                    # http://127.0.0.1:4002 — double-click tabs to edit
# vft.stop()
```

### `VFT` methods (what they do)

| Method | Role |
|--------|------|
| `setLanguages([...])` | Language codes; MD files use `name_{lang}.md` |
| `addSite(name, mediaURL, mediaType=…)` | Register a stop (`cloud` or `photosphere`) |
| `addCloud(site, name, cloud=…, stylesheet=…, groups=…)` | PLY/array → `{name}.zarr` + site |
| `addPhotosphere(site, image, …)` | Copy panorama into `img/{site}/` + site |
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

### Utilities

`rockhopper.utils.equirect_to_latlon(...)` — six cube faces → one equirectangular photosphere (needs Pillow).

## `index.json` (core of every VFT)

`index.json` glues media, markdown, languages, navigation, and camera poses so the front-end can serve the tour. **Read `references/index-and-markdown.md` before non-trivial edits.**

**Reference tour:** [LaPalmaVFT](https://github.com/samthiele/LaPalmaVFT) — full multi-site VFT ([live](https://samthiele.github.io/LaPalmaVFT/#/start), [`index.json`](https://github.com/samthiele/LaPalmaVFT/blob/main/index.json)). Smaller example: `demo/demo_tour/`.

Top-level keys:

| Key | Role |
|-----|------|
| `sites` | Stops: `mediaType` (`cloud`\|`photosphere`), `mediaURL`, optional `pointSize`, `view`, site `tabs`, `labels` |
| `synonyms` | URL alias → site id; `#/start` must resolve |
| `tabs` | Global sidebar tabs + optional `_order` |
| `languages` | Ordered codes; each tab path list is indexed the same way |
| `annotURL` | Path to drawn annotations JSON |
| `cloudURL` | Base URL for relative cloud `mediaURL`s when deployed |

Site `view`: `{ "pos": [x,y,z], "tgt": [x,y,z] }`, optional `style` (zarr stylesheet name).  
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

1. Host zarr under a stable base URL → set `cloudURL`
2. Host tour folder (md + json + static UI) on any static host (often GitHub Pages)
3. Test with `devMode=False` before publishing

## References in this skill

- `references/index-and-markdown.md` — full `index.json` structure (La Palma walkthrough)
- `references/stylesheets-and-groups.md` — multi-style / group visualisation of one zarr cloud
- Production example: [LaPalmaVFT](https://github.com/samthiele/LaPalmaVFT)
- In-repo demo: `demo/demo_tour/` + `demo/demo_clouds/Penguin.zarr`
- Tutorial notebook: `examples/tutorial.ipynb`
