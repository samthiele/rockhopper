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
    def __init__(self, vft_path, cloud_path=None):
        """
        Initialize the VFT application with specified paths and configurations.

        Parameters
        -------------
        vft_path, str
            The file path to the VFT directory. This path is also used as the static folder for the Flask app.
        cloud_path, str, optional
            The file path to store and serve point cloud streams. Defaults to None.
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

        # copy required files from rockhopper.ui
        rockhopper.ui.copyTo(vft_path)

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
            # set dev server directory
            self.index['devURL'] = f"http://{self.host}:{self.port}"

            # serve
            return jsonify(self.index)
        
        @self.app.route("/update", methods=['POST'])
        def update():
            """
            Update one of the files in this tour
            """
            # get updated text
            data = request.json
            filename = data['filename']
            content = data['content']
            
            # write relevant file
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
                          "tabs" : {"Notes":["./md/notes_en.md"],
                                    "References":["./md/references_en.md"],
                                    "Help":["./md/help_en.md"]},
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
        with open(os.path.join(self.vft_path, 'index.json'), 'w' ) as f:
            json.dump(self.index, f, indent=2,  )
    
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
                    f.write(defaultMD) # write default text
        
        # add to index.json
        if site is None:
            self.index['tabs'] = self.index.get('tabs',{})
            self.index['tabs'][name] = paths
        else:
            self.index['sites'][site.lower()]['tabs'] = self.index['sites'][site.lower()].get('tabs',{})
            self.index['sites'][site.lower()]['tabs'][name] = paths

    def addCloud( self, site, name, cloud, site_kwds={}, **kwds):
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
            must be `x, y, z, r, g, b`.
        site_kwds : keywords to pass to `self.addSite( ... )` when creating a new site.

        Keywords
        ---------
        All keywords are passed directly to `rockhopper.exportZA(...)`. These should be used
        to e.g., define visualisation styles, highlights and/or masks. 
        """
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