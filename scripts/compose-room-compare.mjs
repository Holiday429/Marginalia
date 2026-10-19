// Builds tests/screenshots/phase-1/room-compare.png: each camera pose, before | after, side by side.
import sharp from 'sharp';
const dir = 'tests/screenshots/phase-1';
const poses = ['front', 'approach', 'shelf', 'notes'];
const W = 720;
const H = 450;
const tiles = [];
for (let row = 0; row < poses.length; row++) {
  for (const [col, tag] of ['before', 'after'].entries()) {
    const buf = await sharp(`${dir}/room-${tag}-${poses[row]}.png`).resize(W, H).toBuffer();
    tiles.push({ input: buf, left: col * W, top: row * H });
  }
}
await sharp({ create: { width: W * 2, height: H * poses.length, channels: 3, background: '#222222' } })
  .composite(tiles).png({ compressionLevel: 9 }).toFile(`${dir}/room-compare.png`);
process.stdout.write('wrote room-compare.png (left: before, right: after; rows: front, approach, shelf, notes)\n');
