// Downloads the Cobblemon model geometry, textures and posers for Generation 1 (dex 1-151).
// Files are fetched one by one from GitLab's raw endpoint, which is not rate limited like archives.
//
// usage: node fetch-assets.js <out-dir> [maxDex]
const fs = require('fs');
const path = require('path');

const out = process.argv[2];
const maxDex = Number(process.argv[3] || 151);
if (!out) {
  console.error('usage: node fetch-assets.js <out-dir> [maxDex]');
  process.exit(1);
}
const PROJECT = 'cable-mc%2Fcobblemon';
const BASE = 'common/src/main/resources/assets/cobblemon';
const KINDS = ['bedrock/pokemon/models', 'textures/pokemon', 'bedrock/pokemon/animations'];

async function wait(res, attempt) {
  const retry = Number(res.headers.get('retry-after')) || 0;
  await new Promise((r) => setTimeout(r, Math.min(90000, Math.max(retry * 1000, 3000 * (attempt + 1) ** 2))));
}

async function safeFetch(url) {
  for (let i = 0; i < 6; i++) {
    try {
      return await fetch(url, { signal: AbortSignal.timeout(60000) });
    } catch (e) {
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
  return { ok: false, status: 599, headers: new Headers() };
}

async function getJson(url, tries = 8) {
  for (let i = 0; i < tries; i++) {
    const res = await safeFetch(url);
    if (res.ok) return res.json();
    if (res.status === 429 || res.status >= 500) await wait(res, i);
    else throw new Error(`${res.status} ${url}`);
  }
  throw new Error('giving up on ' + url);
}

async function getFile(repoPath, dest) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return;
  const url = `https://gitlab.com/${decodeURIComponent(PROJECT)}/-/raw/main/${repoPath}`;
  for (let i = 0; i < 8; i++) {
    const res = await safeFetch(url);
    if (res.ok) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
      return;
    }
    await wait(res, i);
  }
  console.error('failed', repoPath);
}

async function listDirs(kind) {
  let all = [];
  for (let page = 1; page <= 4; page++) {
    const part = await getJson(`https://gitlab.com/api/v4/projects/${PROJECT}/repository/tree?path=${BASE}/${kind}&per_page=100&page=${page}`);
    all = all.concat(part);
    if (part.length < 100) break;
  }
  return all.filter((x) => x.type === 'tree' && Number(x.name.slice(0, 4)) <= maxDex).map((x) => x.name);
}

async function pool(items, size, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (next < items.length) await fn(items[next++]);
  }));
}

(async () => {
  for (const kind of KINDS) {
    const dirs = await listDirs(kind);
    console.log(kind, dirs.length, 'folders');
    await pool(dirs, 2, async (dir) => {
      const files = (await getJson(`https://gitlab.com/api/v4/projects/${PROJECT}/repository/tree?path=${BASE}/${kind}/${dir}&per_page=100`))
        .filter((x) => x.type === 'blob' && x.name !== 'license');
      for (const f of files) await getFile(`${BASE}/${kind}/${dir}/${f.name}`, path.join(out, kind, dir, f.name));
    });
  }
  console.log('done');
})();
