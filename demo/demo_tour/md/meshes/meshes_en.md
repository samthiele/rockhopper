# Textured meshes

Rockhopper VFTs can also display textured meshes. These are useful for relatively simple / small geometries with detailed texture. 

Note that meshes cannot currently be streamed, so file size (number of triangles and texture size) should be kept relatively small. Larger textures are possible (rockhopper will display a low-resolution one while the high-resolution one is loading), but large numbers of triangles will be slow. 

Mesh and point cloud content can also be mixed. The next stop, [Mesh and cloud](./#overlay), loads this mesh beside the penguin and adds a show/hide list in the top-right of the view.

**Photosphere** in the lower-right opens a panorama, and **3D View** returns to the mesh. Each keeps its own camera.
