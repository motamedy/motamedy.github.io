// Clouds from real cloud cover: tileable noise, cut at the level that leaves exactly
// the reported fraction of sky covered, then tinted by whatever lights them.

const SIZE = 384;

function hash(x, y, seed) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

// Value noise that wraps every px by py cells, so the texture tiles.
function noise(x, y, px, py, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
  const at = (i, j) => hash((xi + i) % px, (yi + j) % py, seed);
  const top = at(0, 0) + (at(1, 0) - at(0, 0)) * sx;
  const bottom = at(0, 1) + (at(1, 1) - at(0, 1)) * sx;
  return top + (bottom - top) * sy;
}

// Fractal noise; `stretch` > 1 drags it out sideways, a little like cirrus.
function field(seed, stretch) {
  const v = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let sum = 0, amp = 0.5, total = 0;
      for (let o = 0; o < 5; o++) {
        const py = 4 << o, px = Math.max(1, py / stretch);
        sum += amp * noise(x * px / SIZE, y * py / SIZE, px, py, seed + o);
        total += amp;
        amp *= 0.5;
      }
      v[y * SIZE + x] = sum / total;
    }
  }
  return v;
}

const fields = new Map();
function cachedField(kind) {
  if (!fields.has(kind)) fields.set(kind, kind === 'high' ? field(31, 2) : field(7, 1));
  return fields.get(kind);
}

// cover: 0..1. color: [r,g,b]. opacity: how solid the thickest parts are.
export function cloudTexture(kind, cover, color, opacity) {
  if (cover < 0.02) return null;
  const v = cachedField(kind);
  const sorted = Float32Array.from(v).sort();
  const cut = sorted[Math.min(sorted.length - 1, Math.floor((1 - cover) * sorted.length))];
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(SIZE, SIZE);
  for (let i = 0; i < v.length; i++) {
    const d = v[i] - cut;
    let a = Math.max(0, Math.min(1, (d + 0.04) / 0.16));
    a = a * a * (3 - 2 * a);
    if (cover > 0.97) a = Math.max(a, 0.85);
    const shade = 0.82 + 0.3 * Math.max(0, Math.min(1, d * 4));
    img.data[i * 4] = Math.min(255, color[0] * shade);
    img.data[i * 4 + 1] = Math.min(255, color[1] * shade);
    img.data[i * 4 + 2] = Math.min(255, color[2] * shade);
    img.data[i * 4 + 3] = 255 * a * opacity;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// What colour the clouds are: lit by the Sun, the Moon, the city below, or nothing.
export function cloudColor(sunAlt, moon, polluted, aod) {
  const day = Math.max(0, Math.min(1, (sunAlt + 6) / 12));
  const golden = Math.max(0, 1 - Math.abs(sunAlt - 1) / 7);
  const moonlight = moon && moon.alt > 0 ? moon.lit * Math.min(1, moon.alt / 20) : 0;
  const city = polluted ? Math.min(1.6, 0.6 + 2 * aod) : 0;
  const night = [14 + 38 * moonlight + 62 * city, 15 + 42 * moonlight + 44 * city, 19 + 50 * moonlight + 30 * city];
  const lit = [236 - 10 * golden, 238 - 70 * golden, 242 - 115 * golden];
  return night.map((n, i) => Math.round(n + (lit[i] - n) * day));
}
