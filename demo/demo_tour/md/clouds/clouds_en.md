
# Point clouds

In addition to photospheres, *rockhopper* also allow 3D point cloud content.

These are first downsampled to a specified resolution and converted to a streamable [zarr](https://zarr.readthedocs.io/en/stable/) format to allow reasonably dynamic loading over a standard web connection (though, please do downsample your point clouds as much as possible first).


### Cloud annotations

Point cloud annotations work exactly the same as described [previously](./#annotations). Ctrl+Click to add points, lines and planes. Lines and planes will appear as structural measurements in the `Notebook` tab (useful if your point cloud is a 3D digital outcrop model).

### Cloud visualisation

Unlike other point-cloud visualisation tools (e.g., [potree](https://github.com/potree/potree)), a single *rockhopper* point cloud can have multiple different symbologies (color schemes) applied. These are defined while exporting the cloud to a zarr format, as described in detail [here](https://github.com/samthiele/rockhopper/blob/main/examples/tutorial.ipynb).

Toggle between the `rgb` and `rainbow` schemes by clicking the buttons in the top-left of the 3D view to see this in action.

Point groups can also be defined, either to highlight specific regions of the point cloud (in this case *wings*, *body* and *legs*) in a certain colour, or to hide certain groups of points (to reveal, in this case, the *skeleton* of our penguin). 

Buttons for activating these point groups can also be found in the top-left of the 3D view.

