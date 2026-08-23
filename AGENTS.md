# RockHopper — Agent Guide

RockHopper builds **web-based virtual field trips (VFTs)**: streamable 3D point clouds (or photospheres) plus explanatory markdown. Work falls into two tracks. Decide which applies **before** digging into code.

## Track triage (do this first)

| Track | Typical work | What matters |
|-------|--------------|--------------|
| **VFT development** | Tour content, sites, languages, annotations, hosting a tour | **`index.json`** (glues the tour), markdown, `annotations.json`, Python `rockhopper.VFT` API, zarr export |
| **RockHopper development** | Viewer, streaming, editing UX, packaging | React app in `src/`, Three.js / zarr streaming, Flask dev server, shipping built UI into `rockhopper/ui/` |

**Default bias:** most requests are **VFT development** (content + Python tooling). Only treat a task as RockHopper (platform) development when it clearly changes the viewer (React front-end), build pipeline, or Python package internals.

### Load the matching skill

1. **VFT development** → read `.agents/skills/vft-development/SKILL.md`
2. **RockHopper (platform) development** → also read `.agents/skills/rockhopper-frontend/SKILL.md` (JS API + React layout)
3. **Any new or rewritten VFT markdown / educational text** → read `.agents/skills/vft-writing/SKILL.md` and **ask for audience** before drafting

## Repo map (short)

```
rockhopper/          Python package (VFT, clouds, Flask server)
  clouds.py          PLY I/O, exportZA → streamable .zarr
  server.py          VFT class + local /update dev server
  ui/                Built React assets copied into each tour
src/                 React source (edit here for platform work)
demo/demo_tour/     Small example VFT (index.json, md/, img/, …)
examples/            tutorial.ipynb — primary authoring workflow
```

**Full production VFT example:** [LaPalmaVFT](https://github.com/samthiele/LaPalmaVFT) ([live](https://samthiele.github.io/LaPalmaVFT/#/start)). Study its root `index.json` when structuring multi-site tours — details in `.agents/skills/vft-development/references/index-and-markdown.md`.

**Multi-style point clouds:** one `.zarr` can carry several colour styles and highlight/mask groups (vs single-symbology viewers). See `.agents/skills/vft-development/references/stylesheets-and-groups.md`.

## Quick commands

```bash
# Python package (editable)
pip install -e .

# React viewer (platform work)
npm start          # dev
npm run build      # then copy build output into rockhopper/ui/ when shipping
```

VFT authors usually follow `examples/tutorial.ipynb`: create a `VFT(vft_path, cloud_path)`, add clouds/sites/tabs, then `vft.start()` for in-browser editing.

## Hard boundaries
- Do **not** hand-edit minified bundles under `*/static/js/` — change `src/` and rebuild.
- Do **not** commit `devURL` into `index.json` (dev server injects it at runtime).
- Prefer editing tour content via markdown + `index.json` over inventing new viewer features unless directly asked.
