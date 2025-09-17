# About

Rock-hopper is a minimalist tool for creating web-based virtual field trips (VFT) with a geological twist. It's main focus is to combine: (1) 

1. dense 3D point cloud data representing topographic features or digital outcrops 
2. rich explanatory content and media (e.g., field photographs) or data (e.g., stereonets, tabular data) stored in easy-to-make and easy-to-edit markdown (.md) files. 

Achieving this involves two key functions, each forming a part of rock-hopper: 

1. a React front-end viewer for rendering content (see /src ).
2. a python-based toolbox for converting pointcloud data the required (streamable) format and helping to build and structure virtual fieldtrip content.

### Demonstration

To see what RockHopper can do, please see the virtual field trip we have created for La Palma:

[La Palma VFT](https://samthiele.github.io/LaPalmaVFT/#/start)

### Tutorial

**Installation**. RockHopper can be easily installed using a combition of `pip` and `git`: try running `pip install git+https://github.com/samthiele/rockhopper.git` in your favourite python environment.

**Usage**. A jupyter notebook introducing how RockHopper and python can be used to create a VFT is included in the `examples` directory. This can be used as a guide to creating a new VFT, converting point cloud content to a streamable zarr format, and running a local development server.

[La Palma Tutorial](https://github.com/samthiele/rockhopper/blob/main/examples/LaPalma.ipynb)

Please note that this tutorial (and the entire RockHopper project) is a work in progress.

**Deployment**. Once a RockHopper field trip has been developed locally, it can be uploaded onto any static web server for public access. One way to do this is to upload the streamable zarr data (stored in the `cloud_path` specified during VFT creation) to file storage like [Google Cloud](https://cloud.google.com/), and then build a GitHub pages site to host the markdown and json content defining the VFT (stored in the `vft_path` defined during VFT creation). This uses GitHub for free web hosting, and - better still - allows community driven VFTs that are open-source and can be easily adapted for different purposes. Alternatively, the zarr data, markdown and json files can all be hosted on a single web server.

### Why point clouds?

Point clouds, rather than e.g., textured meshes, are a core part of rock-hopper's design philosophy. The key logic here is that most data -- from maps and textured meshes to 3D geological models or volumetric geophysical inversions can, with a little effort, be converted to dense 3D point clouds. This means a single, simple front-end can be used to visualise a wide range of different data types. 

