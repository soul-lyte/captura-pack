// Splits Cobblemon Bedrock models into moving parts and bakes their animations, so the plugin can
// play walk, idle, battle, attack and faint animations with one item display per part.
//
// For each species:
//   - a bone that any kept animation moves becomes a part (at most MAX_PARTS, the smallest ones are
//     folded into their parent and keep their idle pose); other bones ride on their nearest part
//   - each part is written as its own item model, centred on its own cubes, all with one shared
//     shrink factor k so the parts stay in proportion
//   - each kept animation is sampled every TICKS game ticks; every sample stores, per part, the
//     translation (blocks), rotation (quaternion) and scale that the plugin hands to the display
//
// The conventions (mirrored x, ZYX Euler, pose at time zero for the reference) are the same as in
// gen-models.js, so the parts line up with the static model used in menus.
//
// usage: node gen-rigs.js <asset-dir> <species-dir> <pack-dir> <plugin-resources-dir> [slug ...]
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const [assetDir, speciesDir, packDir, resDir, ...only] = process.argv.slice(2);
if (!resDir) {
  console.error('usage: node gen-rigs.js <asset-dir> <species-dir> <pack-dir> <plugin-resources-dir> [slug ...]');
  process.exit(1);
}
const MAX_PARTS = 12;
const TICKS = 2;
const STEP = TICKS / 20;
const KEEP = [
  ['idle', [/\.ground_idle$/, /\.idle$/, /\.air_idle$/], true],
  ['walk', [/\.ground_walk$/, /\.walk$/, /\.air_fly$/, /\.ground_run$/], true],
  ['battle', [/\.battle_idle$/], true],
  ['physical', [/\.physical$/], false],
  ['special', [/\.special$/], false],
  ['cry', [/\.cry$/], false],
  ['faint', [/\.faint$/], false],
];

// ---- matrices (3x3 row-major plus translation) ----
const RAD = Math.PI / 180;
const ident = () => ({ R: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 0] });
function mulRR(a, b) {
  const r = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return r;
}
const mulRV = (R, v) => [R[0] * v[0] + R[1] * v[1] + R[2] * v[2], R[3] * v[0] + R[4] * v[1] + R[5] * v[2], R[6] * v[0] + R[7] * v[1] + R[8] * v[2]];
const compose = (a, b) => ({ R: mulRR(a.R, b.R), t: mulRV(a.R, b.t).map((x, i) => x + a.t[i]) });
function invert(m) {
  const [a, b, c, d, e, f, g, h, i] = m.R;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  const R = [(e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det,
    (f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det,
    (d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det];
  return { R, t: mulRV(R, m.t).map((x) => -x) };
}
function eulerZYX(x, y, z) {
  const [cx, sx, cy, sy, cz, sz] = [Math.cos(x * RAD), Math.sin(x * RAD), Math.cos(y * RAD), Math.sin(y * RAD), Math.cos(z * RAD), Math.sin(z * RAD)];
  return mulRR([cz, -sz, 0, sz, cz, 0, 0, 0, 1], mulRR([cy, 0, sy, 0, 1, 0, -sy, 0, cy], [1, 0, 0, 0, cx, -sx, 0, sx, cx]));
}
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
function aboutPoint(origin, euler, scale = [1, 1, 1], pos = [0, 0, 0]) {
  const Rr = eulerZYX(...euler);
  const L = [Rr[0] * scale[0], Rr[1] * scale[1], Rr[2] * scale[2], Rr[3] * scale[0], Rr[4] * scale[1], Rr[5] * scale[2],
    Rr[6] * scale[0], Rr[7] * scale[1], Rr[8] * scale[2]];
  const moved = mulRV(L, origin);
  return { R: L, t: origin.map((o, i) => o - moved[i] + pos[i]) };
}
const round = (v) => Math.round(v * 10000) / 10000;
const isIdentity = (R) => R.every((v, i) => Math.abs(v - (i % 4 === 0 ? 1 : 0)) < 1e-6);

// ---- Molang and keyframes ----
const MOLANG_DEG = (f) => (x) => f(x * RAD);
const MOLANG = {
  sin: MOLANG_DEG(Math.sin), cos: MOLANG_DEG(Math.cos), abs: Math.abs, min: Math.min, max: Math.max,
  floor: Math.floor, ceil: Math.ceil, round: Math.round, sqrt: Math.sqrt, pow: Math.pow, exp: Math.exp,
  clamp: (v, lo, hi) => Math.min(hi, Math.max(lo, v)), lerp: (a, b, t) => a + (b - a) * t,
  mod: (a, b) => a % b, random: () => 0.5, pi: Math.PI, trunc: Math.trunc, sign: Math.sign,
  atan2: (a, b) => Math.atan2(a, b) / RAD, asin: (v) => Math.asin(v) / RAD, acos: (v) => Math.acos(v) / RAD,
};
const compiled = new Map();
function molang(value, time) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return 0;
  let fn = compiled.get(value);
  if (fn === undefined) {
    const expr = value.toLowerCase()
      .replace(/\b(?:q|query)\.anim_time\b/g, '__t')
      .replace(/\b(?:q|query|v|variable|c|t)\.[a-z_0-9.]+/g, '0')
      .replace(/\bmath\.([a-z0-9_]+)/g, (m, f) => '__m.' + f);
    fn = null;
    if (/^[0-9a-z_.,+\-*/%()?:<>=!&| ]+$/.test(expr)) {
      try {
        fn = Function('__m', '__t', '"use strict"; return (' + expr + ');');
      } catch (e) {
        fn = null;
      }
    }
    compiled.set(value, fn);
  }
  if (!fn) return 0;
  try {
    const out = fn(MOLANG, time);
    return Number.isFinite(out) ? out : 0;
  } catch (e) {
    return 0;
  }
}
const vec = (v, time) => {
  if (v && !Array.isArray(v) && typeof v === 'object' && 'vector' in v) v = v.vector;
  if (typeof v === 'number' || typeof v === 'string') v = [v, v, v];
  return Array.isArray(v) ? [molang(v[0], time), molang(v[1], time), molang(v[2], time)] : null;
};
function channelAt(def, time, fallback) {
  if (def === undefined || def === null) return fallback;
  if (typeof def !== 'object' || Array.isArray(def) || 'vector' in def) return vec(def, time) || fallback;
  const keys = Object.keys(def).filter((k) => !isNaN(Number(k))).sort((a, b) => Number(a) - Number(b));
  if (!keys.length) return fallback;
  const frames = keys.map((k) => {
    const raw = def[k];
    const obj = raw && !Array.isArray(raw) && typeof raw === 'object' && !('vector' in raw) ? raw : null;
    const pre = obj ? (obj.pre !== undefined ? obj.pre : obj.post) : raw;
    const post = obj ? (obj.post !== undefined ? obj.post : obj.pre) : raw;
    return { t: Number(k), pre, post, smooth: obj && obj.lerp_mode === 'catmullrom' };
  });
  if (time <= frames[0].t) return vec(frames[0].post, time) || fallback;
  const last = frames[frames.length - 1];
  if (time >= last.t) return vec(last.post, time) || fallback;
  let i = 0;
  while (frames[i + 1].t < time) i++;
  const a = frames[i];
  const b = frames[i + 1];
  const u = (time - a.t) / (b.t - a.t || 1);
  const va = vec(a.post, time) || fallback;
  const vb = vec(b.pre, time) || fallback;
  if (a.smooth || b.smooth) {
    const v0 = i > 0 ? vec(frames[i - 1].post, time) || va : va;
    const v3 = i + 2 < frames.length ? vec(frames[i + 2].pre, time) || vb : vb;
    return [0, 1, 2].map((j) => {
      const p0 = v0[j];
      const p1 = va[j];
      const p2 = vb[j];
      const p3 = v3[j];
      return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);
    });
  }
  return [0, 1, 2].map((j) => va[j] + (vb[j] - va[j]) * u);
}
function poseAt(anim, time) {
  const pose = {};
  if (!anim) return pose;
  for (const [bone, def] of Object.entries(anim.bones || {})) {
    pose[bone] = { rot: channelAt(def.rotation, time, [0, 0, 0]), pos: channelAt(def.position, time, [0, 0, 0]), scale: channelAt(def.scale, time, [1, 1, 1]) };
  }
  return pose;
}
function lengthOf(anim) {
  if (typeof anim.animation_length === 'number') return anim.animation_length;
  let max = 0;
  for (const def of Object.values(anim.bones || {})) {
    for (const ch of [def.rotation, def.position, def.scale]) {
      if (ch && typeof ch === 'object' && !Array.isArray(ch)) {
        for (const k of Object.keys(ch)) if (!isNaN(Number(k))) max = Math.max(max, Number(k));
      }
    }
  }
  return max || 2;
}

// ---- geometry ----
function boneWorlds(bonesList, bones, pose) {
  const cache = new Map();
  function of(bone) {
    if (cache.has(bone.name)) return cache.get(bone.name);
    const parent = bone.parent && bones.get(bone.parent) ? of(bones.get(bone.parent)) : ident();
    const pivot = bone.pivot || [0, 0, 0];
    const base = bone.rotation || [0, 0, 0];
    const p = pose[bone.name] || { rot: [0, 0, 0], pos: [0, 0, 0], scale: [1, 1, 1] };
    const rot = [base[0] + p.rot[0], base[1] + p.rot[1], base[2] + p.rot[2]];
    const own = aboutPoint([-pivot[0], pivot[1], pivot[2]], [-rot[0], -rot[1], rot[2]], p.scale, [-p.pos[0], p.pos[1], p.pos[2]]);
    const w = compose(parent, own);
    cache.set(bone.name, w);
    return w;
  }
  const out = new Map();
  for (const b of bonesList) out.set(b.name, of(b));
  return out;
}

function faceUvs(c, size, mirror) {
  const [w, h, d] = size;
  const faces = {};
  if (Array.isArray(c.uv)) {
    const [u, v] = c.uv;
    const list = { east: [0, d, d, h], west: [d + w, d, d, h], up: [d + w, d, -w, -d], down: [d + w * 2, 0, -w, d], south: [d * 2 + w, d, w, h], north: [d, d, w, h] };
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

/** A cube as a box in some frame: centre, half sizes, rotation, faces. */
function cubeBox(c, bone, frame) {
  const size = c.size;
  const inflate = typeof c.inflate === 'number' ? c.inflate : typeof bone.inflate === 'number' ? bone.inflate : 0;
  const from = [-(c.origin[0] + size[0]), c.origin[1], c.origin[2]];
  const pivot = c.pivot || [0, 0, 0];
  const rot = c.rotation || [0, 0, 0];
  const total = compose(frame, aboutPoint([-pivot[0], pivot[1], pivot[2]], [-rot[0], -rot[1], rot[2]]));
  const center = [from[0] + size[0] / 2, from[1] + size[1] / 2, from[2] + size[2] / 2];
  const worldCenter = mulRV(total.R, center).map((v, i) => v + total.t[i]);
  const cols = [0, 1, 2].map((j) => [total.R[j], total.R[3 + j], total.R[6 + j]]);
  const norms = cols.map((v) => Math.hypot(...v) || 1);
  const half = size.map((s, i) => (s / 2 + inflate) * norms[i]);
  const Q = [cols[0][0] / norms[0], cols[1][0] / norms[1], cols[2][0] / norms[2],
    cols[0][1] / norms[0], cols[1][1] / norms[1], cols[2][1] / norms[2],
    cols[0][2] / norms[0], cols[1][2] / norms[1], cols[2][2] / norms[2]];
  const mirror = c.mirror === undefined ? bone.mirror === true : c.mirror === true;
  return { center: worldCenter, half, R: Q, faces: faceUvs(c, size, mirror) };
}

function quatOf(R) {
  const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = R;
  const tr = m00 + m11 + m22;
  let x;
  let y;
  let z;
  let w;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    w = 0.25 * s; x = (m21 - m12) / s; y = (m02 - m20) / s; z = (m10 - m01) / s;
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    w = (m21 - m12) / s; x = 0.25 * s; y = (m01 + m10) / s; z = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    w = (m02 - m20) / s; x = (m01 + m10) / s; y = 0.25 * s; z = (m12 + m21) / s;
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = 0.25 * s;
  }
  const n = Math.hypot(x, y, z, w) || 1;
  return [x / n, y / n, z / n, w / n];
}

// ---- one species ----
function rigSpecies(slug, geoFile, animFile, baseScale) {
  const geo = JSON.parse(fs.readFileSync(geoFile, 'utf8'))['minecraft:geometry'][0];
  const texW = geo.description.texture_width || 64;
  const texH = geo.description.texture_height || 64;
  const bones = new Map(geo.bones.map((b) => [b.name, b]));
  const anims = animFile && fs.existsSync(animFile) ? JSON.parse(fs.readFileSync(animFile, 'utf8')).animations || {} : {};
  const names = Object.keys(anims);
  const chosen = [];
  for (const [key, patterns, loop] of KEEP) {
    const name = patterns.map((p) => names.find((n) => p.test(n))).find(Boolean);
    if (name) chosen.push({ key, anim: anims[name], loop });
  }
  const idleAnim = (chosen.find((c) => c.key === 'idle') || {}).anim;
  const refPose = poseAt(idleAnim, 0);
  const ref = boneWorlds(geo.bones, bones, refPose);

  // Parts: bones the kept animations move.
  const moving = new Set();
  for (const c of chosen) for (const b of Object.keys(c.anim.bones || {})) if (bones.has(b)) moving.add(b);
  const anchorOf = (name, anchors) => {
    let b = bones.get(name);
    while (b) {
      if (anchors.has(b.name)) return b.name;
      b = b.parent ? bones.get(b.parent) : null;
    }
    return '';
  };
  const volume = new Map();
  let anchors = new Set(moving);
  const recount = () => {
    volume.clear();
    for (const b of geo.bones) {
      if (!b.cubes || b.neverRender) continue;
      const a = anchorOf(b.name, anchors);
      let v = 0;
      for (const c of b.cubes) v += Math.max(1, c.size[0] * c.size[1] * c.size[2]);
      volume.set(a, (volume.get(a) || 0) + v);
    }
  };
  recount();
  // Anchors with no cubes of their own add nothing; their motion still reaches their children.
  anchors = new Set([...anchors].filter((a) => volume.has(a)));
  recount();
  while (anchors.size + (volume.has('') ? 1 : 0) > MAX_PARTS) {
    const smallest = [...anchors].sort((x, y) => (volume.get(x) || 0) - (volume.get(y) || 0))[0];
    anchors.delete(smallest);
    recount();
  }
  const partNames = [...(volume.has('') ? [''] : []), ...anchors];
  const partRef = (p) => (p === '' ? ident() : ref.get(p));

  // Cubes into part-local frames.
  const partBoxes = new Map(partNames.map((p) => [p, []]));
  for (const b of geo.bones) {
    if (!b.cubes || b.neverRender) continue;
    const p = anchorOf(b.name, anchors);
    const local = compose(invert(partRef(p)), ref.get(b.name));
    for (const c of b.cubes) partBoxes.get(p).push(cubeBox(c, b, local));
  }
  const centers = new Map();
  let reach = 0;
  for (const [p, boxes] of partBoxes) {
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (const e of boxes) {
      const r = Math.hypot(...e.half);
      for (let i = 0; i < 3; i++) {
        lo[i] = Math.min(lo[i], e.center[i] - r);
        hi[i] = Math.max(hi[i], e.center[i] + r);
      }
    }
    const c = lo.map((v, i) => (v + hi[i]) / 2);
    centers.set(p, c);
    for (let i = 0; i < 3; i++) reach = Math.max(reach, hi[i] - c[i], c[i] - lo[i]);
  }
  const k = Math.min(1, Math.floor((24 / Math.max(reach, 1e-6)) * 1000) / 1000);

  // Models
  const models = [];
  for (const p of partNames) {
    const c = centers.get(p);
    const elements = [];
    for (const e of partBoxes.get(p)) {
      const m = e.center.map((v, i) => (v - c[i]) * k + 8);
      const half = e.half.map((v) => v * k);
      const el = { from: m.map((v, i) => round(v - half[i])), to: m.map((v, i) => round(v + half[i])) };
      if (!isIdentity(e.R)) {
        const [x, y, z] = toEulerZYX(e.R).map(round);
        el.rotation = { origin: m.map(round), x, y, z };
      }
      el.faces = {};
      for (const [name, rect] of Object.entries(e.faces)) {
        const uv = [round((rect[0] * 16) / texW), round((rect[1] * 16) / texH), round((rect[2] * 16) / texW), round((rect[3] * 16) / texH)];
        if (uv[0] === uv[2] || uv[1] === uv[3]) continue;
        el.faces[name] = { uv, texture: '#0' };
      }
      if (Object.keys(el.faces).length) elements.push(el);
    }
    models.push({ texture_size: [texW, texH], elements });
  }

  // Frames
  const s = baseScale;
  const animsOut = [];
  for (const c of chosen) {
    const len = lengthOf(c.anim);
    const count = Math.max(1, Math.round(len / STEP));
    const frames = [];
    const prevQ = partNames.map(() => null);
    for (let f = 0; f < count; f++) {
      const worlds = boneWorlds(geo.bones, bones, poseAt(c.anim, f * STEP));
      const row = [];
      partNames.forEach((p, i) => {
        const W = p === '' ? ident() : worlds.get(p);
        const cp = centers.get(p);
        // blocks: A = (s/k) R, b = (s/16)(R c + t)
        const A = W.R.map((v) => (v * s) / k);
        const b = mulRV(W.R, cp).map((v, j) => ((v + W.t[j]) * s) / 16);
        const cols = [0, 1, 2].map((j) => [A[j], A[3 + j], A[6 + j]]);
        const sc = cols.map((col) => Math.hypot(...col) || 1e-6);
        const Rn = [A[0] / sc[0], A[1] / sc[1], A[2] / sc[2], A[3] / sc[0], A[4] / sc[1], A[5] / sc[2], A[6] / sc[0], A[7] / sc[1], A[8] / sc[2]];
        let q = quatOf(Rn);
        if (prevQ[i] && q[0] * prevQ[i][0] + q[1] * prevQ[i][1] + q[2] * prevQ[i][2] + q[3] * prevQ[i][3] < 0) q = q.map((v) => -v);
        prevQ[i] = q;
        row.push([...b, ...q, ...sc]);
      });
      frames.push(row);
    }
    animsOut.push({ key: c.key, loop: c.loop, frames });
  }
  if (!animsOut.length) {
    // No animation file: one still frame so the plugin can still place the parts.
    const row = partNames.map((p) => {
      const W = partRef(p);
      const cp = centers.get(p);
      const b = mulRV(W.R, cp).map((v, j) => ((v + W.t[j]) * s) / 16);
      return [...b, 0, 0, 0, 1, s / k, s / k, s / k];
    });
    animsOut.push({ key: 'idle', loop: true, frames: [row] });
  }
  return { models, animsOut, parts: partNames.length };
}

function writeRig(file, slug, parts, anims) {
  const chunks = [];
  const head = Buffer.alloc(8);
  head.write('CRIG', 0, 'ascii');
  head.writeUInt8(1, 4);
  head.writeUInt8(parts, 5);
  head.writeUInt8(anims.length, 6);
  head.writeUInt8(TICKS, 7);
  chunks.push(head);
  const q16 = (v, scale) => Math.max(-32768, Math.min(32767, Math.round(v * scale)));
  for (const a of anims) {
    const name = Buffer.from(a.key, 'utf8');
    const h = Buffer.alloc(4 + name.length);
    h.writeUInt8(name.length, 0);
    name.copy(h, 1);
    h.writeUInt8(a.loop ? 1 : 0, 1 + name.length);
    h.writeUInt16BE(a.frames.length, 2 + name.length);
    chunks.push(h);
    const body = Buffer.alloc(a.frames.length * parts * 20);
    let o = 0;
    for (const row of a.frames) {
      for (const v of row) {
        for (let j = 0; j < 3; j++, o += 2) body.writeInt16BE(q16(v[j], 4096), o);
        for (let j = 3; j < 7; j++, o += 2) body.writeInt16BE(q16(v[j], 32767), o);
        for (let j = 7; j < 10; j++, o += 2) body.writeInt16BE(q16(v[j], 4096), o);
      }
    }
    chunks.push(body);
  }
  fs.writeFileSync(file, zlib.gzipSync(Buffer.concat(chunks), { level: 9 }));
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
  return { slug: f.replace(/\.json$/, ''), dex: j.nationalPokedexNumber, baseScale: j.baseScale || 1 };
}).sort((a, b) => a.dex - b.dex);
const modelsRoot = path.join(assetDir, 'bedrock/pokemon/models');
const animRoot = path.join(assetDir, 'bedrock/pokemon/animations');
const dirOf = (root, dex) => fs.readdirSync(root).find((d) => d.startsWith(String(dex).padStart(4, '0') + '_'));

fs.mkdirSync(path.join(resDir, 'rigs'), { recursive: true });
let done = 0;
let totalParts = 0;
const failures = [];
for (const sp of species) {
  if (only.length && !only.includes(sp.slug)) continue;
  try {
    const mdir = dirOf(modelsRoot, sp.dex);
    if (!mdir) throw new Error('no model folder');
    const geoFile = pickGeo(path.join(modelsRoot, mdir));
    const stem = path.basename(geoFile).replace(/.geo.json$/, '');
    const adir = fs.existsSync(animRoot) ? dirOf(animRoot, sp.dex) : null;
    let animFile = null;
    if (adir) {
      const have = fs.readdirSync(path.join(animRoot, adir)).filter((f) => f.endsWith('.animation.json'));
      const pick = have.find((f) => f === `${stem}.animation.json`) || have.find((f) => f === `${sp.slug}.animation.json`) || have[0];
      animFile = pick ? path.join(animRoot, adir, pick) : null;
    }
    const rig = rigSpecies(sp.slug, geoFile, animFile, sp.baseScale);
    for (const variant of ['', '_shiny']) {
      const id = sp.slug + variant;
      const mdirOut = path.join(packDir, `assets/captura/models/rig/${id}`);
      const idirOut = path.join(packDir, `assets/captura/items/rig/${id}`);
      fs.mkdirSync(mdirOut, { recursive: true });
      fs.mkdirSync(idirOut, { recursive: true });
      for (const f of fs.readdirSync(mdirOut)) fs.unlinkSync(path.join(mdirOut, f));
      for (const f of fs.readdirSync(idirOut)) fs.unlinkSync(path.join(idirOut, f));
      rig.models.forEach((m, i) => {
        const tex = `captura:item/creature/${id}`;
        fs.writeFileSync(path.join(mdirOut, `${i}.json`), JSON.stringify({ ...m, textures: { 0: tex, particle: tex } }));
        fs.writeFileSync(path.join(idirOut, `${i}.json`), JSON.stringify({ model: { type: 'minecraft:model', model: `captura:rig/${id}/${i}` } }));
      });
    }
    writeRig(path.join(resDir, 'rigs', `${sp.slug}.rig`), sp.slug, rig.parts, rig.animsOut);
    done++;
    totalParts += rig.parts;
  } catch (e) {
    failures.push(`${sp.slug}: ${e.message}`);
  }
}
console.log(`rigged ${done}, ${totalParts} parts in all, failed ${failures.length}`);
if (failures.length) console.log(failures.join('\n'));
