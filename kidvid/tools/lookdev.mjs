// Screenshot the look-dev turnaround:  node tools/lookdev.mjs out.jpg [species] [poseJSON] [fur 0|1]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
const [out, species = 'puppy', pose = '{}', fur = '1'] = process.argv.slice(2);
const srv = http.createServer((q, r) => { const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(r); });
await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const pg = await b.newPage({ viewport: { width: 1200, height: 900 } });
pg.on('pageerror', (e) => console.error('[pageerror]', e.message)); pg.on('console', (m) => m.type() === 'error' && console.error('[page]', m.text()));
await pg.goto(`http://127.0.0.1:${srv.address().port}/kidvid/tools/lookdev.html?species=${species}&fur=${fur}&pose=${encodeURIComponent(pose)}`);
await pg.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
fs.writeFileSync(out, await pg.screenshot({ type: 'jpeg', quality: 88 }));
await b.close(); srv.close();
