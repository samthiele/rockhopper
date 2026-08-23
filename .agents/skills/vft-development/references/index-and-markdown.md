# `index.json` — the core of a VFT

`index.json` is the **glue** that binds media, markdown, languages, navigation, and camera poses into one tour the front-end can serve. The React viewer loads this file first (`./index.json`); almost every other path in a VFT is reached through it.

Treat edits to `index.json` as structural: wrong paths, missing languages, or a broken `start` synonym will make sites or tabs vanish even if the markdown files exist.

## Canonical full example

**[LaPalmaVFT](https://github.com/samthiele/LaPalmaVFT)** is a complete, production RockHopper tour (magmatic plumbing / Caldera Taburiente). Agents should study it when designing multi-site VFTs:

| Resource | URL |
|----------|-----|
| Live tour | https://samthiele.github.io/LaPalmaVFT/#/start |
| Repository | https://github.com/samthiele/LaPalmaVFT |
| Root index | https://github.com/samthiele/LaPalmaVFT/blob/main/index.json |
| Authoring notebook | https://github.com/samthiele/LaPalmaVFT/blob/main/build_vft.ipynb |

Smaller / meta example in this repo: `demo/demo_tour/index.json`.

La Palma’s root shape (abbreviated):

```json
{
  "annotURL": "./annotations.json",
  "cloudURL": "https://storage.googleapis.com/rockhopper",
  "languages": ["en", "es", "de"],
  "sites": { "...": { } },
  "synonyms": { "start": "start", "taburiente": "taburiente", "...": "..." },
  "tabs": {
    "Help": ["./md/help_en.md", "./md/help_es.md", "./md/help_de.md"],
    "Notebook": ["./md/notes_en.md", "./md/notes_es.md", "./md/notes_de.md"],
    "References": ["./md/references_en.md", "./md/references_es.md", "./md/references_de.md"],
    "_order": ["Notebook", "References", "Help"]
  }
}
```

---

## Top-level keys

| Key | Required | Role |
|-----|----------|------|
| `sites` | yes | Map of **site id → stop definition** (media + optional local tabs/labels/view) |
| `synonyms` | yes (practically) | URL alias → canonical site id. Must resolve `#/start` |
| `tabs` | recommended | **Global** sidebar tabs (Help, Notebook, References, …) |
| `languages` | recommended | Ordered language codes; indexes into every tab’s path array |
| `annotURL` | recommended | Path to `annotations.json` (lines/planes/traces) |
| `cloudURL` | for deployed clouds | Base URL prepended to relative cloud `mediaURL`s |
| `devURL` | **never commit** | Injected only by the Flask server when `devMode=True` |

How the front-end uses them:

1. Fetch `index.json`
2. Resolve route `#/{alias}` via `synonyms` → site id
3. Load that site’s media (`cloud` via `cloudURL`/`devURL`, or photosphere path)
4. Build sidebar from **site tabs ∪ global tabs**, picking the MD path for the active language index

---

## `languages`

Ordered list, e.g. `["en","es","de"]`.

- Index `0` is the default language in the UI.
- Every tab’s file list must have **one path per language**, same order.
- Filenames conventionally end with `_{lang}.md`.

---

## `tabs` (global)

Object mapping **display name → list of markdown paths**.

```json
"tabs": {
  "Notebook": ["./md/notes_en.md", "./md/notes_es.md", "./md/notes_de.md"],
  "References": ["./md/references_en.md", "./md/references_es.md", "./md/references_de.md"],
  "Help": ["./md/help_en.md", "./md/help_es.md", "./md/help_de.md"],
  "_order": ["Notebook", "References", "Help"]
}
```

- Shown on **every** site (merged with site-local tabs).
- `_order` (optional) controls button order; omit to use object key order.
- Notebook is special: editable even without `devURL`.

---

## `sites`

Each key is a **lowercase site id** (also used in URLs: `#/taburiente`). Value fields:

| Field | Type | Meaning |
|-------|------|---------|
| `mediaType` | `"cloud"` \| `"photosphere"` | Which viewer to use |
| `mediaURL` | string | Cloud: zarr name or URL. Photosphere: path under the tour (e.g. `./img/hoyonegro/ps.jpg`) |
| `pointSize` | number | Cloud rendering size (often ≈ export `resolution`; La Palma island overview uses `30`, cliffs `0.1`) |
| `view` | object | Initial camera: `pos` `[x,y,z]`, `tgt` `[x,y,z]`; optional `style` to pick a cloud stylesheet key |
| `tabs` | object | **Site-local** tabs (same shape as global `tabs`) |
| `labels` | object | HTML billboards in 3D: `labelN: { html, pos }` |

### Cloud site (La Palma — island overview)

```json
"start": {
  "mediaType": "cloud",
  "mediaURL": "LaPalma.zarr",
  "pointSize": 30,
  "tabs": {
    "Guide": [
      "./md/overview/guide_en.md",
      "./md/overview/guide_es.md",
      "./md/overview/guide_de.md"
    ]
  },
  "view": {
    "pos": [463.43, -59618.78, 54677.37],
    "tgt": [463.43, -3035.92, -1905.50]
  },
  "labels": {
    "label6": {
      "html": "<a href='./#geology'>Start virtual tour!</a>",
      "pos": [9364.89, 802.66, -816.57]
    }
  }
}
```

Relative cloud URLs resolve to `{cloudURL}/{mediaURL}` when deployed (La Palma: `https://storage.googleapis.com/rockhopper/LaPalma.zarr`), or `{devURL}/{mediaURL}` under the local Flask server.

### Photosphere site (La Palma — Hoyo Negro)

```json
"hoyonegro": {
  "mediaType": "photosphere",
  "mediaURL": "./img/hoyonegro/ps.jpg",
  "tabs": {
    "Guide": [
      "./md/hoyonegro/guide_en.md",
      "./md/hoyonegro/guide_es.md",
      "./md/hoyonegro/guide_de.md"
    ]
  },
  "labels": {
    "label2": {
      "html": "Hoyo Negro Vent (1949)",
      "pos": [-85.42, -32.54, -38.65]
    }
  }
}
```

### Reusing one cloud with many viewpoints

La Palma often registers **several site ids that share the same `mediaURL`** but different `view` (and sometimes labels). Example: `hoyoverdecliff`, `hoyoverdecliffa`…`e` all stream `HoyoVerdeCliff.zarr` at different camera poses. That pattern is the right way to step through an outcrop without duplicating zarr data.

Optional `view.style` (e.g. `"geology"` on the `geology` site) selects a named entry from the zarr `stylesheet` when the cloud loads.

### Labels as navigation

`labels.*.html` may be plain text or HTML. La Palma uses in-tour links heavily:

```html
<a href='./#losandenes1'>Next stop: Los Andenes</a>
```

Hash routes must match a `synonyms` key / site id. Coloured `<span style='color: …'>` labels are fine for legend-like callouts on overview clouds.

---

## `synonyms`

Maps **URL token → site id**. At minimum include entry for the landing route:

```json
"synonyms": {
  "start": "start",
  "taburiente": "taburiente"
}
```

- App also adds `synonyms[site] = site` for every site at runtime.
- You can alias friendly names to long ids if needed; La Palma mostly uses identity mappings plus a real `start` site.
- New VFTs created with Python set `synonyms["start"]` to the **first** added site if you do not create a site literally named `start`.

---

## `annotURL` and annotations vs labels

- `annotURL` (usually `./annotations.json`): drawn geometry (lines, planes, traces) edited in the 3D view; synced in Notebook when present.
- `sites[site].labels`: curated HTML markers stored **in `index.json`**, ideal for permanent navigation and place names (as in La Palma).

Do not confuse the two; both can coexist on a site.

---

## Mental model: how content is wired

```
index.json
 ├─ cloudURL ──────────► remote *.zarr stores
 ├─ sites[id].mediaURL ─► cloud name OR ./img/.../ps.jpg
 ├─ sites[id].tabs ─────► ./md/{site}/guide_en.md (etc.)
 ├─ tabs (global) ──────► ./md/help_en.md, notes_*, references_*
 ├─ languages ──────────► which path index to pick in each tab list
 └─ synonyms ───────────► #/start → which site object to open
```

Changing a guide’s filename without updating the matching path array in `index.json` breaks that tab. Adding a markdown file alone does nothing until it is referenced here.

---

## Markdown path conventions (tied to index)

| Scope | Typical path |
|-------|----------------|
| Global tab | `./md/{name}_{lang}.md` |
| Site tab | `./md/{site}/{name}_{lang}.md` |

La Palma site guides live under folders like `md/overview/`, `md/geology/`, `md/taburiente/` even when the site id differs slightly from the folder name — **the path string in `index.json` is authoritative**, not a forced naming rule.

---

## Agent checklist when editing `index.json`

1. Keep `languages` and every tab path list the same length and order.
2. Ensure `#/start` resolves (`synonyms.start` → an existing `sites` key).
3. For clouds: set `cloudURL` for deployment; use relative `mediaURL` zarr names unless using absolute URLs.
4. Never commit `devURL`.
5. Prefer label HTML links `./#siteid` for tour flow (copy La Palma’s pattern).
6. When adding a site: register `sites[id]`, add synonym if needed, create MD files, then point `tabs` at them.
7. For large multi-stop tours, use [LaPalmaVFT](https://github.com/samthiele/LaPalmaVFT) as the structural reference; use `demo/demo_tour` for a minimal teaching example.
