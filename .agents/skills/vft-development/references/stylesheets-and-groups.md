# Stylesheets & groups — multi-visualisation of one cloud

A core RockHopper novelty versus tools like Potree: **one streamed point cloud can expose many colour symbologies and interactive highlight/mask layers**, without exporting separate meshes or clouds. Styles and groups are stored as **zarr root attributes** (`.zattrs`) at export time and become UI buttons in the 3D view (`PointStream.js`).

Design intent (from the demo tour): visitors toggle symbologies and groups live; authors pack RGB, derived attributes, classifications, and map colours into a single `(N, d)` array for efficient distribution.

## Point array layout

Every point is one row:

```
[x, y, z, r, g, b, attr_0, attr_1, …]
 indices: 0  1  2  3  4  5  6       7 …
```

- Columns **0–2**: coordinates (shifted by zarr `origin` on write)
- Columns **3–5**: typically RGB in **0–1** (or another ternary product)
- Columns **6+**: optional scalars (class labels, hyperspectral bands, geology map RGB, intensity, …)

`stylesheet` / `groups` refer to these **column indices**. Wrong indices → wrong colours, not a Python error at view time.

## Where styles live

Set at export via `exportZA(..., stylesheet=..., styles=..., groups=...)` or `VFT.addCloud(..., stylesheet=..., groups=...)`.

Persisted on the zarr root:

| Attr | Role |
|------|------|
| `stylesheet` | Map of style name → colour recipe |
| `styles` | Ordered list of style names shown as buttons (subset of stylesheet keys) |
| `groups` | Optional map of group name → highlight and/or mask recipe |
| `resolution` / `origin` / `total` / `chunks` | Streaming metadata |

Viewer behaviour:

- Style buttons = `attrs.styles`; toggling re-runs `colourise` on the streamed buffer
- Group buttons = keys of `attrs.groups`; applied **after** the active style (`applyHighlight`)
- Site `view.style` / `view.group` in `index.json` can pre-select a style or group when entering that stop (e.g. La Palma `geology` site sets `"style": "geology"`)

---

## Style type 1 — ternary (true / false colour)

Map three bands into display R, G, B. Each channel is `(index, vmin, vmax)` linearly scaled to ~0–1 in the viewer:

```python
stylesheet = {
    "rgb": {
        "color": {
            "R": (3, 0, 1),
            "G": (4, 0, 1),
            "B": (5, 0, 1),
        }
    }
}
```

Use for:

- Photogrammetry / satellite **true colour** (bands 3–5)
- **False-colour** composites (any three attribute columns)
- **Precomputed thematic RGB** stored as extra bands (see La Palma `geology` below)

### Example — Penguin demo (`demo/demo_clouds/Penguin.zarr`)

```json
"styles": ["rgb", "rainbow"],
"stylesheet": {
  "rgb": {
    "color": {
      "R": [3, 0, 1],
      "G": [4, 0, 1],
      "B": [5, 0, 1]
    }
  },
  "rainbow": {
    "color": [1, {"scale": "spectral", "limits": [-2, 2, 255]}]
  }
}
```

Same geometry: true-colour penguin vs spectral ramp on the **y** coordinate (column 1).

### Example — La Palma island cloud (`LaPalma.zarr`)

Two ternary styles on one DEM/outcrop product:

```json
"styles": ["rgb", "geology"],
"stylesheet": {
  "rgb": {
    "color": {
      "R": [3, 0, 1],
      "G": [4, 0, 1],
      "B": [5, 0, 1]
    }
  },
  "geology": {
    "color": {
      "R": [6, 0, 255],
      "G": [7, 0, 255],
      "B": [8, 0, 255]
    }
  }
}
```

- `rgb` — optical colour (0–1)
- `geology` — geologic-map colours packed in columns 6–8 (0–255 scale)

The `geology` site in [LaPalmaVFT](https://github.com/samthiele/LaPalmaVFT) `index.json` sets `"view": { ..., "style": "geology" }` so visitors land on the map symbology; they can still switch back to `rgb` in the UI.

---

## Style type 2 — colour ramp (scalar → chroma.js)

Form:

```python
{"color": (band_index, {"scale": <chroma scale>, "limits": (vmin, vmax, nsteps)})}
```

- `scale`: any [chroma.js](https://gka.github.io/chroma.js/) scale name or colour list (`"viridis"`, `"spectral"`, `"RdYlBu"`, …)
- `limits`: domain endpoints plus number of intervals passed through `chroma.limits` / `chroma.scale`

Typical uses: elevation (column 2), intensity, spectral index, distance, uncertainty.

Default when no stylesheet is given and fewer than 6 columns: elevation-style ramp on z. With ≥6 columns, default is an `rgb` ternary on 3–5.

---

## Groups — highlight and mask (on top of a style)

Groups do **not** replace the stylesheet; they modify the current colours.

### Highlight (`iq`)

```python
"wings": {
    "blend": 0.3,           # mix strength toward overlay colour
    "color": [1, 1, 0],     # RGB in 0–1
    "iq": [6, "=", 3],      # [column, operator, value]
}
```

Operators in the viewer: `=`, `!=`, `<`, `>` (inequalities use `<=` / `>=` in JS).

### Mask (`mask`)

```python
"skeleton": {
    "mask": [6, "!=", 0]    # matching points drawn black → discarded in fragment shader
}
```

### Example — Penguin body parts (classification in column 6)

| Group | Effect |
|-------|--------|
| `wings` / `legs` / `body` | Yellow blend where class equals 3 / 1 / 2 |
| `skeleton` | Hide non-zero class → reveal “skeleton” points |

### Example — La Palma volcanic units (column 9)

Groups such as `Caldera Taburiente`, `Bejenado`, `Tajogaite`, … each `iq: [9, "=", <unit id>]` so one island cloud supports unit-by-unit emphasis under either `rgb` or `geology` colouring.

### Example — Hoyo Verde cliff (`HoyoVerdeCliff.zarr`)

`dykes` / `sills` highlights on classification column 6 while keeping a single `rgb` style — structural features on a true-colour outcrop.

---

## Authoring pattern (Python)

```python
stylesheet = {
    "rgb": {
        "color": {"R": (3, 0, 1), "G": (4, 0, 1), "B": (5, 0, 1)}
    },
    "elev": {
        "color": (2, {"scale": "viridis", "limits": (-100, 100, 255)})
    },
    # optional: false colour or thematic bands in columns 6+
}

groups = {
    "unit_a": {"blend": 0.3, "color": [1, 1, 0], "iq": [6, "=", 1]},
    "hide_cover": {"mask": [6, "=", 0]},
}

vft.addCloud(
    "outcrop",
    "Outcrop",
    cloud=array_or_ply_path,
    resolution=0.1,
    stylesheet=stylesheet,
    styles=["rgb", "elev"],  # optional: button order / subset
    groups=groups,
)
```

Then optionally in `index.json` for a stop that should open on a given symbology:

```json
"view": {
  "pos": [...],
  "tgt": [...],
  "style": "elev",
  "group": "unit_a"
}
```

## Why this matters pedagogically

- **One download, many lessons**: topography vs geology map vs unit highlight without reloading geometry
- **Evidence vs interpretation**: true colour as observation; thematic / classified styles as interpretation layers
- **Outcrop storytelling**: dykes/sills or lithology classes on the same DOM
- Compatible with RockHopper’s “everything is a point cloud” philosophy (meshes, maps, volumes → points + attributes)

## Agent checklist

1. Confirm column indices against the array actually written (xyzrgb first).
2. Put every interactive symbology in `stylesheet`; list button names in `styles`.
3. Use `groups` for classification emphasis/hiding — not for primary continuous colour (use a ramp style instead).
4. Match `view.style` / `view.group` names exactly to keys in zarr attrs.
5. After changing styles, **re-run `exportZA` / `addCloud`** — editing `.zattrs` by hand is possible but easy to desync from chunk data.
6. Study live examples: `Penguin.zarr` in-repo; La Palma / Hoyo Verde attrs on the RockHopper GCS bucket used by [LaPalmaVFT](https://github.com/samthiele/LaPalmaVFT); narrative in `examples/tutorial.ipynb` and `demo/demo_tour/md/clouds/`.
