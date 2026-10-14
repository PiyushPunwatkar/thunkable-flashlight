// Converts a TTF into three.js typeface JSON (same output as three's TTFLoader,
// which fetches opentype.js from a CDN at runtime; doing it once here keeps renders offline).
//   node fonts/ttf2typeface.mjs fonts/TitanOne-Regular.ttf fonts/TitanOne.typeface.json
import fs from 'node:fs';
import opentype from 'opentype.js';

const [src, out] = process.argv.slice(2);
const buf = fs.readFileSync(src);
const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const scale = 100000 / ((font.unitsPerEm || 2048) * 72), r = Math.round;
const KEEP = /[A-Za-z0-9 !?.,'&\-]/;
const glyphs = {};
for (const [uni, gi] of Object.entries(font.encoding.cmap.glyphIndexMap)) {
  const ch = String.fromCodePoint(+uni);
  if (!KEEP.test(ch)) continue;
  const g = font.glyphs.get(gi);
  let o = '', px = null, py = null;
  for (const c of g.path.commands) {
    // drop zero-length segments: they give NaN bevel normals in ExtrudeGeometry
    if ((c.type === 'L' || c.type === 'Q' || c.type === 'C') && r(c.x * scale) === px && r(c.y * scale) === py) continue;
    if (c.x !== undefined) { px = r(c.x * scale); py = r(c.y * scale); }
    o += (c.type === 'C' ? 'b' : c.type.toLowerCase()) + ' ';
    for (const [x, y] of [['x', 'y'], ['x1', 'y1'], ['x2', 'y2']]) if (c[x] !== undefined) o += `${r(c[x] * scale)} ${r(c[y] * scale)} `;
  }
  glyphs[ch] = { ha: r(g.advanceWidth * scale), x_min: r((g.xMin ?? 0) * scale), x_max: r((g.xMax ?? 0) * scale), o };
}
const h = font.tables.head;
fs.writeFileSync(out, JSON.stringify({
  glyphs, familyName: font.getEnglishName('fullName'), ascender: r(font.ascender * scale), descender: r(font.descender * scale),
  underlinePosition: font.tables.post.underlinePosition, underlineThickness: font.tables.post.underlineThickness,
  boundingBox: { xMin: h.xMin, xMax: h.xMax, yMin: h.yMin, yMax: h.yMax }, resolution: 1000,
}));
console.log(out, Object.keys(glyphs).length, 'glyphs');
