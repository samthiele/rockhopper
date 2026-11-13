import React, { useEffect, useRef } from 'react';
import * as THREE from "three";
import { disposeAndRemove } from './dispose3d';

function track(entry, object) {
    if (!entry) return;
    if (!entry.objects.current.includes(object)) entry.objects.current.push(object);
    object.visible = entry.visible && !object.userData.superseded;
}

const PhotosphereViewer = ({ tour, site, three, init, url, name, view, frameCamera = true }) => {
    const sphereRef = useRef(null);
    const layerRef = useRef(null);

    useEffect(() => {
        const entry = { id: url, name: name || 'photosphere', kind: 'photosphere', visible: true, objects: { current: [] } };
        layerRef.current = entry;
        if (three.current.registerLayer) three.current.registerLayer(entry);
        return () => {
            if (three.current.unregisterLayer) three.current.unregisterLayer(url);
            layerRef.current = null;
        };
    }, [url, name]);

    // load photosphere texture and build geometry
    useEffect(() => {
        if (!site) return;
        if (!init) return;

        let cancelled = false;
        console.log(`Loading photosphere from ${url}`);
        if (frameCamera || !three.current.mixed) {
            three.current.pointSize = 0.25; // fixed size for photospheres
        }

        const image = new Image();
        image.onload = () => {
            if (cancelled) return;
            const texture = new THREE.Texture(image);
            texture.colorSpace = THREE.SRGBColorSpace; // Correct sRGB handling
            texture.needsUpdate = true;
            const geometry = new THREE.SphereGeometry(100, 60, 40);
            geometry.scale(-1, 1, 1); // Invert the sphere to view the texture from the inside
            const material = new THREE.MeshBasicMaterial({ map: texture });
            const sphere = new THREE.Mesh(geometry, material);
            sphere.frustumCulled = false; // the camera sits inside the sphere
            sphere.userData.blockDelete=true;
            sphere.userData.pickable=true;
            if (sphereRef.current) {
                disposeAndRemove(three.current.scene, sphereRef.current);
            }
            three.current.scene.add(sphere);
            sphereRef.current = sphere;
            track(layerRef.current, sphere);
            if (three.current.invalidate) three.current.invalidate();
        };
        image.onerror = () => {
            if (!cancelled) console.error(`Error loading photosphere from ${url}`);
        };
        image.src = url;

        // set camera position
        const cameraView = view || (tour.sites[site] && tour.sites[site].view);
        if (frameCamera && three.current.viewMode !== 'model' && cameraView && cameraView.tgt){
                  const center = new THREE.Vector3(...cameraView.tgt);
                  const pos = cameraView.pos;
                  three.current.camera.position.set(...pos);
                  three.current.camera.lookAt(center);
                  three.current.controls.target.copy(center);
                  three.current.controls.update();
                  three.current.camera.updateProjectionMatrix();
                  if (three.current.invalidate) three.current.invalidate();
            }

        return () => {
            cancelled = true;
            image.onload = null;
            image.onerror = null;
            image.src = '';
            disposeAndRemove(three.current.scene, sphereRef.current);
            sphereRef.current = null;
        };
    }, [init, url, frameCamera]);

    // return nothing
    return <div id="photosphere"></div>;
};

export default PhotosphereViewer;
