"""
Some useful utility functions for e.g., converting data types.
"""
import numpy as np
def equirect_to_latlon( output_path, front, right, back, left, top, bottom ):
    """
    Convert an equirectangular "cube" panorama with six separate face images to a single equirectangular image.
    """
    try:
        from PIL import Image
    except:
        assert False, "Please install the Pillow library to use this function. You can do so with 'pip install Pillow'."
    
    # Load cube faces and ensure they're all the same size
    def load_cube_faces(face_paths):
        return {
            name: np.array(Image.open(path).convert('RGB'))
            for name, path in face_paths.items()
        }
    
    face_paths = {
        'front': front,
        'right': right,
        'back': back,
        'left': left,
        'top': top,
        'bottom': bottom 
    }
    faces = load_cube_faces(face_paths)
    face_size = faces['front'].shape[0]  # assumes square faces

    # Resolution of output image
    out_width, out_height = face_size*4, face_size*2

    # Generate lat/lon grid
    i = np.linspace(0, out_width - 1, out_width)
    j = np.linspace(0, out_height - 1, out_height)
    lon = (i / out_width - 0.5) * 2 * np.pi  # -π to π
    lat = (0.5 - j / out_height) * np.pi     # π/2 to -π/2
    lon, lat = np.meshgrid(lon, lat)

    # Convert to 3D Cartesian coordinates
    x = np.cos(lat) * np.sin(lon)
    y = np.sin(lat)
    z = np.cos(lat) * np.cos(lon)

    # Determine dominant axis per direction (face selection)
    abs_x, abs_y, abs_z = np.abs(x), np.abs(y), np.abs(z)
    max_axis = np.argmax([abs_x, abs_y, abs_z], axis=0)

    # Initialize face maps and coordinates
    face_indices = np.empty((out_height, out_width), dtype='<U6')  # face name per pixel
    u = np.zeros_like(x)
    v = np.zeros_like(y)

    # Helper: normalize to 0–1
    def norm_coords(a):
        return (a + 1) / 2

    # RIGHT face
    mask = (max_axis == 0) & (x > 0)
    face_indices[mask] = 'right'
    u[mask] = norm_coords(-z[mask] / abs_x[mask])
    v[mask] = norm_coords(-y[mask] / abs_x[mask])

    # LEFT face
    mask = (max_axis == 0) & (x <= 0)
    face_indices[mask] = 'left'
    u[mask] = norm_coords(z[mask] / abs_x[mask])
    v[mask] = norm_coords(-y[mask] / abs_x[mask])

    # TOP face
    mask = (max_axis == 1) & (y > 0)
    face_indices[mask] = 'top'
    u[mask] = norm_coords(x[mask] / abs_y[mask])
    v[mask] = norm_coords(z[mask] / abs_y[mask])

    # BOTTOM face
    mask = (max_axis == 1) & (y <= 0)
    face_indices[mask] = 'bottom'
    u[mask] = norm_coords(x[mask] / abs_y[mask])
    v[mask] = norm_coords(-z[mask] / abs_y[mask])

    # FRONT face
    mask = (max_axis == 2) & (z > 0)
    face_indices[mask] = 'front'
    u[mask] = norm_coords(x[mask] / abs_z[mask])
    v[mask] = norm_coords(-y[mask] / abs_z[mask])

    # BACK face
    mask = (max_axis == 2) & (z <= 0)
    face_indices[mask] = 'back'
    u[mask] = norm_coords(-x[mask] / abs_z[mask])
    v[mask] = norm_coords(-y[mask] / abs_z[mask])

    # Convert normalized UV to pixel indices
    face_px = np.clip((u * (face_size - 1)).astype(int), 0, face_size - 1)
    face_py = np.clip((v * (face_size - 1)).astype(int), 0, face_size - 1)

    # Prepare output image
    output = np.zeros((out_height, out_width, 3), dtype=np.uint8)

    # Fill output image by sampling each face
    for face_name, face_img in faces.items():
        mask = face_indices == face_name
        output[mask] = face_img[face_py[mask], face_px[mask]]

    # Save the final panorama
    Image.fromarray(output).save(output_path)
    print("Saved equirectangular image to %s"%output_path)