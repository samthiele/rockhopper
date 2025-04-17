"""
Directory containing javascript, html and css elements used by the front-end React app.
"""
import os
import shutil
root = os.path.dirname( __file__ )

# specify which files to copy
files = ['icon/', 'static/', 
         'md/help_en.md', 'md/notes_en.md', 'md/references_en.md',
         'asset-manifest.json','index.html','manifest.json','robots.txt']
def copyTo( path, overwrite=False ):
    """
    Copy all needed files to start a RockHopper VFT from this directory to the 
    specified ones.
    """
    os.makedirs(path, exist_ok=True)
    for f in files:
        pth = os.path.join(root, f)
        if (not overwrite) and (os.path.exists( os.path.join(path, f) )): 
            continue # don't overwrite anything pre-existing
        if (".md" in f) and (os.path.exists( os.path.join(path, f) )):
            continue # don't overwrite any markdown files
        if os.path.isdir(pth):
            shutil.copytree(pth, os.path.join(path, f), dirs_exist_ok=True)
        else:
            os.makedirs( os.path.dirname( os.path.join(path, f)), 
                        exist_ok=True )
            shutil.copy(pth, os.path.join(path, f))

def ingest( source ):
    """
    Ingest the required RockHopper files into this directory. Useful after 
    e.g., rebuilding the React app.
    """
    for f in files:
        inpth = os.path.join(source, f)
        outpth = os.path.join(root, f)
        assert os.path.exists(inpth), "Error - required file %s not found"%f

        # clean
        if os.path.exists(outpth):
            if os.path.isdir(outpth):
                shutil.rmtree(outpth)
            else:
                os.remove(outpth)
        
        # copy
        if os.path.isdir(inpth):
            shutil.copytree(inpth, outpth, dirs_exist_ok=True)
        else:
            os.makedirs( os.path.dirname(outpth), exist_ok=True )
            shutil.copy(inpth, outpth)