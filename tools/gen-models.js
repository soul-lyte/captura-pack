// Converts Cobblemon Bedrock geometry into Java item models for a resource pack.
//
// Coordinates and rotation signs follow Blockbench's Bedrock importer and its Java Block/Item
// exporter, so a converted model looks like the original opened in Blockbench:
//   - bedrock x is mirrored (x' = -x) and the x and y rotation angles change sign
//   - rotations are Euler angles applied in Z, Y, X order (three.js 'ZYX')
//   - bones are flattened: each cube gets the combined bone and cube transform
//   - Java coordinates put the feet at the middle of the block (x and z shifted by 8)
//   - the displayed pose is the species' ground_idle animation at time zero, because the raw
//     geometry is a rest pose (spread vines, straight limbs) that the idle animation bends
//
// usage: node gen-models.js <asset-dir> <species-dir> <out-pack-dir> [slug ...]
const fs = require('fs');
const path = require('path');

const [assetDir, speciesDir, outDir, ...only] = process.argv.slice(2);
if (!outDir) {
  console.error('usage: node gen-models.js <asset-dir> <species-dir> <out-pack-dir> [slug ...]');
  process.exit(1);
}

// ---- small matrix helpers (3x3 row-major plus translation) ----

const RAD = Math.PI / 180;
const ident = () => ({ R: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 0] });

function mulRR(a, b) {
  const r = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return r;
}
const mulRV = (R, v) => [
  R[0] * v[0] + R[1] * v[1] + R[2] * v[2],
  R[3] * v[0] + R[4] * v[1] + R[5] * v[2],
  R[6] * v[0] + R[7] * v[1] + R[8] * v[2],
];
/** compose(a, b): apply b first, then a. */
const compose = (a, b) => ({ R: mulRR(a.R, b.R), t: mulRV(a.R, b.t).map((x, i) => x + a.t[i]) });

/** Rotation of angles (degrees) in three.js 'ZYX' order: R = Rz * Ry * Rx. */
function eulerZYX(x, y, z) {
  const [cx, sx, cy, sy, cz, sz] = [Math.cos(x * RAD), Math.sin(x * RAD), Math.cos(y * RAD), Math.sin(y * RAD), Math.cos(z * RAD), Math.sin(z * RAD)];
  const Rx = [1, 0, 0, 0, cx, -sx, 0, sx, cx];
  const Ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
  const Rz = [cz, -sz, 0, sz, cz, 0, 0, 0, 1];
  return mulRR(Rz, mulRR(Ry, Rx));
}

/** Inverse of eulerZYX, as three.js Euler.setFromRotationMatrix does for order 'ZYX'. */
function toEulerZYX(R) {
  const [m11, m12, , m21, m22, , m31, m32, m33] = R;
  const y = Math.asin(-Math.max(-1, Math.min(1, m31)));
  let x;
  let z;
  if (Math.abs(m31) < 0.9999999) {
    x = Math.atan2(m32, m33);
    z = Math.atan2(m21, m11);
  } else {
    x = 0;
    z = Math.atan2(-m12, m22);
  }
  return [x / RAD, y / RAD, z / RAD];
}

/** Rotation (degrees, ZYX) and scale about a point, then a translation, as a transform. */
function aboutPoint(origin, euler, scale = [1, 1, 1], pos = [0, 0, 0]) {
  const Rr = eulerZYX(...euler);
  const L = [
    Rr[0] * scale[0], Rr[1] * scale[1], Rr[2] * scale[2],
    Rr[3] * scale[0], Rr[4] * scale[1], Rr[5] * scale[2],
    Rr[6] * scale[0], Rr[7] * scale[1], Rr[8] * scale[2],
  ];
  const moved = mulRV(L, origin);
  return { R: L, t: origin.map((o, i) => o - moved[i] + pos[i]) };
}

// ---- animation pose at time zero ----

const MOLANG_DEG = (f) => (x) => f(x * RAD);
const MOLANG = {
  sin: MOLANG_DEG(Math.sin), cos: MOLANG_DEG(Math.cos), abs: Math.abs, min: Math.min, max: Math.max,
  floor: Math.floor, ceil: Math.ceil, round: Math.round, sqrt: Math.sqrt, pow: Math.pow, exp: Math.exp,
  clamp: (v, lo, hi) => Math.min(hi, Math.max(lo, v)), lerp: (a, b, t) => a + (b - a) * t,
  mod: (a, b) => a % b, random: () => 0.5, pi: Math.PI, trunc: Math.trunc, sign: Math.sign,
  atan2: (a, b) => Math.atan2(a, b) / RAD, asin: (v) => Math.asin(v) / RAD, acos: (v) => Math.acos(v) / RAD,
};

/** Evaluates a Molang number or expression with q.anim_time = 0 and every other variable 0. */
function molang(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return 0;
  const expr = value.toLowerCase()
    .replace(/\b(?:q|query)\.anim_time\b/g, '0')
    .replace(/\b(?:q|query|v|variable|c|t)\.[a-z_0-9.]+/g, '0')
    .replace(/\bmath\.([a-z0-9_]+)/g, (m, f) => '__m.' + f);
  if (!/^[0-9a-z_.,+\-*/%()?:<>=!&| ]+$/.test(expr)) return 0;
  try {
    const out = Function('__m', '"use strict"; return (' + expr + ');')(MOLANG);
    return Number.isFinite(out) ? out : 0;
  } catch (e) {
    return 0;
  }
}

/** The value of a rotation/position/scale channel at time zero, as three numbers. */
function channel(def, fallback) {
  if (def === undefined) return fallback;
  let v = def;
  if (v && !Array.isArray(v) && typeof v === 'object') {
    if ('vector' in v) v = v.vector;
    else {
      const keys = Object.keys(v).filter((k) => !isNaN(Number(k))).sort((a, b) => Number(a) - Number(b));
      if (!keys.length) return fallback;
      v = v[keys[0]];
      if (v && !Array.isArray(v) && typeof v === 'object') v = v.post || v.pre || v.vector || [0, 0, 0];
    }
  }
  if (typeof v === 'number' || typeof v === 'string') v = [v, v, v];
  return Array.isArray(v) ? [molang(v[0]), molang(v[1]), molang(v[2])] : fallback;
}

function poseOf(animFile) {
  if (!animFile || !fs.existsSync(animFile)) return {};
  const anims = JSON.parse(fs.readFileSync(animFile, 'utf8')).animations || {};
  const names = Object.keys(anims);
  const pick = names.find((n) => /.ground_idle$/.test(n)) || names.find((n) => /.idle$/.test(n)) || names.find((n) => /.battle_idle$/.test(n));
  if (!pick) return {};
  const pose = {};
  for (const [bone, def] of Object.entries(anims[pick].bones || {})) {
    pose[bone] = { rot: channel(def.rotation, [0, 0, 0]), pos: channel(def.position, [0, 0, 0]), scale: channel(def.scale, [1, 1, 1]) };
  }
  return pose;
}

const isIdentity = (R) => R.every((v, i) => Math.abs(v - (i % 4 === 0 ? 1 : 0)) < 1e-6);
const round = (v) => Math.round(v * 10000) / 10000;

// ---- geometry ----

function convertGeo(geo, pose = {}) {
  const g = geo['minecraft:geometry'][0];
  const desc = g.description;
  const texW = desc.texture_width || 64;
  const texH = desc.texture_height || 64;
  const bones = new Map(g.bones.map((b) => [b.name, b]));

  const cache = new Map();
  function boneTransform(bone) {
    if (cache.has(bone.name)) return cache.get(bone.name);
    const parent = bone.parent && bones.get(bone.parent) ? boneTransform(bones.get(bone.parent)) : ident();
    const pivot = bone.pivot || [0, 0, 0];
    const base = bone.rotation || [0, 0, 0];
    const p = pose[bone.name] || { rot: [0, 0, 0], pos: [0, 0, 0], scale: [1, 1, 1] };
    const rot = [base[0] + p.rot[0], base[1] + p.rot[1], base[2] + p.rot[2]];
    const own = aboutPoint([-pivot[0], pivot[1], pivot[2]], [-rot[0], -rot[1], rot[2]], p.scale, [-p.pos[0], p.pos[1], p.pos[2]]);
    const t = compose(parent, own);
    cache.set(bone.name, t);
    return t;
  }

  const elements = [];
  for (const bone of g.bones) {
    if (!bone.cubes || bone.neverRender) continue;
    const bt = boneTransform(bone);
    for (const c of bone.cubes) {
      const size = c.size;
      const inflate = typeof c.inflate === 'number' ? c.inflate : typeof bone.inflate === 'number' ? bone.inflate : 0;
      const from = [-(c.origin[0] + size[0]), c.origin[1], c.origin[2]];
      const pivot = c.pivot || [0, 0, 0];
      const rot = c.rotation || [0, 0, 0];
      const cubeT = aboutPoint([-pivot[0], pivot[1], pivot[2]], [-rot[0], -rot[1], rot[2]]);
      const total = compose(bt, cubeT);
      const center = [from[0] + size[0] / 2, from[1] + size[1] / 2, from[2] + size[2] / 2];
      const worldCenter = mulRV(total.R, center).map((v, i) => v + total.t[i]);
      const cols = [0, 1, 2].map((j) => [total.R[j], total.R[3 + j], total.R[6 + j]]);
      const norms = cols.map((c) => Math.hypot(...c) || 1);
      const half = size.map((s, i) => (s / 2 + inflate) * norms[i]);
      const Q = [cols[0][0] / norms[0], cols[1][0] / norms[1], cols[2][0] / norms[2],
        cols[0][1] / norms[0], cols[1][1] / norms[1], cols[2][1] / norms[2],
        cols[0][2] / norms[0], cols[1][2] / norms[1], cols[2][2] / norms[2]];
      const mirror = c.mirror === undefined ? bone.mirror === true : c.mirror === true;
      elements.push({
        center: worldCenter,
        half,
        R: Q,
        faces: faceUvs(c, size, mirror),
      });
    }
  }
  return { elements, texW, texH };
}

/** UV rectangles per face in texture pixels, using the Blockbench box layout. */
function faceUvs(c, size, mirror) {
  const [w, h, d] = size;
  const faces = {};
  if (Array.isArray(c.uv)) {
    const [u, v] = c.uv;
    const list = {
      east: [0, d, d, h],
      west: [d + w, d, d, h],
      up: [d + w, d, -w, -d],
      down: [d + w * 2, 0, -w, d],
      south: [d * 2 + w, d, w, h],
      north: [d, d, w, h],
    };
    if (mirror) {
      for (const f of Object.values(list)) {
        f[0] += f[2];
        f[2] *= -1;
      }
      [list.east, list.west] = [list.west, list.east];
    }
    for (const [name, [x, y, sx, sy]] of Object.entries(list)) faces[name] = [u + x, v + y, u + x + sx, v + y + sy];
  } else if (c.uv && typeof c.uv === 'object') {
    for (const [name, f] of Object.entries(c.uv)) {
      if (!f || !f.uv) continue;
      const sz = f.uv_size || [0, 0];
      let rect = [f.uv[0], f.uv[1], f.uv[0] + sz[0], f.uv[1] + sz[1]];
      if (name === 'up' || name === 'down') rect = [rect[2], rect[3], rect[0], rect[1]];
      faces[name] = rect;
    }
  }
  return faces;
}

// ---- Java model ----

/** Builds the Java model JSON. Returns { json, k, height } where k is the shrink factor applied. */
function toJava(model, textureRef) {
  let maxXZ = 0;
  let maxY = 0;
  let minY = 0;
  let top = 0;
  for (const e of model.elements) {
    for (let i = 0; i < 3; i++) {
      const lo = e.center[i] - e.half[i];
      const hi = e.center[i] + e.half[i];
      if (i === 1) {
        minY = Math.min(minY, lo);
        maxY = Math.max(maxY, hi);
      } else {
        maxXZ = Math.max(maxXZ, Math.abs(lo), Math.abs(hi));
      }
    }
    // Rotated cubes can reach further than their unrotated box.
    const r = Math.hypot(...e.half);
    top = Math.max(top, e.center[1] + r);
  }
  // Boxes must stay inside -16..32 in every axis after shifting x and z by 8.
  let k = 1;
  if (maxXZ > 24) k = Math.min(k, 24 / maxXZ);
  if (maxY > 32) k = Math.min(k, 32 / maxY);
  if (minY < -16) k = Math.min(k, 16 / -minY);
  k = Math.floor(k * 1000) / 1000;

  const elements = [];
  for (const e of model.elements) {
    const c = [e.center[0] * k + 8, e.center[1] * k, e.center[2] * k + 8];
    const half = e.half.map((v) => v * k);
    const el = {
      from: c.map((v, i) => round(v - half[i])),
      to: c.map((v, i) => round(v + half[i])),
    };
    if (!isIdentity(e.R)) {
      const [x, y, z] = toEulerZYX(e.R).map(round);
      el.rotation = { origin: c.map(round), x, y, z };
    }
    el.faces = {};
    for (const [name, rect] of Object.entries(e.faces)) {
      const uv = [
        round((rect[0] * 16) / model.texW), round((rect[1] * 16) / model.texH),
        round((rect[2] * 16) / model.texW), round((rect[3] * 16) / model.texH),
      ];
      if (uv[0] === uv[2] || uv[1] === uv[3]) continue;
      el.faces[name] = { uv, texture: '#0' };
    }
    // A cube whose faces all have zero area (a flat plane seen edge-on) has nothing to draw, and the
    // game refuses a model with an element that has no faces.
    if (Object.keys(el.faces).length) elements.push(el);
  }
  const json = {
    texture_size: [model.texW, model.texH],
    textures: { 0: textureRef, particle: textureRef },
    elements,
    display: {
      gui: { rotation: [20, 145, 0], translation: [0, 0, 0], scale: [0.5, 0.5, 0.5] },
      fixed: { rotation: [0, 180, 0], scale: [0.5, 0.5, 0.5] },
    },
  };
  return { json, k, height: Math.max(top, maxY) * k / 16 };
}

// ---- driver ----

function pickGeo(dir) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.geo.json'));
  if (!files.length) return null;
  const rank = (f) => (/_male\./.test(f) ? 0 : /_female\./.test(f) ? 2 : /_(mega|alola|galar|hisui|paldea|gmax)/.test(f) ? 5 : 1);
  files.sort((a, b) => rank(a) - rank(b) || a.length - b.length);
  return path.join(dir, files[0]);
}

const species = fs.readdirSync(speciesDir).filter((f) => f.endsWith('.json')).map((f) => {
  const j = JSON.parse(fs.readFileSync(path.join(speciesDir, f)));
  return { slug: f.replace(/\.json$/, ''), dex: j.nationalPokedexNumber, baseScale: j.baseScale || 1, name: j.name };
}).sort((a, b) => a.dex - b.dex);

const modelsRoot = path.join(assetDir, 'bedrock/pokemon/models');
const texRoot = path.join(assetDir, 'textures/pokemon');
const animRoot = path.join(assetDir, 'bedrock/pokemon/animations');
const dirOf = (root, dex) => fs.readdirSync(root).find((d) => d.startsWith(String(dex).padStart(4, '0') + '_'));

fs.mkdirSync(path.join(outDir, 'assets/captura/models/creature'), { recursive: true });
fs.mkdirSync(path.join(outDir, 'assets/captura/textures/item/creature'), { recursive: true });
fs.mkdirSync(path.join(outDir, 'assets/captura/items'), { recursive: true });

const manifest = {};
const failures = [];
for (const sp of species) {
  if (only.length && !only.includes(sp.slug)) continue;
  try {
    const mdir = dirOf(modelsRoot, sp.dex);
    const tdir = dirOf(texRoot, sp.dex);
    if (!mdir || !tdir) throw new Error('missing model or texture folder');
    const geoFile = pickGeo(path.join(modelsRoot, mdir));
    if (!geoFile) throw new Error('no geometry file');
    const adir = fs.existsSync(animRoot) ? dirOf(animRoot, sp.dex) : null;
    const stem = path.basename(geoFile).replace(/.geo.json$/, '');
    let animFile = null;
    if (adir) {
      const have = fs.readdirSync(path.join(animRoot, adir)).filter((f) => f.endsWith('.animation.json'));
      const pick = have.find((f) => f === `${stem}.animation.json`) || have.find((f) => f === `${sp.slug}.animation.json`) || have[0];
      animFile = pick ? path.join(animRoot, adir, pick) : null;
    }
    const model = convertGeo(JSON.parse(fs.readFileSync(geoFile, 'utf8')), poseOf(animFile));
    const texFiles = fs.readdirSync(path.join(texRoot, tdir));
    const plain = texFiles.find((f) => f === `${sp.slug}.png`) || texFiles.find((f) => f.endsWith('.png') && !/shiny|alpha|flame|layer|emissive/.test(f));
    const shiny = texFiles.find((f) => f === `${sp.slug}_shiny.png`) || texFiles.find((f) => /shiny/.test(f) && f.endsWith('.png') && !/alpha|flame|layer|emissive/.test(f)) || plain;
    if (!plain) throw new Error('no texture');
    for (const [variant, file] of [['', plain], ['_shiny', shiny]]) {
      const id = sp.slug + variant;
      fs.copyFileSync(path.join(texRoot, tdir, file), path.join(outDir, `assets/captura/textures/item/creature/${id}.png`));
      const java = toJava(model, `captura:item/creature/${id}`);
      fs.writeFileSync(path.join(outDir, `assets/captura/models/creature/${id}.json`), JSON.stringify(java.json));
      fs.writeFileSync(path.join(outDir, `assets/captura/items/${id}.json`),
        JSON.stringify({ model: { type: 'minecraft:model', model: `captura:creature/${id}` } }));
      if (!variant) manifest[sp.slug] = { k: java.k, height: round(java.height), scale: sp.baseScale, elements: java.json.elements.length, geo: path.basename(geoFile) };
    }
  } catch (e) {
    failures.push(`${sp.slug}: ${e.message}`);
  }
}
fs.writeFileSync(path.join(outDir, 'assets/captura/models/creature/_manifest.json'), JSON.stringify(manifest, null, 1));
console.log(`converted ${Object.keys(manifest).length}, failed ${failures.length}`);
if (failures.length) console.log(failures.join('\n'));

// Display data for the plugin: the scale that makes a model match the species size.
let ymlOut = '# Generated by tools/gen-models.js. Species listed here have a model in the resource pack.\n# scale: ItemDisplay scale (species baseScale divided by the shrink factor k used to fit the model).\nmodels:\n';
for (const [slug, m] of Object.entries(manifest)) {
  ymlOut += `  ${slug}: {scale: ${round(m.scale / m.k)}, height: ${m.height}}\n`;
}
fs.writeFileSync(path.join(outDir, 'models.yml'), ymlOut);
fs.writeFileSync(path.join(outDir, 'pack.mcmeta'), JSON.stringify({ pack: { description: 'Captura models', min_format: 75, max_format: 88 } }));
