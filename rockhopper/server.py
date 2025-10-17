from flask import Flask, send_from_directory, jsonify, send_file, request
from flask_cors import CORS
from werkzeug.serving import make_server
import threading
import json, os
import logging 
from pathlib import Path
import numpy as np
from rockhopper.clouds import loadPLY, exportZA
import rockhopper.ui
import shutil
import numpy as np

def read_json(file_path):
    """
    Reads a JSON file and returns its contents as a dictionary.

    Parameters:
    - file_path (str): The path to the JSON file.

    Returns:
    - dict: A dictionary containing the JSON data.
    """
    try:
        with open(file_path, 'r', encoding='utf-8') as file:
            data = json.load(file)
        return data
    except FileNotFoundError:
        print(f"Error: The file at {file_path} was not found.")
    except json.JSONDecodeError:
        print(f"Error: The file at {file_path} is not a valid JSON file.")

def write_json(data, filename):
    """
    Write a json file using json.dumps, but some fancy formatting.
    """
    def custom_serializer(value, indent=0, ichar='  '):
        if isinstance(value, list):
            return json.dumps(value, separators=(',', ': ')) # Lists on one line
        elif isinstance(value, np.ndarray):
            return json.dumps(value.tolist(), separators=(',', ': ')) # Numpy arrays on one line
        elif isinstance(value, dict):
            lines = []
            for key, value in value.items():
                value_str = custom_serializer(value, indent+1)
                indented = ichar*indent+f'{json.dumps(key)}: {value_str}' # Indent the key-value pair
                lines.append(ichar*indent + indented)
            return '{\n' + ',\n'.join(lines)+'  }'
        else:
            # Pretty-print non-list values (like dicts, strings, numbers)
            return json.dumps(value, indent=0)

    with open(filename, 'w') as f:
        text = custom_serializer(data)
        f.write(text)

defaultMD = """
# My new markdown file 

This is a squeaky clean markdown file. `Double-click` it (when running a local
development server) to edit it's contents and explain this part of your tour. Once
ready, press `Shift+Enter` to update and save changes. 

A useful guide to writing markdown files can be found [here](https://www.markdownguide.org/cheat-sheet/).

**N.B. Please translate this file according to the corresponding language suffix**

## Fancy markdown

Markdown text can be long and detailed, and translated into several languages (see buttons on the bottom left). It can also contain various media, including pictures.

![Don't let markdown get you down!](https://upload.wikimedia.org/wikipedia/commons/7/7b/ZSL_London_-_Northern_rockhopper_penguin_%2801%29.jpg)

Tables can also be used:

*Table 1: A small collection of fun facts.*

| **About Rock Hopper Penguins**  |          |
|----------|----------|
| Common Name | rockhopper penguin   |
| Fancy Name (Northern) | Eudyptes moseleyi   |
| Fancy Name (Southern) | Eudyptes chrysocome   |
| Rapper Name | Hop the Rocker   |
| Size | 41 to 46 cm   |
| Weight | 2.5 kg   |
| Diet | fish, squid, krill, tourists  |
| Habitat | Rocks, Water   |

As can multiple-guess questions, to keep visitors on their toes!

---

Are penguins punks?
- [x] Yes
- [ ] No
- [ ] Sometimes

---

For more extensive tours, audio can be created and embedded (or linked from other sources) - do you think RockHoppers can sing?

> audio https://xeno-canto.org/sounds/uploaded/YYMEPEMBFR/XC952603-S_Rock_Hop_West_Pt_Falkland_Is.mp3

Including YouTube videos can also help explain content in an engaging way.

> youtube https://www.youtube.com/embed/lVD1WaMaqDc?si=jXZzNdHYJXJSLbYg

"""

class ServerThread(threading.Thread):
    def __init__(self, app, host, port):
        threading.Thread.__init__(self)
        self.host = host
        self.port = port
        self.server = make_server(host, port, app)
        self.ctx = app.app_context()
        self.ctx.push()

    def run(self):
        self.server.serve_forever()

    def shutdown(self):
        self.server.shutdown()

class VFT(object):
    """
    A class for creating virtual field trips (VFTs). This includes ingesting the relevant
    data, defining field trip structure and creating dummy content. It also runs a local
    development server that can be used to define content and create annotations and labels. 
    """
    def __init__(self, vft_path, cloud_path=None, overwrite=False, devMode=True):
        """
        Initialize the VFT application with specified paths and configurations.

        Parameters
        -------------
        vft_path : str
            The file path to the VFT directory. This path is also used as the static folder for the Flask app.
        cloud_path : str
            The file path to store and serve point cloud streams. Defaults to None.
        overwrite : str
            True if javascript and html elements should be overwritten when creating the tour.
        devMode : bool
            True (default) if the server will allow editing of files. This is useful for development, but can be set to False to test
            behaviour during deployment.
        """
            
        # basic VFT properties
        self.vft_path = vft_path
        self.cloud_path = cloud_path
        os.makedirs(vft_path, exist_ok=True)
        if cloud_path: 
            os.makedirs(cloud_path, exist_ok=True)
        self.updateIndex()
        self.port = None
        self.host = None
        self.devMode = devMode

        # copy required files from rockhopper.ui
        rockhopper.ui.copyTo(vft_path, overwrite=overwrite)

        # setup app
        self.app = Flask(__name__, static_folder=vft_path)
        CORS(self.app)
        self.server_thread = None

        # hide annoying messages
        log = logging.getLogger('werkzeug')
        log.setLevel(logging.ERROR)

        @self.app.route("/")
        def serve_root():
            """
            Serve index.html file
            """
            return send_from_directory(self.app.static_folder, "index.html")
        
        @self.app.route("/index.json")
        def serve_index():
            """
            Serve current tour index json
            """
            # load index from file (in case of manual changes)
            pth = os.path.join( self.vft_path, 'index.json' )
            if os.path.exists(pth):
                self.index = read_json( pth )
            else:
                self.updateIndex()

            # set dev server directory
            if 'devURL' in self.index:
                del self.index['devURL'] # remove this property if it exists
            if self.devMode:
                self.index['devURL'] = f"http://{self.host}:{self.port}" # add devURL in dev mode

            # serve
            return jsonify(self.index)
        
        @self.app.route("/update", methods=['POST'])
        def update():
            """
            Update one of the files in this tour
            """
            if not self.devMode:
                return jsonify(isError=True, 
                               message="Development mode is off. Cannot update files.",
                               statusCode=403,
                               data={}), 403
            # get updated text
            data = request.json
            filename = data['filename']
            content = data['content']
            dtype = data['dtype']
            if 'json' in dtype.lower(): # parse content of json text to a json dictionary
                content = json.loads(content)
                write_json(content, os.path.join(self.vft_path, filename)) # write relevant file with pretty formatting
            else: # write relevant file directly
                with open( os.path.join(self.vft_path, filename), 'w' ) as f:
                    f.write(content)
                            
            # update index (if this has changed)
            if 'index.json' in filename:
                self.updateIndex()
            
            # return success
            return jsonify(isError=False, 
                           message="Success",
                           statusCode=200,
                           data={}), 200
        
        @self.app.route("/<path:filename>")
        def serve_file(filename):
            """
            Other static files
            """
            if self.cloud_path is not None:
                if os.path.exists(os.path.join(self.cloud_path, filename)):
                    return send_from_directory(self.cloud_path, filename)
            return send_from_directory(self.app.static_folder, filename)

    def updateIndex(self):
        """
        Load and store the index.json file. This is called often 
        when changes are made.
        """
        pth = os.path.join( self.vft_path, 'index.json' )
        if os.path.exists(pth):
            self.index = read_json( pth )
        else:
            # create a new index.json
            self.index = {"annotURL": "./annotations.json",
                          "cloudURL": "UPDATE_HERE_WHEN_UPLOADED",
                          "languages" : ['en'],
                          "tabs" : {"Notebook":["./md/notes_en.md"],
                                    "References":["./md/references_en.md"],
                                    "Help":["./md/help_en.md"],
                                    "_order":["Help","Notebook","References"]},
                          "synonyms" : {},
                          "sites":{},
                          }
            self.writeIndex() # save

        # also write annotations file
        if not os.path.exists( os.path.join(self.vft_path, self.index['annotURL']) ):
            with open(os.path.join(self.vft_path, self.index['annotURL']),'w') as f:
                f.write("{}\n") # stub
    
        # make sure the 'devURL' property never sneaks into the hardcopy of index.json
        if 'devURL' in self.index: 
            self.writeIndex() 
        
    def writeIndex(self):
        if 'devURL' in self.index: # hide this property
            del self.index['devURL']
        write_json(self.index, os.path.join(self.vft_path, 'index.json'))
        #with open(os.path.join(self.vft_path, 'index.json'), 'w' ) as f:
        #    json.dump(self.index, f, indent=2,  )
    
    def start(self, port=4002):
        if self.server_thread and self.server_thread.is_alive():
            print("Server already started")
            return
        
        # store port and host
        self.port = port
        self.host = '127.0.0.1'

        # launch!
        self.server_thread = ServerThread( self.app, self.host, self.port )
        self.server_thread.start()
        print(f"Development server started at http://{self.host}:{self.port}")

    def stop(self):
        if self.server_thread:
            self.server_thread.shutdown()

    def setLanguages( self, languages = ['en'] ):
        """
        Set the languages available in this VFT. Corresponding markdown files
        should be created using `%name%_en`, `%name%_fr`, `%name%_de` etc. This 
        will be done automatically for all new markdown files added using `rockhopper`, 
        but pre-existing files may need to be manually created. Tools like DeepL can 
        be hugely useful here :-)

        Parameters
        -------------
        languages, list of str 
            A list of language codes to support. Defaults to ['en'] (English).
        """
        self.index['languages'] = [l.lower() for l in languages]
        self.writeIndex()

    def addTab( self, name, site=None ):
        """
        Add a new tab to your VFT. This can be "global", such that it will be shown
        for all sites, or "local" so it is only shown at the specified site.

        Parameters
        ------------
        name : str
            The name of the tab to add.
        site : str | None
            The name of the site to add the tab to, or None to create a "global" tab.
        """
        assert 'languages' in self.index, "Define languages using `setLanguages(...)` before adding tabs."
        assert 'sites' in self.index, f"Create site {site.lower()} before adding a tab to it."
        if site:
            assert site in self.index['sites'], f"Create site {site.lower()} before adding a tab to it."
        
        # create files
        os.makedirs( os.path.join( self.vft_path, 'md'), exist_ok=True )
        if site is not None:
            os.makedirs( os.path.join( self.vft_path, f'md/{site.lower()}'), exist_ok=True )
        
        paths = []
        for lang in self.index['languages']:
            if site is None:
                pth = f'./md/{name.lower()}_{lang.lower()}.md'
            else:
                pth = f'./md/{site.lower()}/{name.lower()}_{lang.lower()}.md'
            
            paths.append(pth)
            if not os.path.exists(os.path.join( self.vft_path, pth)):
                with open(os.path.join( self.vft_path, pth ),'w') as f:
                    if 'en' in lang:
                        f.write(defaultMD) # write default text
                    else:
                        f.write("Unfortunately this page has not yet been translated.")
        
        # add to index.json
        if site is None:
            self.index['tabs'] = self.index.get('tabs',{})
            self.index['tabs'][name] = paths
        else:
            self.index['sites'][site.lower()]['tabs'] = self.index['sites'][site.lower()].get('tabs',{})
            self.index['sites'][site.lower()]['tabs'][name] = paths
        self.writeIndex() # save changes

    def addCloud( self, site, name, cloud=None, site_kwds={}, **kwds):
        """
        Convert a PLY point cloud to streamable format and store it in the 
        specified cloud_path (if this is not None).

        Parameters
        ----------
        site : str
            The name of the "site" to create in the tour. Set as None to convert the point
            cloud without adding a new site. 
        name : str
            The name to use for the created `zarr` stream.
        cloud : str | pathlib.Path | np.ndarray
            A path to the .ply file to load the cloud from, or a numpy array
            of shape (n,d) containing n points and d properties. The first six properties
            must be `x, y, z, r, g, b`. If None, it is assumed that the cloud specified by
            `name` has already been created.
        site_kwds : keywords to pass to `self.addSite( ... )` when creating a new site.

        Keywords
        ---------
        All keywords are passed directly to `rockhopper.exportZA(...)`. These should be used
        to e.g., define visualisation styles, highlights and/or masks.  Most important are the following

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
        
        if cloud is not None:
            assert self.cloud_path is not None, "Create a VFT with a `cloud_path` to add local cloud streams."
            if isinstance(cloud, str) or isinstance(cloud, Path):
                cloud = loadPLY( cloud )
                # retrieve attributes from resulting dict
                xyz = cloud['xyz']
                rgb = cloud['rgb']
                if 'attr' in cloud:
                    attr = cloud['attr']
                    cloud = np.hstack([xyz, rgb, attr])
                else:
                    cloud = np.hstack([xyz, rgb])
        
            print("Building stream with shape %s"%str(cloud.shape))

            # export array
            out_path = os.path.join( self.cloud_path, f"{name}.zarr")
            exportZA( cloud, out_path, **kwds)

        # add site for this cloud
        if site is not None:
            self.addSite( site, mediaURL=f"{name}.zarr", mediaType='cloud', 
                        pointSize = kwds.get('resolution',0.1), **site_kwds )

    def addPhotosphere( self, site, image, **kwds):
        """
        Copy the specified photosphere into this VFT and add it as a site.

        Parameters
        ----------
        site : str
            The name of the "site" to create in the tour for the specified photosphere.
        image : str | pathlib.Path
            A path to the photo sphere image to copy into this tour.

        Keywords
        ---------
        All keywords are passed directly to `self.addSite( ... )` when creating the new site.
        """

        # copy the photosphere into the required directory
        assert os.path.exists(image), "Image %s not found"%image
        ext = os.path.splitext(image)[-1]
        dest = f'img/{site.lower()}/ps{ext}'
        os.makedirs(os.path.join( self.vft_path, f'img/{site.lower()}/' ), exist_ok=True)

        print(f"Copying photosphere to {dest}")
        shutil.copy(image, os.path.join( self.vft_path, dest) )
        
        # add site for this photosphere
        if site is not None:
            self.addSite( site, mediaURL=f'./{dest}', mediaType='photosphere', **kwds )

    def addSite( self, name, mediaURL, mediaType='cloud', **kwds):
        """
        Create a new "stop" in this VFT.

        Parameters
        -----------
        name : str
            The name of the site to add.
        mediaURL : str
            The URL of the media (cloud or photosphere) to use for this site.
        mediaType : str
            The type of this media ("cloud" or "photosphere").
        
        Keywords
        ---------
        Keywords will be added to the created site. These could include e.g., 
        tabs : dict
            A dictionary containing { "tabName" : ["path_en", "path_..."] } to
            define content only displayed for this site.
        pointSize : float
            A point size to use when drawing point cloud datasets. 
        """
        # update index.json
        name = name.lower() # site names should be lower case
        self.updateIndex()
        if len(self.index['sites']) == 0:
            self.index['synonyms']["start"] = name # this is the first site; set as "start"
        self.index['sites'][name] = self.index['sites'].get(name, {})
        self.index['sites'][name]['mediaType'] = mediaType
        self.index['sites'][name]['mediaURL'] = mediaURL
        for k,v in kwds.items():
            self.index['sites'][name][k] = v
        self.writeIndex()