// Headless renderer: serves the scene, steps the timeline frame by frame and
// writes JPEG frames (or preview stills) to disk.
//
//   node render.mjs stills <outDir> <t1,t2,...> [scale]
//   node render.mjs frames <outDir> <startFrame> <endFrame> [fps]
//   node render.mjs events <outFile>
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

const [mode, out, a, b, c] = process.argv.slice(2);
const scale = mode === 'stills' ? parseFloat(b || '0.5') : 1;
const W = Math.round(1080 * scale), H = Math.round(1920 * scale);

const srv = await serve();
const browser = await chromium.launch({
  executablePath: fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.error('[page]', m.text()); });
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${srv.address().port}/src/index.html?w=${W}&h=${H}&msaa=${process.env.MSAA ?? 4}&bokeh=${process.env.BOKEH ?? 1}`, { waitUntil: "domcontentloaded", timeout: 300000 });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 600000 });

if (mode === 'events') {
  const ev = await page.evaluate(() => window.getEvents());
  fs.writeFileSync(out, JSON.stringify(ev, null, 1));
} else {
  fs.mkdirSync(out, { recursive: true });
  const shoot = async (t, file, q) => {
    await page.evaluate((tt) => window.renderAt(tt), t);
    const buf = await page.screenshot({ type: 'jpeg', quality: q, clip: { x: 0, y: 0, width: W, height: H } });
    fs.writeFileSync(file, buf);
  };
  if (mode === 'stills') {
    for (const t of a.split(',').map(Number)) {
      const t0 = Date.now();
      await shoot(t, path.join(out, `still_${t.toFixed(2)}.jpg`), +(process.env.Q || 88));
      console.log(`t=${t} ${Date.now() - t0}ms`);
    }
  } else {
    const fps = parseFloat(c || '30');
    const s = parseInt(a, 10), e = parseInt(b, 10);
    const t0 = Date.now();
    for (let f = s; f < e; f++) {
      const file = path.join(out, `f_${String(f).padStart(5, '0')}.jpg`);
      if (process.env.SKIP_EXISTING && fs.existsSync(file) && fs.statSync(file).size > 0) continue;
      await shoot(f / fps, file, 94);
      if ((f - s) % 50 === 0) console.log(`frame ${f} (${((Date.now() - t0) / (f - s + 1)).toFixed(0)} ms/frame)`);
    }
  }
}
await browser.close();
srv.close();
