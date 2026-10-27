// Astronomy for the sky: time, coordinate frames, Sun, Moon and planets.
// Low-precision formulas (Meeus, "Astronomical Algorithms"; the Astronomical
// Almanac's short Moon series; JPL's approximate planet elements). They are good
// to a fraction of a degree, which is far below what a drawing can show.

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;

const norm360 = (x) => ((x % 360) + 360) % 360;

export const julianDate = (ms) => ms / 86400000 + 2440587.5;
export const centuries = (ms) => (julianDate(ms) - 2451545) / 36525;

// Greenwich mean sidereal time, degrees (Meeus 12.4).
export function gmst(ms) {
  const d = julianDate(ms) - 2451545, T = d / 36525;
  return norm360(280.46061837 + 360.98564736629 * d + 0.000387933 * T * T - T * T * T / 38710000);
}

export function obliquity(ms) {
  return 23.439291 - 0.0130042 * centuries(ms);
}

// Unit vector from right ascension and declination (degrees).
export function radecToVec(ra, dec) {
  const a = ra * DEG, d = dec * DEG, c = Math.cos(d);
  return [c * Math.cos(a), c * Math.sin(a), Math.sin(d)];
}

// 3x3 helpers on flat arrays, row-major.
function mul(A, B) {
  const C = new Array(9);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      C[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
  return C;
}
function rotZ(t) { const c = Math.cos(t), s = Math.sin(t); return [c, -s, 0, s, c, 0, 0, 0, 1]; }
function rotY(t) { const c = Math.cos(t), s = Math.sin(t); return [c, 0, s, 0, 1, 0, -s, 0, c]; }
export function apply(M, v) {
  return [
    M[0] * v[0] + M[1] * v[1] + M[2] * v[2],
    M[3] * v[0] + M[4] * v[1] + M[5] * v[2],
    M[6] * v[0] + M[7] * v[1] + M[8] * v[2],
  ];
}

// Precession from J2000 to the equinox of date (IAU 1976, Meeus 21.2).
export function precession(ms) {
  const T = centuries(ms), as = DEG / 3600;
  const zeta = (2306.2181 * T + 0.30188 * T * T + 0.017998 * T * T * T) * as;
  const z = (2306.2181 * T + 1.09468 * T * T + 0.018203 * T * T * T) * as;
  const theta = (2004.3109 * T - 0.42665 * T * T - 0.041833 * T * T * T) * as;
  return mul(rotZ(z), mul(rotY(-theta), rotZ(zeta)));
}

// Equatorial (of date) to local horizon frame. Rows give east, north, up.
export function horizonMatrix(ms, lat, lon) {
  const L = (gmst(ms) + lon) * DEG, p = lat * DEG;
  const cL = Math.cos(L), sL = Math.sin(L), cp = Math.cos(p), sp = Math.sin(p);
  // x' points to the meridian on the equator, y' east, z' the celestial pole.
  const toHA = [cL, sL, 0, -sL, cL, 0, 0, 0, 1];
  const toLocal = [0, 1, 0, -sp, 0, cp, cp, 0, sp];
  return mul(toLocal, toHA);
}

// Combined matrix: J2000 unit vector straight to east/north/up.
export function skyMatrix(ms, lat, lon) {
  return mul(horizonMatrix(ms, lat, lon), precession(ms));
}

export function vecToAltAz(v) {
  const alt = Math.asin(Math.max(-1, Math.min(1, v[2]))) * RAD;
  const az = norm360(Math.atan2(v[0], v[1]) * RAD);
  return { alt, az };
}

export function altAzToVec(alt, az) {
  const a = alt * DEG, z = az * DEG, c = Math.cos(a);
  return [c * Math.sin(z), c * Math.cos(z), Math.sin(a)];
}

// Atmospheric refraction for an object at true altitude h (degrees), Saemundsson.
export function refraction(h) {
  if (h < -1.5) return 0;
  return 1.02 / Math.tan((h + 10.3 / (h + 5.11)) * DEG) / 60;
}

function eclToEqDate(lambda, beta, eps) {
  const l = lambda * DEG, b = beta * DEG, e = eps * DEG;
  const x = Math.cos(b) * Math.cos(l);
  const y = Math.cos(e) * Math.cos(b) * Math.sin(l) - Math.sin(e) * Math.sin(b);
  const z = Math.sin(e) * Math.cos(b) * Math.sin(l) + Math.cos(e) * Math.sin(b);
  return [x, y, z];
}

// Apparent Sun (Meeus 25), equinox of date.
export function sun(ms) {
  const T = centuries(ms);
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  const M = (357.52911 + 35999.05029 * T - 0.0001537 * T * T) * DEG;
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M)
    + (0.019993 - 0.000101 * T) * Math.sin(2 * M) + 0.000289 * Math.sin(3 * M);
  const omega = (125.04 - 1934.136 * T) * DEG;
  const lambda = L0 + C - 0.00569 - 0.00478 * Math.sin(omega);
  const eps = obliquity(ms) + 0.00256 * Math.cos(omega);
  const e = 0.016708634 - 0.000042037 * T;
  const dist = 1.000001018 * (1 - e * e) / (1 + e * Math.cos(M + C * DEG));
  return { lambda: norm360(lambda), vec: eclToEqDate(lambda, 0, eps), dist };
}

// Moon, Astronomical Almanac low-precision series (about 0.3 degrees).
export function moon(ms) {
  const T = centuries(ms);
  const s = (a, b) => Math.sin((a + b * T) * DEG), c = (a, b) => Math.cos((a + b * T) * DEG);
  const lambda = 218.32 + 481267.881 * T
    + 6.29 * s(135.0, 477198.87) - 1.27 * s(259.3, -413335.36)
    + 0.66 * s(235.7, 890534.22) + 0.21 * s(269.9, 954397.74)
    - 0.19 * s(357.5, 35999.05) - 0.11 * s(186.5, 966404.03);
  const beta = 5.13 * s(93.3, 483202.02) + 0.28 * s(228.2, 960400.89)
    - 0.28 * s(318.3, 6003.15) - 0.17 * s(217.6, -407332.21);
  const parallax = 0.9508 + 0.0518 * c(135.0, 477198.87) + 0.0095 * c(259.3, -413335.36)
    + 0.0078 * c(235.7, 890534.22) + 0.0028 * c(269.9, 954397.74);
  const sl = sun(ms).lambda;
  // Elongation from the Sun, phase angle, lit fraction; waxing when east of the Sun.
  const elong = Math.acos(Math.cos(beta * DEG) * Math.cos((lambda - sl) * DEG)) * RAD;
  const phaseAngle = 180 - elong;
  const lit = (1 + Math.cos(phaseAngle * DEG)) / 2;
  const waxing = Math.sin((lambda - sl) * DEG) > 0;
  return {
    vec: eclToEqDate(norm360(lambda), beta, obliquity(ms)),
    parallax, phaseAngle, lit, waxing,
  };
}

// The Moon is close enough that where you stand moves it by up to a degree.
export function topocentricAlt(altGeo, parallax) {
  return altGeo - parallax * Math.cos(altGeo * DEG);
}

// JPL approximate Keplerian elements, J2000 ecliptic, valid 1800-2050.
// a, e, I, L, long. perihelion, long. node, then rates per century.
const ELEMENTS = {
  mercury: [0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593,
    0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081],
  venus: [0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255,
    0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418],
  earth: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0,
    0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0],
  mars: [1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891,
    0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
  jupiter: [5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909,
    -0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
  saturn: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448,
    -0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794],
};

function helio(name, T) {
  const el = ELEMENTS[name];
  const a = el[0] + el[6] * T, e = el[1] + el[7] * T, I = (el[2] + el[8] * T) * DEG;
  const L = el[3] + el[9] * T, peri = el[4] + el[10] * T, node = el[5] + el[11] * T;
  let M = norm360(L - peri); if (M > 180) M -= 360;
  M *= DEG;
  let E = M + e * Math.sin(M);
  for (let i = 0; i < 6; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const w = (peri - node) * DEG, O = node * DEG;
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), cI = Math.cos(I), sI = Math.sin(I);
  return [
    (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
    (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
    sw * sI * xp + cw * sI * yp,
  ];
}

// Approximate visual magnitudes (Meeus 41), from Sun distance r, Earth distance d, phase angle i.
const MAGNITUDE = {
  mercury: (r, d, i) => -0.42 + 5 * Math.log10(r * d) + 0.038 * i - 0.000273 * i * i + 0.000002 * i * i * i,
  venus: (r, d, i) => -4.40 + 5 * Math.log10(r * d) + 0.0009 * i + 0.000239 * i * i - 0.00000065 * i * i * i,
  mars: (r, d, i) => -1.52 + 5 * Math.log10(r * d) + 0.016 * i,
  jupiter: (r, d, i) => -9.40 + 5 * Math.log10(r * d) + 0.005 * i,
  saturn: (r, d) => -8.88 + 5 * Math.log10(r * d),
};

export const PLANET_COLORS = {
  mercury: [215, 205, 190], venus: [255, 250, 235], mars: [255, 170, 120],
  jupiter: [250, 236, 210], saturn: [240, 222, 170],
};

// Geocentric J2000 unit vectors and magnitudes of the five naked-eye planets.
export function planets(ms) {
  const T = centuries(ms), eps = 23.43928 * DEG;
  const earth = helio('earth', T), R = Math.hypot(...earth);
  return Object.keys(MAGNITUDE).map((name) => {
    const p = helio(name, T);
    const g = [p[0] - earth[0], p[1] - earth[1], p[2] - earth[2]];
    const r = Math.hypot(...p), d = Math.hypot(...g);
    const i = Math.acos(Math.max(-1, Math.min(1, (r * r + d * d - R * R) / (2 * r * d)))) * RAD;
    const eq = [g[0], g[1] * Math.cos(eps) - g[2] * Math.sin(eps), g[1] * Math.sin(eps) + g[2] * Math.cos(eps)];
    return { name, vec: eq.map((x) => x / d), mag: MAGNITUDE[name](r, d, i) };
  });
}

// Galactic to J2000 equatorial (rows of the equatorial-to-galactic matrix, transposed).
const GAL = [
  -0.0548755604, -0.8734370902, -0.4838350155,
  0.4941094279, -0.4448296300, 0.7469822445,
  -0.8676661490, -0.1980763734, 0.4559837762,
];
export function galacticToVec(l, b) {
  const L = l * DEG, B = b * DEG;
  const g = [Math.cos(B) * Math.cos(L), Math.cos(B) * Math.sin(L), Math.sin(B)];
  return [
    GAL[0] * g[0] + GAL[3] * g[1] + GAL[6] * g[2],
    GAL[1] * g[0] + GAL[4] * g[1] + GAL[7] * g[2],
    GAL[2] * g[0] + GAL[5] * g[1] + GAL[8] * g[2],
  ];
}

// Geodetic latitude/longitude/height to Earth-fixed coordinates (km, WGS84).
export function geodeticToEcef(lat, lon, hKm) {
  const a = 6378.137, f = 1 / 298.257223563, e2 = f * (2 - f);
  const p = lat * DEG, l = lon * DEG, s = Math.sin(p);
  const N = a / Math.sqrt(1 - e2 * s * s);
  return [(N + hKm) * Math.cos(p) * Math.cos(l), (N + hKm) * Math.cos(p) * Math.sin(l), (N * (1 - e2) + hKm) * s];
}

// Where a point (e.g. an aircraft) appears in the sky of an observer: east/north/up unit vector + range.
export function enuFrom(obs, lat, lon, hKm) {
  const o = geodeticToEcef(obs.lat, obs.lon, obs.elev / 1000), t = geodeticToEcef(lat, lon, hKm);
  const dx = t[0] - o[0], dy = t[1] - o[1], dz = t[2] - o[2];
  const p = obs.lat * DEG, l = obs.lon * DEG;
  const e = -Math.sin(l) * dx + Math.cos(l) * dy;
  const n = -Math.sin(p) * Math.cos(l) * dx - Math.sin(p) * Math.sin(l) * dy + Math.cos(p) * dz;
  const u = Math.cos(p) * Math.cos(l) * dx + Math.cos(p) * Math.sin(l) * dy + Math.sin(p) * dz;
  const r = Math.hypot(e, n, u);
  return { vec: [e / r, n / r, u / r], range: r };
}
