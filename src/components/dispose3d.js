// Free GPU resources for Three.js objects. scene.remove() only drops the
// graph link; buffers, programs, and textures stay until dispose().

export function disposeMaterial(material) {
  if (!material || (material.userData && material.userData.shared)) return;
  for (const key of Object.keys(material)) {
    const value = material[key];
    if (value && value.isTexture) value.dispose();
  }
  material.dispose();
}

export function disposeObject3D(object) {
  if (!object) return;
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) child.material.forEach(disposeMaterial);
      else disposeMaterial(child.material);
    }
    if (child.element && child.element.parentNode) {
      child.element.parentNode.removeChild(child.element);
    }
  });
}

export function disposeAndRemove(scene, object) {
  if (!object) return;
  if (scene) scene.remove(object);
  disposeObject3D(object);
}

export function disposeSceneContents(scene) {
  if (!scene) return;
  for (let i = scene.children.length - 1; i >= 0; i--) {
    const child = scene.children[i];
    scene.remove(child);
    disposeObject3D(child);
  }
}
