---
name: rockhopper-frontend
description: >-
  Develop the RockHopper React viewer and JS-facing behaviour: App routing,
  Hopper split UI, markdown sidebar editing, Three.js scene, photospheres,
  zarr point streaming (PointStream), textured meshes (TexMesh), stylesheets/groups
  colouring, annotation drawing, and Flask /update integration. Use when changing src/, the built
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
  TexMesh.js               Textured PLY mesh (preview JPEG, then full JPEG)
  Photosphere.js           Inward equirectangular sphere (radius 100)
  SceneReset.js            Clears the scene before the next content objects load
  sceneFrame.js            Shared origin so a cloud and a mesh line up
```

Built output is what users of the Python package get: create-react-app `build/` is copied into `rockhopper/ui/` (and into each new tour via `rockhopper.ui.copyTo`).

### Stack

React 18, `react-router-dom` (HashRouter), Three.js, `zarr`, `chroma-js`, `react-markdown` + `remark-gfm`, `@react-three/fiber` (dependency present; core path uses Three directly in these components).

## Runtime tour object (`index.json`)

`App` fetches `./index.json`, stores it in a ref, and adds `synonyms[site]=site` for every site. In Flask `devMode`, the server also injects `devURL` (e.g. `http://127.0.0.1:4002`) into the JSON response only.

`Hopper` resolves `params.site` through `tour.synonyms`, then:

1. Ensures `annotations[site]` exists (`lines`, `planes`, `traces`)
2. Applies `tour.sites[site].view` to camera / controls if present
3. Builds one content list from `media` (or the single `mediaType` / `mediaURL`) and resolves URLs:
   - **cloud** and **mesh**: relative → `devURL` or `cloudURL` prefix; absolute http(s) unchanged
   - **photosphere**: path under the tour static root
4. Renders those objects as children of `ThreeScene` (`PointStream`, `TexMesh`, `Photosphere`). Several clouds or meshes get a top-right eye list. A photosphere beside a cloud or mesh is a mode switch (model or panorama), not a second visible layer. Hidden objects are not picked.

## Component responsibilities (API surface)

### `Hopper`

Props: `{ tour }`. Owns `three` ref (`{ pointSize, camera, controls, frame, … }`) and annotation state. `fixCamera` is true only when every object on the site is a photosphere. A site that also has a cloud or mesh keeps the orbit scene mounted and switches mode instead. Content components are children of `ThreeScene`, after `SceneReset`.

### `MarkdownSidebar`

Props: `{ tour, site, annotations, setAnnotations, three }`.

- Merges site tabs + global tabs; respects `_order`
- Language index selects which path in each tab’s file list
- Double-click edit when `tour.devURL` **or** active tab is Notebook; `Shift+Enter` POSTs to `./update`
- Custom MD: image→figure+caption; checkbox lists→quiz; blockquotes starting with `audio` / `youtube`→embeds
- Appends annotation-derived markdown into Notebook when annotations exist

### `PointStream`

Props: `{ tour, site, three, init, url, name, frameCamera, pointSize }`.

- Opens zarr group at `url`; reads attrs (`origin`, `resolution`, `stylesheet`, `styles`, `groups`, chunk count, …)
- Streams chunks with spacing (`LOAD_INTERVAL`); colours via `colourise` (ternary or chroma ramp)
- Applies highlight/mask groups from zarr metadata
- Sets `three.current.pointSize` from the media item, else the site `pointSize`, else zarr `resolution`
- Publishes the zarr `origin` as the scene frame. The cloud itself stays at the origin in centered coordinates

### `TexMesh`

Props: `{ tour, site, three, init, url, name, frameCamera, setPointSize }`.

- Fetches `mesh.json` (`geometry`, `preview`, `texture`, `origin`). One image uses `preview` then `texture` and draws no style buttons
- Several images use the same `styles` and `textures` lists a map writes. Top-left buttons swap the JPEG, and `view.style` selects the initial name when it is one of those styles. The extra images share one PLY and one set of UVs. The material stays unlit `MeshBasicMaterial`: a "normal" style is an RGB picture of the surface normal (`n * 0.5 + 0.5`), not a tangent-space map on a lit shader
- `PLYLoader` reads float32 `x,y,z,s,t` (no normals, no vertex colours). The preview JPEG is applied immediately and replaced by the full JPEG when that fetch finishes. There is no on-screen label for the swap
- Unlit `MeshBasicMaterial`, `DoubleSide`, so a click hits either winding. `userData.pickable` and `blockDelete` match point clouds, so lines, planes, and orbit-recentering use the same raycaster
- `texture.flipY` stays `true`. OBJ UVs put `v = 0` at the bottom of the image; turning the flip off samples the gray padding between atlas charts
- The mesh is drawn at `origin - sceneOrigin`. Scene origin is the first cloud's origin when the site has a cloud, otherwise the first mesh origin. `setPointSize` is true only when the site has no cloud
- Only the first content object frames the camera

### `ThreeScene`

Camera, orbit controls, picking, annotation drawing (Cmd/Ctrl+click patterns as documented in the demo tour), label HTML overlays. `SceneReset` clears the scene before sibling content effects add clouds or meshes; annotation and label effects then redraw. Several clouds or meshes show a top-right eye list. Their colour buttons sit in one top-left row, one group beside the next. A mixed model and photosphere adds one lower-right button, **Photosphere** or **3D View**. Photo mode hides the eye list and the colour buttons, locks pan and dolly, widens the field of view (the wheel changes it), raises the far plane (a point cloud otherwise sets it from its own size, which clips the panorama sphere), and hides the model. Model mode restores Z-up orbit and hides the sphere. Switching mode refreshes the orbit-control up axis, because that quaternion is fixed when the controls are created. The scene is not rebuilt on that switch. Model annotations stay in `annotations[site].lines/planes/traces` and `labels`. Panorama annotations use `annotations[site].photosphere` and `photoLabels`. Hidden objects are skipped by the raycaster. Syncs annotations back through React state; when `tour.devURL` is set, `Hopper` POSTs `annotations.json` on change.

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
| How textured meshes look | `TexMesh.js` + `mesh.json` from `exportMesh` |
| How sites are chosen | `App.js` + `Hopper.js` + synonyms |

## Reference

See `references/js-api.md` for prop/data quick reference.
