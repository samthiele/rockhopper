"""
Load and save point cloud data.
"""
import os
import numpy as np 
import zarr
from numcodecs import Blosc
#from zarr.codecs import BloscCodec
from sklearn.cluster import MiniBatchKMeans
from tqdm import tqdm
from scipy.spatial import KDTree
import warnings

def savePLY(path, xyz, rgb=None, normals=None, attr=None, names=None):
    """
    Write a point cloud and associated RGB and scalar fields to .ply.

    Parameters
    ---------------
    Path : str
        File path for the created (or overwritten) .ply file
    xyz : np.ndarray
        Array of xyz points to add to the PLY file
    rgb : np.ndarray
        Array of 0-255 RGB values associated with these points, or None.
    normals : np.ndarray
        Array of normal vectors associated with each point, or None.
    attr : np.ndarray
        Array of float32 values associated with these points, or None
    attr_names : list 
        List containing names for each of the passed attributes, or None.
    """

    # make directories if need be
    os.makedirs(os.path.dirname( path ), exist_ok=True )

    try:
        from plyfile import PlyData, PlyElement
    except:
        assert False, "Please install plyfile (`pip install plyfile`) to export to PLY."

    sfmt='f4' # use float32 precision

    # create structured data arrays and derived PlyElements
    vertex = np.array(list(zip(xyz[:, 0], xyz[:, 1], xyz[:, 2])),
                      dtype=[('x', 'double'), ('y', 'double'), ('z', 'double')])
    ply = [PlyElement.describe(vertex, 'vertices')]

    # create RGB elements
    if rgb is not None:
        if (np.max(rgb) <= 1):
            irgb = np.clip((rgb * 255),0,255).astype(np.uint8)
        else:
            irgb = np.clip(rgb,0,255).astype(np.uint8)

        # convert to structured arrays and create elements
        irgb = np.array(list(zip(irgb[:, 0], irgb[:, 1], irgb[:, 2])),
                        dtype=[('r', 'u1'), ('g', 'u1'), ('b', 'u1')])
        ply.append(PlyElement.describe(irgb, 'color'))  # create ply elements

    # normal vectors
    if normals is not None:
        # convert to structured arrays
        norm = np.array(list(zip(normals[:, 0], normals[:, 1], normals[:, 2])),
                        dtype=[('x', 'f4'), ('y', 'f4'), ('z', 'f4')])
        ply.append(PlyElement.describe(norm, 'normals'))  # create ply elements

    # attributes
    if attr is not None:
        if names is None:
            names = ["SF%d"%(i+1) for i in range(attr.shape[-1])]
        
        # map scalar fields to required type and build data arrays
        data = attr.astype(np.float32)
        for b in range(data.shape[-1]):
            n = names[b].strip().replace(' ', '_') #remove spaces from n
            if 'scalar' in n: #name already includes 'scalar'?
                ply.append(PlyElement.describe(data[:, b].astype([('%s' % n, sfmt)]), '%s' % n))
            else: #otherwise prepend it (so CloudCompare recognises this as a scalar field).
                ply.append(PlyElement.describe(data[:, b].astype([('scalar_%s' % n, sfmt)]), 'scalar_%s' % n))
    PlyData(ply).write(path) # and, finally, write everything :-) 

def loadPLY(path):
    """
    Loads a PLY file from the specified path.
    """
    try:
        from plyfile import PlyData, PlyElement
    except:
        assert False, "Please install plyfile (pip install plyfile) to load PLY."
    data = PlyData.read(path) # load file!

    # extract data
    xyz = None
    rgb = None
    norm = None
    scalar = []
    scalar_names = []
    for e in data.elements:
        if 'vert' in e.name.lower():  # vertex data
            xyz = np.array([e['x'], e['y'], e['z']]).T
            if len(e.properties) > 3:  # vertices have more than just position
                names = e.data.dtype.names
                # colour?
                if 'red' in names and 'green' in names and 'blue' in names:
                    rgb = np.array([e['red'], e['green'], e['blue']], dtype=e['red'].dtype).T
                # normals?
                if 'nx' in names and 'ny' in names and 'nz' in names:
                    norm = np.array([e['nx'], e['ny'], e['nz']], dtype=e['nx'].dtype).T
                # load others as scalar
                mask = ['red', 'green', 'blue', 'nx', 'ny', 'nz', 'x', 'y', 'z']
                for n in names:
                    if not n in mask:
                        scalar_names.append(n)
                        scalar.append(e[n])
        elif 'color' in e.name.lower():  # rgb data
            rgb = np.array([e['r'], e['g'], e['b']], dtype=e['r'].dtype).T
        elif 'normal' in e.name.lower():  # normal data
            norm = np.array([e['x'], e['y'], e['z']], dtype=e['z'].dtype).T
        else:  # scalar data
            scalar_names.append(e.properties[0].name.strip().replace('scalar_',''))
            scalar.append(np.array(e[e.properties[0].name], dtype=e[e.properties[0].name].dtype))
    if len(scalar) > 0:
        scalar = np.vstack(scalar).T
    assert (not xyz is None) and (xyz.shape[0] > 0), "Error - PLY contains no geometry?"

    # return everything needed
    out = dict( xyz = xyz, rgb=rgb, normals=norm, 
                attr=scalar, names=scalar_names )
    if len(scalar) == 0:
        del out['attr']
        del out['names']
    if rgb is None:
        del out['rgb']
    else:
        out['rgb'] = out['rgb'].astype(np.float32) / 255 # convert to float
    if norm is None:
        del out['normals']
    return out

def exportZA(points, zarr_store_path, 
             chunk_size=200000, resolution=0.1,
             stylesheet=None, styles=None, **kwds):
    """
    Convert a NumPy array of shape (N, 6) -> [x, y, z, r, g, b, ...]
    into a Zarr dataset. Also compute a second Zarr dataset
    of chunk-centers (one representative point per chunk).

    Parameters:
    -----------
    points : numpy.ndarray
        Shape (N, d) for xyzrgb[abc] data. The last dimension must be at least six,
        but can be larger if multiple combinations of bands can be displayed (see `display`).
    zarr_store_path : str
        Path to the directory or file used as the Zarr store.
    chunk_size : int
        Number of points per chunk.
    resolution : float
        The spatial resolution to downsample the cloud to before saving. This is important to 
        optimise the size. The same resolution will be used to compute the point size during visualisation.
    styles : list
        A list of styles to make available to the front-end. If None, all keys from stylesheet are used.
    stylesheet : dict
        A dictionary defining **visualization styles** for point cloud rendering. Each key
        corresponds to a named style that can be selected in the viewer, allowing the user
        to toggle between different colour representations (e.g., RGB, elevation, intensity,
        or derived attributes).

        Each style entry defines how point colours are computed. Supported formats include:

        1. **Ternary (true colour) mapping**  
        A mapping that combines three attributes (bands) into the red, green, and blue
        channels respectively.  
        Example format:
            {'color': {'R': (iR, minR, maxR),
                        'G': (iG, minG, maxG),
                        'B': (iB, minB, maxB)}}
        where each tuple `(index, min_value, max_value)` defines which attribute band to use
        and how to normalize it into the `[0, 1]` display range.

        2. **Colour ramp mapping**  
        A mapping that applies a continuous colour ramp (scale) to a single attribute band.  
        Example format:
            {'color': (index, {'scale': <str or list>, 'limits': (vmin, vmax, nsteps)})}
        - `index`: The attribute index to use (e.g., 2 for elevation).  
        - `scale`: A colour ramp or list of colour names passed to the JavaScript
            `chroma.scale(...)` function (e.g., `'viridis'`, `'spectral'`, `'RdYlBu'`).  
        - `limits`: The `(min, max, nsteps)` defining the colour domain and the number
            of intervals used in the ramp. These values are passed to `chroma.limits(...)`.

        Default
        -------
        If no stylesheet is provided, a default configuration is used:
        ```
        {
            'rgb': {'color': {'R': (3, 0, 1),
                            'G': (4, 0, 1),
                            'B': (5, 0, 1)}},
            'elev': {'color': (2, {'scale': 'viridis',
                                'limits': (-100, 100, 255)})}
        }
        ```

        Example
        -------
        >>> stylesheet = {
        ...     'rgb': {
        ...         'color': {
        ...             'R': (3, 0, 1),   # Use band 3 as red (satellite RGB)
        ...             'G': (4, 0, 1),   # Use band 4 as green
        ...             'B': (5, 0, 1)    # Use band 5 as blue
        ...         }
        ...     },
        ...     'rainbow': {
        ...         'color': (
        ...             1,  # Map the second attribute (e.g., y-coordinate)
        ...             {'scale': 'spectral', 'limits': (-2, 2, 255)}  # Spectral colour ramp with 255 steps
        ...         )
        ...     }
        ... }

        In this example, the viewer exposes two selectable styles:
        - **'rgb'** renders the point cloud using its true RGB values.
        - **'rainbow'** colours points using a continuous ramp based on their second attribute
        (in this case, the y-coordinate), with values from -2 to 2 mapped through a
        "spectral" colour scale.

    Keywords:
    ---------
    Any additional keyword arguments are stored as metadata in the Zarr root group. Most importantly, this can include a 
    "groups" dictionary, as described below.

    groups : dict
        A dictionary defining **highlighting** and **masking groups** for interactive
        visualization of point clouds. Each key creates a toggle button in the front-end
        that can either highlight or mask points according to a logical condition on a
        given attribute (band).

        Each group entry is a dictionary containing one or more of the following keys:

        - **"blend"** : float  
            The strength of the colour overlay (from 0 to 1). Controls how strongly
            the highlight colour blends with the base colour.
        
        - **"color"** : list of float  
            The RGB triplet `[R, G, B]` to use for highlighting when the group is activated.
            Each channel should be in the range `[0, 1]`.
        
        - **"iq"** : list  
            A logical condition in the form `[index, operator, value]` that determines
            which points to highlight.  
            - `index` is the attribute index (e.g., `6` for the 7th attribute).  
            - `operator` is a string such as `'='`, `'!='`, `'>'`, `'<'`, etc.  
            - `value` is the scalar value to compare against.
            Example: `[6, '=', 3]` highlights points where the 7th attribute equals 3.
        
        - **"mask"** : list  
            A logical condition `[index, operator, value]` defining which points to **hide**
            when the group is active. For example, `[6, '!=', 0]` hides all points whose
            7th attribute is not equal to zero.

            Example
            -------
            >>> groups = {
            ...     "wings": {
            ...         "blend": 0.3,
            ...         "color": [1, 1, 0],
            ...         "iq": [6, '=', 3]
            ...     },
            ...     "legs": {
            ...         "blend": 0.3,
            ...         "color": [1, 1, 0],
            ...         "iq": [6, '=', 1]
            ...     },
            ...     "body": {
            ...         "blend": 0.3,
            ...         "color": [1, 1, 0],
            ...         "iq": [6, '=', 2]
            ...     },
            ...     "skeleton": {
            ...         "mask": [6, '!=', 0]
            ...     }
            ... }
    """
    # remove duplicate points
    tree = KDTree(points[:,:3])
    keep = np.full( points.shape[0], True)
    for i,p in enumerate( tqdm( points, desc='Culling points', leave=False ) ):
        if not keep[i]: continue # skip points that are already "deleted"
        o = tree.query_ball_point(p[:3], resolution)
        points[i] = np.mean( points[ o ], axis=0 ) # replace with average values
        keep[o] = False # flag points to be deleted
        keep[i] = True # except this one!
    points = points[keep]

    # round position information to specific precision
    # (this helps achieve smaller size after compression)
    decimals = int( 1-np.log10( resolution ) )
    np.round( points, int( decimals ) )

    # Make sure chunk_size is not bigger than total points
    num_points = len( points )
    chunk_size = min(chunk_size, num_points / 3) # we need at least some chunks...

    # chunk remaining data into spatial clusters
    # (so that we can give the points a sensible order)
    with warnings.catch_warnings():
        warnings.filterwarnings("ignore", category=RuntimeWarning)
        sc = MiniBatchKMeans( n_clusters=int( len(points) / chunk_size ), tol=0.1,
                            n_init='auto' )
        cid = sc.fit_predict( points[:, :3] )+1

        # randomly select the first chunk (this should be evenly distributed)
        # (and inject into cids)
        cid[ np.random.choice(len(points), int(chunk_size), replace=False) ] = 0 
        ixx = np.unique(cid) # get unique classes

    # define colors json object defining visualisation options
    if stylesheet is None:
        if points.shape[1] >= 6:
            stylesheet = {'rgb':{'color':{'R':[3,0,1],'G':[4,0,1],'B':[5,0,1]}}}
        else:
            stylesheet = {'elev':(2, {'scale':'viridis', 'limits':(-100,100,255)})}
    
    if styles is None:
        styles = list( stylesheet.keys() )
    for k in styles:
        assert k in stylesheet, "Style %s is not in the stylesheet?"%k
    
    # create a zarr object and set relevant metadata
    origin = np.mean( points[:,:3], axis=0 ).astype(int)
    z = zarr.open_group(zarr_store_path, mode='w')  # top-level group
    z.attrs.update({"origin": list(origin), 
                    "resolution" : resolution, 
                    "total" : len(points), 
                    "chunks" : len(ixx),
                    "styles" : styles,
                    "stylesheet" : stylesheet,
                    **kwds })

    # build chunks and add to the zarr object
    centers = []
    compressor = Blosc(cname="zstd", clevel=3, shuffle=Blosc.SHUFFLE)
    #compressor = BloscCodec(cname="zstd", clevel=9, shuffle="shuffle")
    for i,ix in tqdm( enumerate(ixx), desc="Extracting chunks", leave=False):
        c = points[ cid == ix, : ]
        c[:,:3] -= origin
        c = c.astype(np.float32)
        main_array = z.create_dataset(
            name="c%d"%i,
            shape=c.shape,
            chunks=(c.shape[0], c.shape[1]),
            dtype=c.dtype,
            compressor=compressor
        )
        main_array[:] = c

        # also aggregate chunk centers
        centers.append( np.mean(c, axis=0 ) )
    centers=np.array(centers, dtype=np.float32)

    # Save chunk-centers
    _ = z.create_dataset(
        name="chunk_centers",
        data=centers,
        shape=centers.shape,
        chunks=(centers.shape[0], centers.shape[1]),
        dtype=centers.dtype,
        compressor=compressor
    )
    