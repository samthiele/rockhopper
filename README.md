# About

Rock-hopper is a minimalist tool for creating web-based virtual field trips with a geological twist. It's main focus is to combine: (1) 

1. dense 3D point cloud data representing topographic features or digital outcrops 
2. rich explanatory content and media (e.g., field photographs) or data (e.g., stereonets, tabular data) stored in easy-to-make and easy-to-edit markdown (.md) files. 

Achieving this involves two key functions, each forming a part of rock-hopper: 

1. a React front-end viewer for rendering content (see /src ).
2. a python-based toolbox for converting pointcloud data the required (streamable) format and helping to build and structure virtual fieldtrip content.

### Why point clouds?

Point clouds, rather than e.g., textured meshes, are a core part of rock-hopper's design philosophy. The key logic here is that most data -- from textured meshes to 3D geological models or volumetric geophysical inversions can, with a little effort, be converted to dense 3D point clouds. This means a single, simple front-end can be used to visualise a wide range of different data types. 

