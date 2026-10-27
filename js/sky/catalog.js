// Star catalog (HYG v4.1, stars to magnitude 6.8) and a drawn Milky Way.

import { radecToVec, galacticToVec } from './astro.js';

// B-V colour index to a star colour; the eye sees only the brightest stars in colour.
const BV = [[-0.4, 155, 176, 255], [0, 202, 215, 255], [0.4, 248, 247, 255], [0.6, 255, 244, 234],
  [0.8, 255, 229, 207], [1.2, 255, 204, 153], [1.6, 255, 172, 112], [2.0, 255, 145, 85]];
export function bvColor(bv) {
  if (bv <= BV[0][0]) return BV[0].slice(1);
  for (let i = 1; i < BV.length; i++) {
    if (bv <= BV[i][0]) {
      const [a, ...c1] = BV[i - 1], [b, ...c2] = BV[i], t = (bv - a) / (b - a);
      return c1.map((v, k) => Math.round(v + (c2[k] - v) * t));
    }
  }
  return BV[BV.length - 1].slice(1);
}

export async function loadCatalog(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('star catalog: ' + res.status);
  const buf = await res.arrayBuffer();
  if (new TextDecoder().decode(new Uint8Array(buf, 0, 4)) !== 'STAR') throw new Error('star catalog: bad file');
  const n = new DataView(buf).getUint32(8, true);
  const ra = new Uint16Array(buf, 12, n), dec = new Int16Array(buf, 12 + 2 * n, n);
  const mag8 = new Uint8Array(buf, 12 + 4 * n, n), bv8 = new Uint8Array(buf, 12 + 5 * n, n);
  const cat = {
    count: n,
    x: new Float32Array(n), y: new Float32Array(n), z: new Float32Array(n),
    mag: new Float32Array(n), color: new Array(n),
  };
  for (let i = 0; i < n; i++) {
    const v = radecToVec(ra[i] / 65535 * 360, dec[i] / 32767 * 90);
    cat.x[i] = v[0]; cat.y[i] = v[1]; cat.z[i] = v[2];
    cat.mag[i] = mag8[i] / 10 - 2;
    cat.color[i] = bvColor(bv8[i] / 50 - 0.5);
  }
  return cat;
}

// A deterministic pseudo-random source, so the Milky Way looks the same on every visit.
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Points scattered along the galactic plane: brighter and thicker toward the centre in
// Sagittarius, a bump in Cygnus and Carina, and the Great Rift's dust lane cut through.
export function milkyWay(count = 7000) {
  const rand = rng(1977), pts = [];
  const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-9)) * Math.cos(2 * Math.PI * rand());
  const wrap = (l) => ((l + 180) % 360 + 360) % 360 - 180;
  const glow = (l) => 0.35 + 0.65 * Math.exp(-((wrap(l) / 45) ** 2))
    + 0.25 * Math.exp(-(((l - 80) / 25) ** 2)) + 0.2 * Math.exp(-(((l - 285) / 20) ** 2));
  while (pts.length < count) {
    const l = rand() * 360;
    if (rand() * 1.3 > glow(l)) continue;
    const width = 2.5 + 6 * Math.exp(-((wrap(l) / 30) ** 2));
    const b = gauss() * width;
    let w = 0.6 + 0.4 * rand();
    if (l > 15 && l < 75) w *= 1 - 0.65 * Math.exp(-(((b - 1.5) / 1.6) ** 2));
    pts.push({ vec: galacticToVec(l, b), w });
  }
  return pts;
}
