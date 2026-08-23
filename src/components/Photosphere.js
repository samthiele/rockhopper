import React, { useEffect, useRef } from 'react';
import * as THREE from "three";
import { disposeAndRemove } from './dispose3d';

const PhotosphereViewer = ({ tour, site, three, init, currentMedia }) => {
    const sphereRef = useRef(null);
    
    // load photosphere texture and build geometry
    useEffect(() => {
        if (!site) return;
        if (!init) return;

        let cancelled = false;
        console.log(`Loading photosphere from ${currentMedia}`);
        three.current.pointSize = 0.25; // fixed size for photospheres

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
            sphere.userData.blockDelete=true;
            sphere.userData.pickable=true;
            if (sphereRef.current) {
                disposeAndRemove(three.current.scene, sphereRef.current);
            }
            three.current.scene.add(sphere);
            sphereRef.current = sphere;
            if (three.current.invalidate) three.current.invalidate();
        };
        image.onerror = () => {
            if (!cancelled) console.error(`Error loading photosphere from ${currentMedia}`);
        };
        image.src = currentMedia;

        // set camera position
        if (site in tour.sites 
            && tour.sites[site].view
            && tour.sites[site].view.tgt){
                  const center = new THREE.Vector3(...tour.sites[site].view.tgt);
                  const pos = tour.sites[site].view.pos;
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
    }, [init, currentMedia]);

    // return nothing
    return <div id="photosphere"></div>;
};

export default PhotosphereViewer;
