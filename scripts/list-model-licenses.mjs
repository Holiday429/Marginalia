// Prints the licence metadata (glTF asset.extras / copyright) of 3D models.
//   node scripts/list-model-licenses.mjs [dir]      default: assets-src/3d (all originals)
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const dir = process.argv[2] || 'assets-src/3d';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
for (const f of readdirSync(dir).filter((x) => x.endsWith('.glb')).sort()) {
  const asset = (await io.read(join(dir, f))).getRoot().getAsset();
  const ex = asset.extras ?? {};
  process.stdout.write(`${f.padEnd(40)} ${JSON.stringify({ generator: asset.generator, copyright: asset.copyright, ...ex }).slice(0, 300)}\n`);
}
