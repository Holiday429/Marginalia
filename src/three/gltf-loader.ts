// Marginalia · shared GLB loader.
// - One GLTFLoader with the Meshopt decoder every optimized model needs (no Draco: nothing uses it).
// - Each URL is fetched at most once; every caller parses its own copy of the bytes, so
//   the room, the map globe and the fly-in overlays never share (or dispose) GPU resources.

import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

let loader: GLTFLoader | null = null;
const bytesByUrl = new Map<string, Promise<ArrayBuffer>>();

function getLoader(): GLTFLoader {
  if (!loader) {
    loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
  }
  return loader;
}

export function fetchGLBBytes(url: string): Promise<ArrayBuffer> {
  let pending = bytesByUrl.get(url);
  if (!pending) {
    pending = fetch(url).then((res) => {
      if (!res.ok) throw new Error(`GLB request failed (${res.status}): ${url}`);
      return res.arrayBuffer();
    });
    bytesByUrl.set(url, pending);
    pending.catch(() => bytesByUrl.delete(url)); // let a later caller retry
  }
  return pending;
}

export async function loadGLB(url: string): Promise<GLTF> {
  const bytes = await fetchGLBBytes(url);
  return getLoader().parseAsync(bytes.slice(0), '');
}

/** Drop-in for `new GLTFLoader().load(url, onLoad, onProgress, onError)`. */
export function loadGLBCb(
  url: string,
  onLoad: (gltf: GLTF) => void,
  _onProgress?: unknown,
  onError?: (error: unknown) => void,
): void {
  loadGLB(url).then(onLoad, (err) => onError?.(err));
}

/** Warm the cache without parsing (e.g. start the globe download while the room loads). */
export function preloadGLB(url: string): void {
  fetchGLBBytes(url).catch(() => undefined);
}
