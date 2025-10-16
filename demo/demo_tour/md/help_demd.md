
# Help

RockHopper virtual field trips should (hopefully!) be quite intuitive to navigate, but this page helps clarify how everything works.

## 3D Controls

Use the following controls to navigate the 3D viewer.

| Control |     Action     |
|----------|----------|
| `Left-mouse` | Rotate view   |
| `Right-mouse` | Pan view   |
| `Scroll` | Zoom   |
| `Double-click` | Set rotation center, or delete clicked annotation  |
| `Shift+Left-click` | Pan view |
| `Ctrl+Left-click` | Add point to current annotation |


## Annotation Controls

Annotation points can be added using `Ctrl+Left Click` (these should appear initially as small yellow spheres). Once an annotation is finished, press `Enter` to accept or `Esc` to clear it. 

The type of annotation to be added will be decided based on the number of points when `Enter` is pressed:

1 Point: Add a `Label` object containing text (or arbitrary HTML).
2 Points: Add a `Vector` object, and add its `trend`, `plunge` and `length` to the Notes tab.
3 Points: Add a `Plane` object, and add its `strike`, `dip` and `dip direction` to the Notes tab.
4+ Points: Add a `Polyline` object. These can be useful for e.g., highlighting linear features (or circling objects of interest).

--- 

**Important Note**: *Annotations will be lost if the page is refreshed (unless you are running RockHopper on a local development server); meaning any changes need to be downloaded using the `⬇ Notes` button in the bottom left.*

---

Annotations (and HTML Labels) can be hidden or shown using the corresponding toggle buttons in the bottom left of the 3D viewer. The (currently drawn) annotation colour can also be changed by clicking the colour chooser widget.

## Visualisation Controls

A key strength of RockHopper is that multiple attributes of point cloud datasets can be streamed and visualised in different ways. These visualisation `Styles` are defined when the point cloud is converted to a streamable format and given (hopefully) understandable names. 

**Use the buttons in the top left of the 3D view to change the view style**. The top row changes the colour mapping used to define point colour. The second row can be used to either highlight or hide some subset of the points (based on an underlying classification). This can be useful for visualising different dates in a time-series dataset, or highlighting specific parts of a point cloud.
