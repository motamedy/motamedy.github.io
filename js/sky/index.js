// The sky over Mashhad (or its antipode, or Mashhad without pollution), computed every
// few seconds and drawn twice: as a round dome in ~/sky and, dimmed, behind the page.

import {
  RAD, skyMatrix, horizonMatrix, apply, sun, moon, planets, topocentricAlt, refraction,
  altAzToVec, vecToAltAz, radecToVec, enuFrom, PLANET_COLORS,
} from './astro.js';
import {
  limitTable, limitAt, countVisible, skyParts, skyMag, skyColor, nelm, bortle,
  sunLikeReach, CLEAN_AOD,
} from './model.js';
import { loadCatalog, milkyWay, rng } from './catalog.js';
import { cloudTexture, cloudColor } from './clouds.js';
import { weather, aircraft, issTle } from './feeds.js';
import { makeIss } from './iss.js';
import { Painter } from './render.js';

export const MASHHAD = { lat: 36.2972, lon: 59.6067, elev: 995 };
// Straight through the Earth: the open Pacific, about 1,500 km southwest of Easter Island.
export const ANTIPODE = { lat: -36.2972, lon: -120.3933, elev: 995 };
const GLIESE_445 = radecToVec(11.794333 * 15, 78.69116);

const MODES = {
  mashhad: { place: MASHHAD, polluted: true },
  antipode: { place: ANTIPODE, polluted: false },
  pristine: { place: MASHHAD, polluted: false, clean: true },
};

const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const state = {
  mode: 'mashhad', cat: null, milky: milkyWay(),
  wx: new Map(), planes: [], iss: null, passes: [], compare: null,
  scene: null, version: 0, computedAt: 0, egg: null,
};

try {
  const saved = localStorage.getItem('sky-mode');
  if (MODES[saved]) state.mode = saved;
} catch { /* private mode */ }

const sunAltAt = (place, ms) => Math.asin(apply(horizonMatrix(ms, place.lat, place.lon), sun(ms).vec)[2]) * RAD;

// Without pollution only makes sense at night: if it is light in Mashhad, use the coming midnight.
function darkTime(now) {
  if (sunAltAt(MASHHAD, now) < -18) return now;
  const offset = 3.5 * 3600000, day = 86400000;
  return Math.floor((now + offset) / day) * day + day - offset;
}

const hashUnit = (i) => rng(i * 2654435761)();
const normalize = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };

function compute(now) {
  const mode = MODES[state.mode], place = mode.place, cat = state.cat;
  const wx = state.wx.get(place);
  const aod = mode.clean ? CLEAN_AOD : (wx?.air?.aod ?? (place === ANTIPODE ? 0.08 : 0.25));
  const t = mode.clean ? darkTime(now) : now;
  const live = t === now;
  const M = skyMatrix(t, place.lat, place.lon), H = horizonMatrix(t, place.lat, place.lon);

  const sunVec = apply(H, sun(t).vec);
  const sunTrue = Math.asin(sunVec[2]) * RAD, sunAlt = sunTrue + refraction(sunTrue);

  const mo = moon(t), mGeo = vecToAltAz(apply(H, mo.vec));
  let moonAlt = topocentricAlt(mGeo.alt, mo.parallax);
  moonAlt += refraction(moonAlt);
  const moonVec = altAzToVec(moonAlt, mGeo.az);
  const dot = moonVec[0] * sunVec[0] + moonVec[1] * sunVec[1] + moonVec[2] * sunVec[2];
  const toSun = normalize(sunVec.map((s, i) => s - dot * moonVec[i]));
  const moonInfo = { alt: moonAlt, phaseAngle: mo.phaseAngle, lit: mo.lit, waxing: mo.waxing };

  const cond = { polluted: mode.polluted, aod, sunAlt, moon: moonInfo };
  const table = limitTable(cond);

  // Stars: rotate the catalogue into this sky and keep the ones an eye would catch.
  const n = cat ? cat.count : 0;
  const s = state.buf ??= {
    e: new Float32Array(n), nn: new Float32Array(n), u: new Float32Array(n),
    size: new Float32Array(n), alpha: new Float32Array(n), rgb: new Array(n), idx: new Int32Array(n), margin: new Float32Array(n),
  };
  let k = 0;
  for (let i = 0; i < n; i++) {
    const x = cat.x[i], y = cat.y[i], z = cat.z[i];
    const u = M[6] * x + M[7] * y + M[8] * z;
    if (u < 0.01) continue;
    const v = limitAt(table, Math.asin(u) * RAD) - cat.mag[i];
    if (v < 0) continue;
    s.e[k] = M[0] * x + M[1] * y + M[2] * z;
    s.nn[k] = M[3] * x + M[4] * y + M[5] * z;
    s.u[k] = u;
    s.size[k] = 0.5 + 0.36 * Math.min(v, 8) ** 0.9;
    s.alpha[k] = Math.min(1, 0.25 + 0.2 * v);
    const c = cat.color[i], sat = Math.min(1, 0.2 + 0.1 * v);
    s.rgb[k] = c.map((ch) => Math.round(255 + (ch - 255) * sat));
    s.idx[k] = i; s.margin[k] = v;
    k++;
  }
  s.n = k;

  const pl = planets(t).map((p) => {
    const v = apply(M, p.vec), alt = Math.asin(v[2]) * RAD;
    const margin = v[2] > 0 ? limitAt(table, alt) - p.mag : -1;
    return { vec: v, label: p.name[0].toUpperCase() + p.name.slice(1), rgb: PLANET_COLORS[p.name], margin, mag: p.mag };
  }).filter((p) => p.margin >= 0).map((p) => ({ ...p, size: 1 + 0.4 * Math.min(p.margin, 10) ** 0.9, alpha: 1 }));

  const limZenith = table[table.length - 1].limit;
  const milkyAlpha = Math.max(0, Math.min(1, (limZenith - 4.9) / 1.5));
  const milky = {
    alpha: milkyAlpha,
    points: milkyAlpha > 0.01 ? state.milky.map((p) => ({ vec: apply(M, p.vec), w: p.w })) : [],
  };

  // Colour: the light at four heights, hazier toward the horizon in daylight.
  const haze = (alt) => sunAlt > -2 ? Math.min(0.75, 0.12 + 0.55 * aod) * (1 - alt / 90) ** 2 : 0;
  const color = (alt) => skyColor(skyParts(cond, alt), haze(alt));
  const zen = skyParts(cond, 90), Lz = (zen.natural + zen.artificial + zen.moon + zen.sun) * 3.183e-6;
  const brightness = Math.max(0, Math.min(1, (Math.log10(Lz) + 3.9) / 7.4));

  let glow = null;
  if (sunAlt > -16) {
    const day = sunAlt > 4;
    glow = {
      vec: sunVec, radius: day ? 0.6 : 0.95,
      color: day ? [255, 244, 225] : [255, 150, 85],
      alpha: day ? 0.3 : 0.55 * Math.exp(-(((sunAlt + 1) / 5.5) ** 2)),
    };
  }

  let clouds = null;
  if (!mode.clean && wx?.clouds) {
    const c = wx.clouds;
    const col = cloudColor(sunAlt, moonInfo, mode.polluted, aod);
    const low = 1 - (1 - c.low) * (1 - c.mid);
    const towards = ((c.windFrom ?? 0) + 180) * Math.PI / 180, speed = (c.windSpeed ?? 8) * 0.12;
    clouds = {
      low: texture('low', low, col, 0.95),
      high: texture('high', c.high, col, 0.5),
      wind: [-Math.sin(towards) * speed, -Math.cos(towards) * speed],
    };
  }

  const twinkle = [];
  const order = Array.from({ length: k }, (_, i) => i).sort((a, b) => s.margin[b] - s.margin[a]).slice(0, 40);
  for (const i of order) {
    const r = hashUnit(s.idx[i]);
    twinkle.push({ vec: [s.e[i], s.nn[i], s.u[i]], size: s.size[i], alpha: s.alpha[i], speed: 1.5 + 3 * r, phase: r * 40 });
  }

  const eggVec = apply(M, GLIESE_445);
  state.scene = {
    version: ++state.version, t, live, place, mode: state.mode, cond, table, sunAlt, moonInfo,
    sky: { zenith: color(90), mid: color(45), low: color(15), horizon: color(1) },
    glow, stars: s, planets: pl, milky, clouds, twinkle,
    sun: { vec: sunVec },
    moon: moonAlt > -1 ? { vec: moonVec, lit: mo.lit, toward: normalize(moonVec.map((m, i) => m + 0.05 * toSun[i])) } : null,
    veil: 0.55 + 0.33 * brightness,
    egg: eggVec[2] > 0 ? eggVec : null,
    visibleNow: Math.round(k * (clouds && wx?.clouds ? 1 - wx.clouds.total : 1)),
    limZenith, skyMagZenith: skyMag(cond, 90), aod,
    movers: live ? (ms) => movers(place, ms, sunAlt) : () => [],
  };
  state.computedAt = now;
}

const textures = new Map();
function texture(kind, cover, color, opacity) {
  const key = `${kind}|${Math.round(cover * 40)}|${color.map((c) => c >> 3).join()}`;
  if (!textures.has(key)) {
    if (textures.size > 12) textures.clear();
    textures.set(key, cloudTexture(kind, cover, color, opacity));
  }
  return textures.get(key);
}

function movers(place, ms, sunAlt) {
  const out = [];
  if (state.iss) {
    const l = state.iss.look(place, ms);
    if (l && l.alt > -1) out.push({ kind: 'iss', vec: l.vec, visible: l.sunlit && sunAlt < -4 });
  }
  if (place === MASHHAD) {
    for (const p of state.planes) {
      const age = (ms - p.at) / 1000;
      if (age > 90) continue;
      const pos = (sec) => {
        const d = p.gs * 0.514444 * sec, tr = p.track * Math.PI / 180;
        const lat = p.lat + d * Math.cos(tr) / 111320;
        const lon = p.lon + d * Math.sin(tr) / (111320 * Math.cos(p.lat * Math.PI / 180));
        return enuFrom(place, lat, lon, p.altFt * 0.0003048).vec;
      };
      out.push({ kind: 'plane', vec: pos(age), ahead: pos(age + 20), dark: sunAlt < -3, label: p.call, seed: p.seed });
    }
  }
  return out;
}

// Clear, moonless night in Mashhad: with today's air and its lights, and with neither.
function compare(now) {
  if (!state.cat) return;
  const t = darkTime(now), M = skyMatrix(t, MASHHAD.lat, MASHHAD.lon), cat = state.cat;
  const up = new Float32Array(cat.count);
  for (let i = 0; i < cat.count; i++) up[i] = M[6] * cat.x[i] + M[7] * cat.y[i] + M[8] * cat.z[i];
  const aod = state.wx.get(MASHHAD)?.air?.aod ?? 0.25;
  const dirty = { polluted: true, aod, sunAlt: -30, moon: null };
  const clean = { polluted: false, aod: CLEAN_AOD, sunAlt: -30, moon: null };
  state.compare = {
    dirty: countVisible(cat, up, limitTable(dirty)),
    clean: countVisible(cat, up, limitTable(clean)),
    dirtyLimit: nelm(skyMag(dirty)), cleanLimit: nelm(skyMag(clean)),
    zenith: skyMag(dirty), aod,
  };
}

// ---- words for the stats panel ----

const tehran = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tehran', weekday: 'short', hour: '2-digit', minute: '2-digit' });
const utc = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', hour: '2-digit', minute: '2-digit' });
const timeAt = (place, ms) => place === MASHHAD ? tehran.format(ms) : utc.format(ms - 8 * 3600000);
const compass = (az) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(az / 45) % 8];
const num = (x) => Math.round(x).toLocaleString('en-US');

function sunWords(alt) {
  if (alt > 0) return `up, ${Math.round(alt)}° high`;
  if (alt > -6) return 'just set or about to rise (civil twilight)';
  if (alt > -12) return 'below the horizon (nautical twilight)';
  if (alt > -18) return 'below the horizon (astronomical twilight)';
  return `${Math.round(-alt)}° below the horizon: full night`;
}

function distanceKm(a, b) {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
function bearing(a, b) {
  const r = Math.PI / 180, y = Math.sin((b.lon - a.lon) * r) * Math.cos(b.lat * r);
  const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lon - a.lon) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
}

function renderStats(el) {
  const sc = state.scene;
  if (!sc || !el) return;
  const rows = [];
  const row = (k, v) => rows.push([k, v]);
  const wx = state.wx.get(sc.place);

  if (sc.mode === 'antipode') {
    row('place', '36.30°S 120.39°W, open Pacific, 995 m above the water');
    row('time', `${timeAt(ANTIPODE, sc.t)} there (UTC−8), with the Sun exactly opposite where it is for Mashhad`);
  } else if (sc.mode === 'pristine') {
    row('place', 'Mashhad, with no artificial light and clean air, on a clear night');
    row('time', sc.live ? `${timeAt(MASHHAD, sc.t)} (Mashhad)` : `tonight, ${timeAt(MASHHAD, sc.t)} (it is light there now)`);
  } else {
    row('place', 'Mashhad, 36.30°N 59.61°E, 995 m');
    row('time', `${timeAt(MASHHAD, sc.t)} (Mashhad)`);
  }
  row('sun', sunWords(sc.sunAlt));
  const m = sc.moonInfo;
  row('moon', `${Math.round(m.lit * 100)}% lit, ${m.waxing ? 'waxing' : 'waning'}, ${m.alt > 0 ? `${Math.round(m.alt)}° up` : 'below the horizon'}`);

  if (sc.mode !== 'pristine') {
    const c = wx?.clouds;
    row('clouds', c ? `${Math.round(c.total * 100)}% (low ${Math.round(c.low * 100)}, middle ${Math.round(c.mid * 100)}, high ${Math.round(c.high * 100)})` : 'no data yet');
    const a = wx?.air;
    row('air', a ? `PM2.5 ${Math.round(a.pm25)} µg/m³ · aerosol depth ${a.aod?.toFixed(2)} · US AQI ${Math.round(a.aqi)}` : 'no data yet');
  }
  if (sc.mode === 'mashhad') {
    row('light pollution', `about ${sc.skyMagZenith.toFixed(1)} mag/arcsec² overhead, Bortle ${bortle(sc.skyMagZenith)} (an estimate; a dark site is 21.9)`);
  } else if (sc.mode === 'antipode') {
    row('light pollution', 'none: the nearest land is Easter Island, ~1,500 km away');
  }
  row('stars now', sc.sunAlt > -6
    ? 'none: the sky is too bright'
    : `about ${num(sc.visibleNow)} to the naked eye (faintest: magnitude ${sc.limZenith.toFixed(1)})`);
  const cmp = state.compare;
  if (cmp && sc.mode !== 'antipode') {
    row('clear, moonless night', `about ${num(cmp.dirty)} stars over Mashhad, against ${num(cmp.clean)} with no light or air pollution`);
  }
  if (sc.mode === 'antipode') row('under your feet', 'these are the stars below Mashhad’s horizon right now');

  row('ISS', issWords(sc));
  if (sc.mode === 'mashhad') row('aircraft', planeWords());

  el.replaceChildren(...rows.map(([k, v]) => {
    const div = document.createElement('div');
    const dt = document.createElement('dt'), dd = document.createElement('dd');
    dt.textContent = k; dd.textContent = v;
    div.append(dt, dd);
    return div;
  }));
}

function issWords(sc) {
  if (!state.iss) return state.issError ? 'orbit data unavailable right now' : 'loading orbit…';
  const now = state.iss.look(sc.place, Date.now());
  const up = now && now.alt > 0 ? `up now, ${Math.round(now.alt)}° high in the ${compass(now.az)}${now.sunlit ? '' : ' (in Earth’s shadow)'}. ` : '';
  const next = state.passes.find((p) => p.visible && p.end > Date.now());
  if (!next) return up + 'no visible pass in the next 3 days';
  const start = next.visStart ?? next.start, az = next.visStartAz ?? next.startAz;
  return `${up}next visible pass ${timeAt(sc.place, start)}, rising in the ${compass(az)}, up to ${Math.round(next.maxAlt)}°`;
}

function planeWords() {
  if (state.planeError) return 'no live data right now';
  if (!state.planes.length) return 'none tracked nearby right now (volunteer receivers over Iran are few)';
  const list = state.planes
    .map((p) => ({ p, d: distanceKm(MASHHAD, p), b: bearing(MASHHAD, p) }))
    .sort((a, b) => a.d - b.d).slice(0, 4)
    .map(({ p, d, b }) => `${p.call} ${num(p.altFt)} ft, ${Math.round(d)} km ${compass(b)}`);
  return `${state.planes.length} nearby: ${list.join(' · ')}`;
}

// ---- wiring ----

export async function startSky({ background, dome, stats, buttons, card }) {
  const painters = [];
  const back = background ? new Painter(background, 'back') : null;
  const front = dome ? new Painter(dome, 'dome') : null;
  if (back) painters.push(back);
  if (front) painters.push(front);
  let domeVisible = false;

  function refresh() {
    if (!state.cat) return;
    compute(Date.now());
    renderStats(stats);
    if (still) draw(0);
  }

  // Passes depend on where you stand, so recompute them when the place changes.
  function updatePasses(force) {
    const place = MODES[state.mode].place;
    if (!state.iss || (!force && state.passPlace === place)) return;
    state.passes = state.iss.passes(place, Date.now());
    state.passPlace = place;
  }

  function setMode(mode) {
    if (!MODES[mode]) return;
    state.mode = mode;
    try { localStorage.setItem('sky-mode', mode); } catch { /* fine */ }
    for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
    updatePasses(false);
    refresh();
  }
  for (const b of buttons) b.addEventListener('click', () => setMode(b.dataset.mode));
  addEventListener('sky:mode', (e) => setMode(e.detail));
  for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode));

  // The easter egg: a star no eye can see, right where it really is.
  let eggStrength = 0, eggNear = false;
  if (front) {
    const near = (ev, radius) => {
      const sc = state.scene;
      if (!sc || !sc.egg) return false;
      const rect = dome.getBoundingClientRect();
      const p = front.project(sc.egg);
      const x = (ev.clientX - rect.left) * front.dpr, y = (ev.clientY - rect.top) * front.dpr;
      return p && Math.hypot(p[0] - x, p[1] - y) < radius * front.dpr;
    };
    dome.addEventListener('pointermove', (ev) => { eggNear = near(ev, 14); if (still) draw(0); });
    dome.addEventListener('pointerleave', () => { eggNear = false; });
    dome.addEventListener('click', (ev) => { if (near(ev, ev.pointerType === 'touch' ? 22 : 14)) openCard(card); });
    new IntersectionObserver((es) => { domeVisible = es[0].isIntersecting; }).observe(dome);
  }

  function draw(dt) {
    const now = Date.now();
    eggStrength += ((eggNear ? 1 : 0) - eggStrength) * Math.min(1, dt * 6 || 1);
    const egg = state.scene?.egg && eggStrength > 0.02 ? { vec: state.scene.egg, strength: eggStrength } : null;
    if (back) back.frame(state.scene, now, dt, null);
    if (front && (domeVisible || dt === 0)) front.frame(state.scene, now, dt, egg);
  }

  addEventListener('resize', () => { painters.forEach((p) => p.resize()); draw(0); });

  try {
    state.cat = await loadCatalog('data/stars.bin');
  } catch (err) {
    if (stats) stats.textContent = 'The star catalogue did not load.';
    return;
  }
  compare(Date.now());
  refresh();

  // Feeds. Each one quietly keeps the last good value.
  const pullWeather = async () => {
    for (const place of [MASHHAD, ANTIPODE]) {
      try { state.wx.set(place, await weather(place)); } catch { /* keep old */ }
    }
    compare(Date.now());
    refresh();
  };
  pullWeather();
  setInterval(pullWeather, 15 * 60000);

  const pullPlanes = async () => {
    if (document.hidden || state.mode !== 'mashhad') return;
    try {
      const list = await aircraft(MASHHAD);
      state.planes = list.map((p) => ({ ...p, seed: hashUnit(parseInt(p.id, 16) || 1) * 10 }));
      state.planeError = false;
    } catch {
      state.planeError = true;
    }
    renderStats(stats);
  };
  pullPlanes();
  setInterval(pullPlanes, 20000);

  const pullIss = async () => {
    try {
      state.iss = await makeIss(await issTle());
      updatePasses(true);
    } catch {
      state.issError = true;
    }
    renderStats(stats);
  };
  pullIss();
  setInterval(() => updatePasses(true), 30 * 60000);

  setInterval(refresh, 10000);
  if (still) return;
  let last = performance.now(), lastDraw = 0;
  const tick = (ts) => {
    requestAnimationFrame(tick);
    if (document.hidden) { last = ts; return; }
    const gap = domeVisible ? 33 : 50;
    if (ts - lastDraw < gap) return;
    const dt = Math.min(0.1, (ts - last) / 1000);
    last = ts; lastDraw = ts;
    draw(dt);
  };
  requestAnimationFrame(tick);
}

function openCard(card) {
  if (!card) return;
  const cmp = state.compare;
  const limit = cmp ? cmp.dirtyLimit : 4;
  const set = (sel, text) => { const n = card.querySelector(sel); if (n) n.textContent = text; };
  set('[data-limit]', limit.toFixed(1));
  set('[data-reach]', num(sunLikeReach(limit)));
  if (typeof card.showModal === 'function') card.showModal();
  else card.setAttribute('open', '');
}
