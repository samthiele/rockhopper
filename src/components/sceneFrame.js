// Shared coordinate frame for clouds and meshes on one site.
// Clouds stay at the origin in their centered frame (existing tours).
// A mesh is drawn at (meshOrigin - sceneOrigin) so survey coordinates line up.

export function resetFrame(three) {
  const listeners = (three.current.frame && three.current.frame.listeners) || new Set();
  three.current.frame = { origin: null, lockedByCloud: false, listeners };
}

export function noteOrigin(three, origin, isCloud) {
  const frame = three.current.frame || { origin: null, lockedByCloud: false, listeners: new Set() };
  three.current.frame = frame;
  const next = origin.map(Number);
  let changed = false;
  if (isCloud) {
    if (!frame.lockedByCloud) {
      frame.origin = next;
      frame.lockedByCloud = true;
      changed = true;
    }
  } else if (!frame.origin) {
    frame.origin = next;
    changed = true;
  }
  if (changed) frame.listeners.forEach((fn) => fn());
  return frame.origin;
}

export function offsetFromFrame(three, origin) {
  const base = (three.current.frame && three.current.frame.origin) || origin;
  return origin.map((value, i) => Number(value) - Number(base[i]));
}
