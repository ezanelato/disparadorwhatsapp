import { build } from 'esbuild';
import { mkdir, readFile, writeFile, cp, readdir } from 'node:fs/promises';
import path from 'node:path';
import { zipSync } from 'fflate';
import { PNG } from 'pngjs';

const root = process.cwd(), out = path.join(root, 'dist');
const brand = JSON.parse(await readFile('brand.json', 'utf8'));
await mkdir(out, { recursive: true });
await mkdir('public/icons', { recursive: true });
// Original geometric mark. Replace the PNGs after build or edit this function.
for (const size of [16, 32, 48, 128]) {
  const png = new PNG({ width: size, height: size });
  const rgb = hex => hex.match(/[a-f\d]{2}/gi).map(s => parseInt(s, 16));
  const green = rgb(brand.primary), gold = rgb(brand.accent);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size, i = (y * size + x) * 4;
    const inside = u > .04 && u < .96 && v > .04 && v < .96;
    const mark = u > .27 && u < .73 && ((v > .27 && v < .36) || (v > .64 && v < .73) || (v > .33 && v < .67 && Math.abs(u + v - 1) < .065));
    png.data.set(mark ? gold : green, i); png.data[i + 3] = inside ? 255 : 0;
  }
  await writeFile(`public/icons/icon-${size}.png`, PNG.sync.write(png));
}
await cp('public', out, { recursive: true });
await mkdir(path.join(out, 'examples'), { recursive: true });
await cp('examples/leads.csv', path.join(out, 'examples/leads.csv'));
const common = { bundle: true, minify: true, target: 'chrome120', legalComments: 'eof', logLevel: 'info', plugins: [{ name: 'local-xlsx-unzip', setup(b) {
  b.onResolve({ filter: /unzipFromArrayBuffer\.js$/ }, args => args.importer.includes('read-excel-file') ? { path: path.join(root, 'src/core/bounded-unzip.ts') } : undefined);
} }] };
await build({ ...common, entryPoints: { panel: 'src/ui/panel.ts', worker: 'src/worker.ts' }, outdir: out, format: 'esm' });
await build({ ...common, entryPoints: ['src/content.ts'], outfile: path.join(out, 'content.js'), format: 'iife' });
const css = await readFile(path.join(out, 'panel.css'), 'utf8');
await writeFile(path.join(out, 'panel.css'), `${css}\n:root{--primary:${brand.primary};--accent:${brand.accent}}\n`);
const manifest = {
  manifest_version: 3, name: brand.name, version: brand.version, description: brand.description, minimum_chrome_version: '120',
  permissions: ['storage', 'alarms', 'sidePanel'], host_permissions: ['https://web.whatsapp.com/*'],
  background: { service_worker: 'worker.js', type: 'module' },
  action: { default_title: `Abrir ${brand.name}`, default_icon: { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png' } },
  icons: { 16: 'icons/icon-16.png', 48: 'icons/icon-48.png', 128: 'icons/icon-128.png' },
  side_panel: { default_path: 'panel.html' },
  content_scripts: [{ matches: ['https://web.whatsapp.com/*'], js: ['content.js'], run_at: 'document_idle', all_frames: false }],
  content_security_policy: { extension_pages: "script-src 'self'; object-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none'" },
};
await writeFile(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
for (const name of ['LICENSE', 'README.md', 'PRIVACY.md', 'THIRD_PARTY_NOTICES.md']) await cp(name, path.join(out, name));
await mkdir(path.join(out, 'licenses'), { recursive: true });
for (const name of ['csv-parse', 'libphonenumber-js', 'read-excel-file', 'fflate']) {
  const dir = path.join('node_modules', name);
  const licenses = (await readdir(dir)).filter(n => /^(license|licence)/i.test(n));
  for (const n of licenses) await cp(path.join(dir, n), path.join(out, 'licenses', `${name}-${n}`));
}
const files = {};
async function collect(dir, prefix = '') {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name), key = prefix + item.name;
    if (item.isDirectory()) await collect(file, key + '/'); else files[key] = new Uint8Array(await readFile(file));
  }
}
await collect(out);
await mkdir('release', { recursive: true });
await writeFile(`release/zaplista-${brand.version}.zip`, zipSync(files, { level: 9 }));
console.log(`Extensão: ${out}\nZIP: release/zaplista-${brand.version}.zip`);
