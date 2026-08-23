---
name: rockhopper-frontend
description: >-
  Develop the RockHopper React viewer and JS-facing behaviour: App routing,
  Hopper split UI, markdown sidebar editing, Three.js scene, photospheres,
  zarr point streaming (PointStream), stylesheets/groups colouring, annotation
  drawing, and Flask /update integration. Use when changing src/, the built
  rockhopper/ui assets, viewer UX, or streaming/rendering — not for routine
  tour markdown/content authoring alone.
---

# RockHopper frontend (platform) development

Load this skill when the task changes the **viewer** or how the JS app interprets tour data. For tour content / Python packaging of VFTs, prefer `vft-development`. Rebuild and refresh `rockhopper/ui/` when shipping Python-package UI updates.

## Architecture

```
src/App.js                 Load ./index.json → HashRouter → /:site → Hopper
src/components/
  Hopper.js                Site resolution, media URL, SplitScreen shell
  MarkdownSidebar.js       Tabs, languages, MD render/edit, quizzes, audio/youtube
  SplitScreen.js           Resizable left (MD) / right (3D)
  ThreeScene.js            Three.js camera, controls, annotation interaction
  PointStream.js           Zarr chunk streaming + colourise / highlight / mask
  Photosphere.js           Equirectangular panorama as scene background
```

Built output is what users of the Python package get: create-react-app `build/` is copied into `rockhopper/ui/` (and into each new tour via `rockhopper.ui.copyTo`).

### Stack

React 18, `react-router-dom` (HashRouter), Three.js, `zarr`, `chroma-js`, `react-markdown` + `remark-gfm`, `@react-three/fiber` (dependency present; core path uses Three directly in these components).

## Runtime tour object (`index.json`)

`App` fetches `./index.json`, stores it in a ref, and adds `synonyms[site]=site` for every site. In Flask `devMode`, the server also injects `devURL` (e.g. `http://127.0.0.1:4002`) into the JSON response only.

`Hopper` resolves `params.site` through `tour.synonyms`, then:

1. Ensures `annotations[site]` exists (`lines`, `planes`, `traces`)
2. Applies `tour.sites[site].view` to camera / controls if present
3. Builds media URL:
   - **cloud**: relative → `devURL` or `cloudURL` prefix; absolute http(s) unchanged
   - **photosphere**: path under the tour static root
4. Renders `PhotosphereViewer` or `PointStream` + `ThreeScene` + `MarkdownSidebar`

## Component responsibilities (API surface)

### `Hopper`

Props: `{ tour }`. Owns `three` ref (`{ pointSize, camera, controls, … }`), annotation state, `currentMedia`, `fixedCamera` (true for photospheres).

### `MarkdownSidebar`

Props: `{ tour, site, annotations, setAnnotations, three }`.

- Merges site tabs + global tabs; respects `_order`
- Language index selects which path in each tab’s file list
- Double-click edit when `tour.devURL` **or** active tab is Notebook; `Shift+Enter` POSTs to `./update`
- Custom MD: image→figure+caption; checkbox lists→quiz; blockquotes starting with `audio` / `youtube`→embeds
- Appends annotation-derived markdown into Notebook when annotations exist

### `PointStream`

Props: `{ tour, site, three, init, currentMedia }`.

- Opens zarr group at `currentMedia`; reads attrs (`origin`, `resolution`, `stylesheet`, `styles`, `groups`, chunk count, …)
- Streams chunks with spacing (`LOAD_INTERVAL`); colours via `colourise` (ternary or chroma ramp)
- Applies highlight/mask groups from zarr metadata
- Sets `three.current.pointSize` from site `pointSize` / resolution

### `ThreeScene`

Camera, orbit controls, picking, annotation drawing (Cmd/Ctrl+click patterns as documented in the demo tour), label HTML overlays. Syncs annotations back through React state; when `tour.devURL` is set, `Hopper` POSTs `annotations.json` on change.

### Dev update contract

`POST /update` body:

```json
{ "filename": "./md/notes_en.md", "content": "...", "dtype": "application/text" }
```

For JSON, `dtype` includes `json` and `content` is a JSON string that the server parses and pretty-writes via `write_json`.

## Platform change checklist

1. Edit under `src/` (never hand-patch minified `static/js/*.js`)
2. `npm start` to verify; `npm run build` for production assets
3. If the Python package should ship the change: copy/sync build into `rockhopper/ui/` (same assets tours receive on `VFT(..., overwrite=True)`)
4. Keep behaviour compatible with existing `index.json` tours unless a breaking change is explicitly requested
5. Preserve hash routing (`#/start`) — static hosts rely on it

## Do not confuse

| Concern | Where |
|---------|--------|
| Tour text / structure | VFT md + `index.json` + Python `VFT` |
| How MD is rendered / edited | `MarkdownSidebar.js` |
| How clouds look / stream | `PointStream.js` + zarr attrs from `exportZA` |
| How sites are chosen | `App.js` + `Hopper.js` + synonyms |

## Reference

See `references/js-api.md` for prop/data quick reference.
