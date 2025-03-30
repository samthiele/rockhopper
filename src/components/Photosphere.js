import React, { useEffect, useRef, useState } from 'react';
import * as THREE from "three";

const PhotosphereViewer = ({ tour, site, three, init, currentMedia }) => {
    
    // load photosphere texture and build geometry
    useEffect(() => {
        if (!site) return;
        if (!init) return;

        // Load photosphere
        console.log(`Loading photosphere from ${currentMedia}`);
        three.current.pointSize = 0.25; // fixed size for photospheres
        const loader = new THREE.TextureLoader();
        loader.load(currentMedia, (texture) => {
            const geometry = new THREE.SphereGeometry(100, 60, 40);
            geometry.scale(-1, 1, 1); // Invert the sphere to view the texture from the inside
            //three.current.camera.lookAt([100,0,0]); // look along the x-axis 
            const material = new THREE.MeshBasicMaterial({ map: texture });
            const sphere = new THREE.Mesh(geometry, material);
            sphere.userData.blockDelete=true;
            three.current.scene.add(sphere);
        });

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
            }
    }, [init, currentMedia]);

    // return nothing
    return <div id="photosphere"></div>;
};

export default PhotosphereViewer;