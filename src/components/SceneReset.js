import { useEffect } from 'react';
import { disposeSceneContents } from './dispose3d';
import { resetFrame } from './sceneFrame';

// First child of ThreeScene. Its effect runs before sibling content effects,
// so the previous site's objects are gone before the next cloud or mesh is added.
const SceneReset = ({ three, mediaKey }) => {
  useEffect(() => {
    if (three.current.scene) {
      disposeSceneContents(three.current.scene);
    }
    resetFrame(three);
    if (three.current.invalidate) three.current.invalidate();
  }, [mediaKey]);
  return null;
};

export default SceneReset;
