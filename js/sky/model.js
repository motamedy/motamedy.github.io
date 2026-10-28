// How bright the sky is, and therefore which stars survive.
// Brightness is in V mag/arcsec² (bigger = darker). Sources are added as light, then
// turned into a naked-eye limiting magnitude. Moonlight follows Krisciunas & Schaefer
// (1991); the rest are simple, labelled approximations.

import { DEG } from './astro.js';

export const NATURAL = 21.9;          // moonless natural sky at the zenith
// Mashhad's zenith brightness with typical air (AOD 0.2) is an estimate for a city of
// ~3.4 million (Bortle 8); no published measurement was found. Change it if you measure one.
export const MASHHAD_ZENITH = 17.9;
export const CLEAN_AOD = 0.05;

export const toNl = (m) => 34.08 * Math.exp(20.7233 - 0.92104 * m);
export const toMag = (nl) => (20.7233 - Math.log(nl / 34.08)) / 0.92104;
const ARTIFICIAL_NL = toNl(MASHHAD_ZENITH) - toNl(NATURAL);

// Extinction in magnitudes per airmass: Rayleigh at ~1 km, ozone, aerosols.
export const extinction = (aod) => 0.12 + 1.086 * aod;

export function airmass(altDeg) {
  const z = (90 - Math.max(altDeg, 0)) * DEG;
  return 1 / Math.sqrt(1 - 0.96 * Math.sin(z) ** 2);
}

// Twilight at the zenith versus Sun altitude: rough values from measurements.
const TWILIGHT = [[-18, 22.2], [-15, 21.2], [-12, 19.6], [-9, 17.3], [-6, 14.6], [-3, 11.6], [0, 8.6], [10, 4.6], [90, 3.5]];
function twilightMag(sunAlt) {
  if (sunAlt <= -18) return 30;
  for (let i = 1; i < TWILIGHT.length; i++) {
    const [h1, m1] = TWILIGHT[i - 1], [h2, m2] = TWILIGHT[i];
    if (sunAlt <= h2) return m1 + (m2 - m1) * (sunAlt - h1) / (h2 - h1);
  }
  return 3.5;
}

// Moonlit sky brightness at zenith distance Z, Krisciunas & Schaefer 1991.
function moonNl(moon, Zdeg, k) {
  if (!moon || moon.alt < -1) return 0;
  const a = moon.phaseAngle;
  const I = 10 ** (-0.4 * (3.84 + 0.026 * Math.abs(a) + 4e-9 * a ** 4));
  const rho = moon.sep ?? (90 - moon.alt);
  const f = 10 ** 5.36 * (1.06 + Math.cos(rho * DEG) ** 2) + 10 ** (6.15 - rho / 40);
  const Xm = airmass(moon.alt), X = airmass(90 - Zdeg);
  return f * I * 10 ** (-0.4 * k * Xm) * (1 - 10 ** (-0.4 * k * X));
}

// Aerosols scatter more city light back down: brighter glow over a dirtier city.
const aerosolGlow = (aod) => Math.max(0.7, Math.min(2.5, 0.6 + 2 * aod));

// Each source of sky light, in nanolamberts, at altitude `alt` (degrees).
// cond: { polluted, aod, sunAlt, moon: {alt, phaseAngle} }
export function skyParts(cond, alt = 90) {
  const k = extinction(cond.aod);
  const Z = 90 - Math.max(alt, 0);
  const X = airmass(alt);
  const tw = twilightMag(cond.sunAlt);
  return {
    // Natural airglow brightens toward the horizon (van Rhijn).
    natural: toNl(NATURAL) * Math.min(X, 3.5) ** 0.6,
    // The city's light dome grows toward the horizon.
    artificial: cond.polluted ? ARTIFICIAL_NL * aerosolGlow(cond.aod) * (1 + 2.5 * (Z / 90) ** 3) : 0,
    moon: moonNl(cond.moon, Z, k),
    sun: tw < 30 ? toNl(tw) * (0.7 + 0.5 * Z / 90) : 0,
  };
}

export function skyMag(cond, alt = 90) {
  const p = skyParts(cond, alt);
  return toMag(p.natural + p.artificial + p.moon + p.sun);
}

// Naked-eye limiting magnitude from sky brightness (common SQM conversion).
export function nelm(mag) {
  return 7.93 - 5 * Math.log10(10 ** (4.316 - mag / 5) + 1);
}

// Bortle class from zenith brightness (ranges as listed for the Bortle scale).
export function bortle(mag) {
  if (mag >= 21.99) return 1;
  if (mag >= 21.89) return 2;
  if (mag >= 21.69) return 3;
  if (mag >= 20.49) return 4;
  if (mag >= 19.50) return 5;
  if (mag >= 18.94) return 6;
  if (mag >= 18.38) return 7;
  return '8–9';                       // the scale doesn't separate the two by brightness
}

// Visibility thresholds by altitude band, so testing 12,000 stars stays cheap.
export function limitTable(cond) {
  const k = extinction(cond.aod), table = [];
  for (let alt = 0; alt <= 90; alt += 2) {
    table.push({ limit: nelm(skyMag(cond, alt)), k, X: airmass(alt) });
  }
  return table;
}

// How faint a star can be at altitude `alt` and still be seen.
export function limitAt(table, alt) {
  const t = table[Math.max(0, Math.min(table.length - 1, Math.round(alt / 2)))];
  return t.limit - t.k * (t.X - 1);
}

// Count catalog stars above the horizon that the eye could pick out.
export function countVisible(cat, up, table) {
  let n = 0;
  for (let i = 0; i < cat.count; i++) {
    const u = up[i];
    if (u <= 0.02) continue;
    if (cat.mag[i] <= limitAt(table, Math.asin(u) / DEG)) n++;
  }
  return n;
}

// How far away a star as bright as the Sun stays visible, in light-years.
export function sunLikeReach(limit) {
  return 10 ** ((limit - 4.83 + 5) / 5) * 3.2616;
}

// A sky colour that follows from the light itself: how bright, and from which sources.
const HUES = {
  natural: [0.42, 0.55, 1.0],
  artificial: [0.95, 0.68, 0.46],
  moon: [0.5, 0.62, 0.95],
  sun: [0.36, 0.58, 1.0],
};
export function skyColor(parts, whiten = 0) {
  let total = 0;
  const hue = [0, 0, 0];
  for (const key in HUES) {
    total += parts[key];
    for (let c = 0; c < 3; c++) hue[c] += HUES[key][c] * parts[key];
  }
  const L = total * 3.183e-6;                     // nanolamberts to cd/m²
  const b = Math.max(0, Math.min(1, (Math.log10(L) + 3.9) / 7.4)) ** 1.1;
  const peak = Math.max(...hue);
  return hue.map((h) => {
    const v = h / peak;
    return Math.round(255 * b * (v + (1 - v) * whiten));
  });
}
