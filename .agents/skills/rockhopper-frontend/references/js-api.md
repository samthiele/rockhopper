# JS API quick reference

## Tour (`index.json`) fields the viewer reads

| Field | Used by | Notes |
|-------|---------|--------|
| `sites` | Hopper, sidebars | `mediaType` (`cloud`, `mesh`, `photosphere`), `mediaURL`, optional `media` list, `pointSize`, `view`, `tabs`, `labels`, and `photoLabels` on a mixed stop |
| `synonyms` | Hopper, App | Alias → canonical site id; `start` required for entry |
| `tabs` | MarkdownSidebar | Global tabs + optional `_order` |
| `languages` | MarkdownSidebar | Index into each tab’s path array |
| `annotURL` | Hopper | Annotations fetch/save path |
| `cloudURL` | Hopper | Remote base for relative cloud and mesh URLs when not in dev |
| `devURL` | Hopper, MarkdownSidebar | Injected only by Flask in `devMode` |

A `media` item is `{ mediaType, mediaURL, name, pointSize?, view? }`. Several clouds or meshes share one scene and get a top-right eye each. A photosphere beside them is a mode, not another visible layer: the site `view` is the model camera, the photosphere item's `view` is the panorama, and `view.mode` of `"photosphere"` opens there. **Photosphere** / **3D View** is one lower-right button. Panorama labels are `sites[site].photoLabels`. Panorama drawings are `annotations[site].photosphere` (`lines`, `planes`, `traces`). Model drawings stay on the site root and in `labels`.

## Zarr root attributes (from `exportZA`)

Consumed mainly in `PointStream`:

- `origin`, `resolution`, `total`, `chunks`
- `styles`, `stylesheet` — colour modes exposed in UI
- `groups` — highlight/mask toggles (`blend`, `color`, `iq`, `mask`)

Point arrays are float32 chunks `c0`, `c1`, … plus `chunk_centers`.

## Mesh manifest (`mesh.json`, from `exportMesh`)

Fetched by `TexMesh`. Paths are relative to the manifest URL.

- `geometry` — binary PLY, float32 `x,y,z,s,t`, triangle `vertex_indices`. No normals or vertex colours
- `preview` — JPEG under 1 MB, shown as soon as it loads
- `texture` — full JPEG, replaces the preview with no status label
- `origin` — integer mean subtracted from the vertices. A mesh is placed at `origin - sceneOrigin` (the cloud origin when the site includes a cloud)
- `styles` — optional button names, in order. Present when a map has more than one JPEG
- `textures` — `{ name: { preview, texture } }` for those styles. `view.style` selects one on entry

Map meshes from `exportMap` use the same manifest. Texture coordinates are linear in X and Y.

`texture.flipY` stays `true` so OBJ `v = 0` is the bottom of the image.

## Colour stylesheet shapes

Stored on the zarr root (`stylesheet` + `styles`); applied client-side in `colourise` / `applyHighlight`. Full authoring guide: `.agents/skills/vft-development/references/stylesheets-and-groups.md`.

**Ternary (RGB channels):**

```js
{ color: { R: [iR, min, max], G: [iG, min, max], B: [iB, min, max] } }
```

**Ramp (chroma-js):**

```js
{ color: [bandIndex, { scale: 'viridis', limits: [vmin, vmax, nsteps] }] }
```

**Groups** (optional, after style): `{ blend, color, iq: [i, op, v] }` and/or `{ mask: [i, op, v] }`. Masked points → black → discarded in the fragment shader.

Pre-select via site `view.style` / `view.group` in `index.json`.
## Annotation payload (per site)

Typical structure initialized by Hopper:

```js
{ lines: [], planes: [], traces: [] }
```

Labels may also appear as HTML overlays from `sites[site].labels[id] = { html, pos }`. On a mixed stop the panorama uses `sites[site].photoLabels` and `annotations[site].photosphere` instead of those root keys.

## Build scripts

```bash
npm start    # CRA dev server (viewer only; pair with Flask for full VFT edit loop)
npm run build
npm test
```
