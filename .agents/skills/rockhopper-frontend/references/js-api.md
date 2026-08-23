# JS API quick reference

## Tour (`index.json`) fields the viewer reads

| Field | Used by | Notes |
|-------|---------|--------|
| `sites` | Hopper, sidebars | `mediaType`, `mediaURL`, `pointSize`, `view`, `tabs`, `labels` |
| `synonyms` | Hopper, App | Alias → canonical site id; `start` required for entry |
| `tabs` | MarkdownSidebar | Global tabs + optional `_order` |
| `languages` | MarkdownSidebar | Index into each tab’s path array |
| `annotURL` | Hopper | Annotations fetch/save path |
| `cloudURL` | Hopper | Remote zarr base when not in dev |
| `devURL` | Hopper, MarkdownSidebar | Injected only by Flask in `devMode` |

## Zarr root attributes (from `exportZA`)

Consumed mainly in `PointStream`:

- `origin`, `resolution`, `total`, `chunks`
- `styles`, `stylesheet` — colour modes exposed in UI
- `groups` — highlight/mask toggles (`blend`, `color`, `iq`, `mask`)

Point arrays are float32 chunks `c0`, `c1`, … plus `chunk_centers`.

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

Labels may also appear as HTML overlays from `sites[site].labels[id] = { html, pos }`.

## Build scripts

```bash
npm start    # CRA dev server (viewer only; pair with Flask for full VFT edit loop)
npm run build
npm test
```
