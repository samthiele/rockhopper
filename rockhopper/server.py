from flask import Flask, send_from_directory, jsonify, send_file
from flask_cors import CORS
import os

def testServer(dataset, port=3003):
    """
    Launch a very basic test server that builds a test virtual field trip around the
    specified dataset.
    """
    from rockhopper import ui
    root = os.path.dirname( ui.__file__ )
    print(root)
    app = Flask(__name__, static_folder=root)
    CORS(app)

    @app.route("/<path:filename>", methods=["GET"])
    def serve_file(filename):
        # map cloud.zarr to the specified dataset
        if 'cloud.zarr' in filename:
            pth = os.path.join( dataset, filename.split('.zarr')[1][1:])
            print('%s:%s'%(filename, pth))
            return send_file(pth)
        
        # everything else just gets sent from the static folder
        return send_from_directory(app.static_folder, filename)
    
    # launch!
    app.run(port=port)

def fileServer( root, port=3002):
    """
    Launch a very basic flask file server for testing rockhopper datasets and tours.
    """
    app = Flask(__name__, static_folder=root)  # Serve from specified directory
    CORS(app)  # Enable CORS for all domains
    @app.route("/<path:filename>")
    def serve_file(filename):
        return send_from_directory(app.static_folder, filename)
    app.run(port=port, debug=True)

# launch in the current directory
if __name__ == "__main__":
    #fileServer( '/Users/thiele67/Documents/Python/rockhopper/sandbox' )
    fileServer('/Users/thiele67/Documents/data/LaPalma')