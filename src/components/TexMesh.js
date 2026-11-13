import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { disposeAndRemove } from './dispose3d';
import { noteOrigin, offsetFromFrame } from './sceneFrame';

function joinUrl(manifestUrl, relative) {
  const dir = manifestUrl.replace(/[^/]+$/, '');
  return dir + relative;
}

function track(entry, object) {
  if (!entry) return;
  if (!entry.objects.current.includes(object)) entry.objects.current.push(object);
  object.visible = entry.visible && !object.userData.superseded;
}

function configureTexture(texture) {
  texture.colorSpace = THREE.SRGBColorSpace;
  // OBJ and map coordinates put v = 0 at the bottom of the image.
  // Three.js flips the upload by default so that matches; leaving
  // flipY false samples the gray padding between atlas charts.
  texture.flipY = true;
  texture.needsUpdate = true;
  return texture;
}

const TexMesh = ({ tour, site, three, init, url, name, frameCamera, setPointSize }) => {
  const meshRef = useRef(null);
  const originRef = useRef(null);
  const layerRef = useRef(null);
  const materialRef = useRef(null);
  const stylesRef = useRef(null);
  const cacheRef = useRef({});
  const showStyleRef = useRef(() => {});
  const activeName = useRef(null);
  const [styleNames, setStyleNames] = useState(null);
  const [activeStyle, setActiveStyle] = useState(null);
  activeName.current = activeStyle;

  useEffect(() => {
    const entry = { id: url, name: name || 'mesh', kind: 'model', visible: true, objects: { current: [] } };
    layerRef.current = entry;
    if (three.current.registerLayer) three.current.registerLayer(entry);
    return () => {
      if (three.current.unregisterLayer) three.current.unregisterLayer(url);
      layerRef.current = null;
    };
  }, [url, name]);

  useEffect(() => {
    if (!init || !url) return;
    let cancelled = false;
    const place = () => {
      const mesh = meshRef.current;
      const origin = originRef.current;
      if (!mesh || !origin) return;
      const delta = offsetFromFrame(three, origin);
      mesh.position.set(delta[0], delta[1], delta[2]);
      if (three.current.invalidate) three.current.invalidate();
    };
    const listeners = three.current.frame && three.current.frame.listeners;
    if (listeners) listeners.add(place);

    const loader = new PLYLoader();
    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
        return response.json();
      })
      .then((manifest) => {
        if (cancelled) return;
        originRef.current = (manifest.origin || [0, 0, 0]).map(Number);
        noteOrigin(three, originRef.current, false);
        const plyUrl = joinUrl(url, manifest.geometry);
        const styled = manifest.styles && manifest.textures && manifest.styles.length > 1;
        stylesRef.current = styled ? manifest.textures : null;

        loader.load(plyUrl, (geometry) => {
          if (cancelled) {
            geometry.dispose();
            return;
          }
          geometry.computeBoundingBox();
          const bbox = geometry.boundingBox;
          const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
          const mesh = new THREE.Mesh(geometry, material);
          mesh.userData.pickable = true;
          mesh.userData.blockDelete = true;
          if (meshRef.current) disposeAndRemove(three.current.scene, meshRef.current);
          three.current.scene.add(mesh);
          meshRef.current = mesh;
          track(layerRef.current, mesh);
          place();

          const size = bbox.getSize(new THREE.Vector3()).length();
          if (setPointSize) three.current.pointSize = Math.max(size * 0.01, 1e-4);

          if (frameCamera && three.current.camera && three.current.viewMode !== 'photosphere') {
            let center = new THREE.Vector3();
            bbox.getCenter(center);
            center.add(mesh.position);
            let pos;
            if (tour.sites[site] && tour.sites[site].view && tour.sites[site].view.tgt) {
              center = new THREE.Vector3(...tour.sites[site].view.tgt);
              pos = tour.sites[site].view.pos;
            } else {
              const dist = size * 1.4;
              pos = [center.x, center.y - dist * 0.6, center.z + dist * 0.45];
            }
            three.current.camera.far = Math.max(three.current.camera.far, size * 20);
            three.current.camera.updateProjectionMatrix();
            three.current.camera.position.set(...pos);
            three.current.camera.lookAt(center);
            three.current.controls.target.copy(center);
            three.current.controls.update();
          }

          materialRef.current = material;
          const textures = new THREE.TextureLoader();
          const applyMap = (texture, disposePrevious) => {
            const previous = material.map;
            material.map = texture;
            material.needsUpdate = true;
            if (disposePrevious && previous && previous !== texture) previous.dispose();
            if (three.current.invalidate) three.current.invalidate();
          };
          if (styled) {
            showStyleRef.current = (styleName) => {
              const entry = stylesRef.current && stylesRef.current[styleName];
              if (!entry || !materialRef.current) return;
              const cached = cacheRef.current[styleName] || (cacheRef.current[styleName] = {});
              if (cached.full) {
                applyMap(cached.full, false);
                return;
              }
              if (cached.preview) applyMap(cached.preview, false);
              else if (!cached.previewStarted) {
                cached.previewStarted = true;
                textures.load(joinUrl(url, entry.preview), (preview) => {
                  configureTexture(preview);
                  cached.preview = preview;
                  if (cancelled || activeName.current !== styleName) return;
                  if (!cached.full) applyMap(preview, false);
                }, undefined, (error) => {
                  if (!cancelled) console.error('Preview texture failed to load', error);
                });
              }
              if (!cached.fullStarted) {
                cached.fullStarted = true;
                textures.load(joinUrl(url, entry.texture), (full) => {
                  configureTexture(full);
                  cached.full = full;
                  if (cached.preview) {
                    if (material.map === cached.preview) material.map = null;
                    cached.preview.dispose();
                    cached.preview = null;
                  }
                  if (cancelled || activeName.current !== styleName) return;
                  applyMap(full, false);
                }, undefined, (error) => {
                  if (!cancelled) console.error('Full-resolution texture failed to load', error);
                });
              }
            };
            const preferred = tour.sites[site] && tour.sites[site].view && tour.sites[site].view.style;
            const initial = manifest.styles.includes(preferred) ? preferred : manifest.styles[0];
            setStyleNames(manifest.styles);
            setActiveStyle(initial);
          } else {
            textures.load(joinUrl(url, manifest.preview), (preview) => {
              if (cancelled) {
                preview.dispose();
                return;
              }
              applyMap(configureTexture(preview), false);
              textures.load(joinUrl(url, manifest.texture), (full) => {
                if (cancelled) {
                  full.dispose();
                  return;
                }
                applyMap(configureTexture(full), true);
              }, undefined, (error) => {
                if (!cancelled) console.error('Full-resolution texture failed to load', error);
              });
            });
          }
          if (three.current.invalidate) three.current.invalidate();
        });
      })
      .catch((error) => {
        if (!cancelled) console.error('Error loading mesh:', error);
      });

    return () => {
      cancelled = true;
      if (listeners) listeners.delete(place);
      const cached = cacheRef.current;
      cacheRef.current = {};
      showStyleRef.current = () => {};
      stylesRef.current = null;
      if (materialRef.current) materialRef.current.map = null;
      Object.values(cached).forEach((entry) => {
        if (entry.preview) entry.preview.dispose();
        if (entry.full) entry.full.dispose();
      });
      disposeAndRemove(three.current.scene, meshRef.current);
      meshRef.current = null;
      materialRef.current = null;
      originRef.current = null;
      setStyleNames(null);
      setActiveStyle(null);
    };
  }, [init, url, frameCamera, setPointSize, site]);

  useEffect(() => {
    if (activeStyle) showStyleRef.current(activeStyle);
  }, [activeStyle]);

  if (!styleNames) return null;
  return (
    <div className="topbuttons">
      <div className="row">
        {styleNames.map((styleName) => (
          <button
            className={`button ${activeStyle === styleName ? 'active' : ''}`}
            onClick={() => setActiveStyle(styleName)}
            key={styleName}
          >
            {styleName}
          </button>
        ))}
      </div>
    </div>
  );
};

export default TexMesh;
