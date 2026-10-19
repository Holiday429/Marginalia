// Builds the three static legal pages (plan 1.8): public/privacy, public/terms, public/credits.
//   npm run legal:build
// Credits are generated from the glTF `asset.extras` (title, author, licence, source) of the models
// that actually ship in public/3d, so it can never list something that is not loaded, or miss one.
// The pages use no third-party requests (system fonts) and are plain HTML so they work on any host.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { PROCESSORS, privacySections, termsSections } from './legal/content.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(join(root, 'scripts/legal/legal.config.json'), 'utf8'));

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Tiny inline formatter: **bold** only. */
const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

// Static pages sit outside the app's CSS pipeline, so they carry their own small stylesheet.
// Palette mirrors src/core/base.css (paper / ink); system fonts avoid any third-party request.
const STYLE = `
:root{--paper:#e8dfc8;--ink:#1a1714;--bg:#26231f;--muted:rgba(232,223,200,.68);--line:rgba(232,223,200,.22);--accent:#d9b877}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--paper);font:17px/1.65 Georgia,'Times New Roman',serif}
main{max-width:760px;margin:0 auto;padding:40px 20px 80px}
a{color:var(--accent)}
h1{font-size:34px;line-height:1.2;margin:8px 0 4px}
h2{font-size:21px;margin:36px 0 8px}
p,li{margin:8px 0}
ul{padding-left:22px}
.meta,.back,footer{font:13px/1.5 ui-monospace,Menlo,Consolas,monospace;color:var(--muted)}
.draft{border:1px solid var(--accent);padding:10px 14px;margin:18px 0;font:13px/1.5 ui-monospace,Menlo,Consolas,monospace;color:var(--accent)}
table{width:100%;border-collapse:collapse;font-size:15px}
th,td{text-align:left;vertical-align:top;border-top:1px solid var(--line);padding:10px 8px 10px 0}
th{font:12px ui-monospace,Menlo,Consolas,monospace;color:var(--muted);border-top:0}
nav.legal{display:flex;flex-wrap:wrap;gap:6px 18px;margin-top:48px;padding-top:14px;border-top:1px solid var(--line)}
nav.legal a{display:inline-flex;align-items:center;min-height:44px;font:13px ui-monospace,Menlo,Consolas,monospace}
`;

const NAV = `<nav class="legal" aria-label="Legal"><a href="../privacy/">Privacy</a><a href="../terms/">Terms</a><a href="../credits/">Credits</a></nav>`;

function page({ title, intro, body }) {
  const draft = config.draft
    ? `<p class="draft" role="note">Draft — this text has not been reviewed yet and may change before launch.</p>`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — ${esc(config.productName)}</title>
<meta name="robots" content="index,follow">
<style>${STYLE}</style>
</head>
<body>
<main>
<p class="back"><a href="../">← ${esc(config.productName)}</a></p>
<h1>${esc(title)}</h1>
<p class="meta">Last updated ${esc(config.lastUpdated)}</p>
${draft}
${intro ? `<p>${inline(intro)}</p>` : ''}
${body}
${NAV}
<footer><p>${esc(config.productName)}</p></footer>
</main>
</body>
</html>
`;
}

function renderSections(sections) {
  return sections.map((s) => {
    const parts = [`<h2>${esc(s.h)}</h2>`];
    (s.p ?? []).forEach((p) => parts.push(`<p>${inline(p)}</p>`));
    if (s.ul) parts.push(`<ul>${s.ul.map((li) => `<li>${inline(li)}</li>`).join('')}</ul>`);
    if (s.table) {
      parts.push(`<table><thead><tr><th>Provider</th><th>Why</th><th>What they receive</th></tr></thead><tbody>${
        PROCESSORS.map((p) => `<tr><td><a href="${esc(p.link)}" rel="noopener">${esc(p.name)}</a></td><td>${esc(p.purpose)}</td><td>${esc(p.data)}</td></tr>`).join('')
      }</tbody></table>`);
    }
    return parts.join('\n');
  }).join('\n');
}

/** Models that ship, with the licence data stored inside each GLB. */
export async function readShippedModels() {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const manifest = readFileSync(join(root, 'src/three/asset-manifest.generated.ts'), 'utf8');
  const files = [...manifest.matchAll(/'(3d\/[^']+\.glb)'/g)].map((m) => m[1]);
  const models = [];
  for (const file of files) {
    const extras = (await io.read(join(root, 'public', file))).getRoot().getAsset().extras ?? {};
    const licence = String(extras.license ?? '');
    models.push({
      file,
      title: String(extras.title ?? ''),
      author: String(extras.author ?? ''),
      source: String(extras.source ?? ''),
      licenceName: licence.replace(/\s*\(.*\)\s*$/, '') || 'Unknown',
      licenceUrl: /\((https?:[^)]+)\)/.exec(licence)?.[1] ?? '',
    });
  }
  return models.sort((a, b) => a.title.localeCompare(b.title));
}

function authorParts(author) {
  const m = /^(.*?)\s*\((https?:[^)]+)\)\s*$/.exec(author);
  return m ? { name: m[1], url: m[2] } : { name: author, url: '' };
}

function creditsBody(models) {
  const rows = models.map((m) => {
    const a = authorParts(m.author);
    const authorHtml = a.url ? `<a href="${esc(a.url)}" rel="noopener">${esc(a.name)}</a>` : esc(a.name);
    const lic = m.licenceUrl ? `<a href="${esc(m.licenceUrl)}" rel="noopener">${esc(m.licenceName)}</a>` : esc(m.licenceName);
    return `<tr><td><a href="${esc(m.source)}" rel="noopener">${esc(m.title)}</a></td><td>${authorHtml}</td><td>${lic}</td></tr>`;
  }).join('');
  return `
<h2>3D models</h2>
<p>The study room is built from these models. Each is used under the licence shown; we resized textures and compressed the files for the web. Titles link to the original.</p>
<table><thead><tr><th>Model</th><th>Author</th><th>Licence</th></tr></thead><tbody>${rows}</tbody></table>
<h2>Textures</h2>
<p>Wall, floor, desk and board surfaces: <a href="https://polyhaven.com" rel="noopener">Poly Haven</a> (CC0). Carpet: <a href="https://ambientcg.com" rel="noopener">ambientCG</a> (CC0).</p>
<h2>Software and type</h2>
<p>Rendering by <a href="https://threejs.org" rel="noopener">three.js</a> (MIT). Type: Fraunces, IBM Plex Mono and Bodoni Moda (SIL Open Font License).</p>`;
}

export async function buildPages() {
  const models = await readShippedModels();
  return {
    'privacy/index.html': page({ title: 'Privacy Policy', body: renderSections(privacySections(config)) }),
    'terms/index.html': page({ title: 'Terms of Service', body: renderSections(termsSections(config)) }),
    'credits/index.html': page({ title: 'Credits', body: creditsBody(models) }),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const pages = await buildPages();
  for (const [rel, html] of Object.entries(pages)) {
    const out = join(root, 'public', rel);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, html);
    process.stdout.write(`wrote public/${rel}\n`);
  }
}
