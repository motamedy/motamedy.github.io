// Draws a computed scene. The same painter serves the round dome in ~/sky and the
// page background; both use a stereographic projection looking straight up, north at
// the top and east on the left, the way the sky looks when you lie on your back.

const TAU = Math.PI * 2;

function sprite(color, size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, `rgba(${color},1)`);
  grad.addColorStop(0.35, `rgba(${color},0.35)`);
  grad.addColorStop(1, `rgba(${color},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}
const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

export class Painter {
  constructor(canvas, kind) {
    this.canvas = canvas;
    this.kind = kind;                    // 'dome' or 'back'
    this.ctx = canvas.getContext('2d');
    this.layerFor = -1;
    this.drift = { low: [0, 0], high: [0, 0] };
    this.mwSprite = sprite('215,212,235');
    this.glowSprite = sprite('255,255,255');
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, this.kind === 'back' ? 1.5 : 2);
    const w = Math.max(1, Math.round(rect.width * dpr)), h = Math.max(1, Math.round(rect.height * dpr));
    if (w === this.w && h === this.h) return false;
    this.canvas.width = this.w = w;
    this.canvas.height = this.h = h;
    this.dpr = dpr;
    this.cx = w / 2;
    this.cy = h / 2;
    // The dome shows the whole sky; the background fills the window, corners included.
    this.R = this.kind === 'dome' ? Math.min(w, h) / 2 - 22 * dpr : Math.hypot(w, h) / 2 * 1.02;
    this.unit = this.kind === 'dome' ? dpr : dpr * 0.85;
    this.layerFor = -1;
    return true;
  }

  project(v) {
    if (v[2] < -0.08) return null;
    const d = 1 + v[2];
    return [this.cx - this.R * v[0] / d, this.cy - this.R * v[1] / d];
  }

  inside(p) {
    return p && Math.hypot(p[0] - this.cx, p[1] - this.cy) <= this.R;
  }

  // Stars, planets and the Milky Way change slowly: draw them once per scene.
  buildLayers(scene) {
    const { w, h, unit } = this;
    this.stars ??= document.createElement('canvas');
    this.stars.width = w;
    this.stars.height = h;

    const g = this.stars.getContext('2d');
    const s = scene.stars;
    for (let i = 0; i < s.n; i++) {
      const p = this.project([s.e[i], s.nn[i], s.u[i]]);
      if (!this.inside(p)) continue;
      const r = s.size[i] * unit, c = s.rgb[i];
      g.fillStyle = rgb(c, s.alpha[i]);
      if (r < 0.9) {
        g.fillRect(p[0] - 0.5, p[1] - 0.5, 1.2, 1.2);
      } else {
        g.beginPath(); g.arc(p[0], p[1], r, 0, TAU); g.fill();
      }
    }
    for (const pl of scene.planets) {
      const p = this.project(pl.vec);
      if (!this.inside(p)) continue;
      g.fillStyle = rgb(pl.rgb, pl.alpha);
      g.beginPath(); g.arc(p[0], p[1], pl.size * unit, 0, TAU); g.fill();
      if (this.kind === 'dome') this.label(g, pl.label, p, pl.size * unit + 4 * unit);
    }

    // The Milky Way only exists in a dark sky; skip its (large) layer otherwise.
    if (scene.milky.alpha > 0.01) {
      this.mw ??= document.createElement('canvas');
      this.mw.width = w;
      this.mw.height = h;
      const m = this.mw.getContext('2d');
      m.globalCompositeOperation = 'lighter';
      const size = this.R * 0.07;
      for (const pt of scene.milky.points) {
        const p = this.project(pt.vec);
        if (!this.inside(p)) continue;
        m.globalAlpha = pt.w * 0.05;
        m.drawImage(this.mwSprite, p[0] - size / 2, p[1] - size / 2, size, size);
      }
    }
    this.layerFor = scene.version;
  }

  label(g, text, p, dx) {
    g.save();
    g.font = `${10 * this.dpr}px "JetBrains Mono", monospace`;
    g.fillStyle = 'rgba(200,196,190,0.75)';
    g.textBaseline = 'middle';
    g.fillText(text, p[0] + dx, p[1]);
    g.restore();
  }

  frame(scene, now, dt, egg) {
    if (!scene) return;
    if (this.layerFor !== scene.version) this.buildLayers(scene);
    const { ctx: g, cx, cy, R, w, h, unit } = this;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    if (this.kind === 'back') { g.fillStyle = '#191919'; g.fillRect(0, 0, w, h); }

    g.save();
    g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.clip();

    // The sky itself: zenith to horizon, its colour worked out from the light in it.
    const sky = scene.sky, grad = g.createRadialGradient(cx, cy, 0, cx, cy, R);
    grad.addColorStop(0, rgb(sky.zenith));
    grad.addColorStop(0.41, rgb(sky.mid));
    grad.addColorStop(0.77, rgb(sky.low));
    grad.addColorStop(1, rgb(sky.horizon));
    g.fillStyle = grad;
    g.fillRect(cx - R, cy - R, 2 * R, 2 * R);

    // Glow around the Sun, or where it is hiding just below the horizon.
    if (scene.glow) {
      const v = scene.glow.vec, flat = Math.hypot(v[0], v[1]) || 1;
      const p = this.project(v[2] > 0 ? v : [v[0] / flat, v[1] / flat, 0]);
      const gg = g.createRadialGradient(p[0], p[1], 0, p[0], p[1], R * scene.glow.radius);
      gg.addColorStop(0, rgb(scene.glow.color, scene.glow.alpha));
      gg.addColorStop(1, rgb(scene.glow.color, 0));
      g.fillStyle = gg;
      g.fillRect(cx - R, cy - R, 2 * R, 2 * R);
    }

    if (scene.milky.alpha > 0.01) {
      g.globalAlpha = scene.milky.alpha;
      g.drawImage(this.mw, 0, 0);
      g.globalAlpha = 1;
    }
    g.drawImage(this.stars, 0, 0);

    // A few of the brightest stars twinkle.
    if (scene.twinkle && dt > 0) {
      for (const t of scene.twinkle) {
        const p = this.project(t.vec);
        if (!this.inside(p)) continue;
        const a = 0.18 * (0.5 + 0.5 * Math.sin(now / 1000 * t.speed + t.phase)) * t.alpha;
        const s = t.size * unit * 5;
        g.globalAlpha = a;
        g.drawImage(this.glowSprite, p[0] - s / 2, p[1] - s / 2, s, s);
      }
      g.globalAlpha = 1;
    }

    if (scene.sun && scene.sun.vec[2] > -0.01) {
      const p = this.project(scene.sun.vec), r = 7 * unit;
      const sg = g.createRadialGradient(p[0], p[1], 0, p[0], p[1], r * 5);
      sg.addColorStop(0, 'rgba(255,250,235,1)'); sg.addColorStop(0.2, 'rgba(255,245,220,0.9)'); sg.addColorStop(1, 'rgba(255,240,210,0)');
      g.fillStyle = sg;
      g.beginPath(); g.arc(p[0], p[1], r * 5, 0, TAU); g.fill();
    }

    if (scene.moon && scene.moon.vec[2] > -0.01) this.drawMoon(scene.moon);

    this.drawClouds(scene, dt);

    for (const m of scene.movers(now)) this.drawMover(m, now);

    if (this.kind === 'back') {
      g.fillStyle = `rgba(25,25,25,${scene.veil})`;
      g.fillRect(cx - R, cy - R, 2 * R, 2 * R);
    }
    g.restore();

    if (this.kind === 'dome') {
      this.drawFrame(scene);
      if (egg) this.drawGlint(egg);
    }
  }

  drawMoon(moon) {
    const g = this.ctx, p = this.project(moon.vec), r = 5.5 * this.unit;
    const ahead = this.project(moon.toward);
    const ang = Math.atan2(ahead[1] - p[1], ahead[0] - p[0]);
    const k = moon.lit, a = r * Math.abs(1 - 2 * k);
    g.save();
    g.translate(p[0], p[1]);
    const glow = g.createRadialGradient(0, 0, r, 0, 0, r * 6);
    glow.addColorStop(0, `rgba(220,225,240,${0.25 * k})`); glow.addColorStop(1, 'rgba(220,225,240,0)');
    g.fillStyle = glow;
    g.beginPath(); g.arc(0, 0, r * 6, 0, TAU); g.fill();
    g.rotate(ang);
    g.fillStyle = 'rgba(60,62,70,0.85)';
    g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
    g.fillStyle = 'rgb(236,232,220)';
    g.beginPath();
    g.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
    g.ellipse(0, 0, Math.max(a, 0.01), r, 0, Math.PI / 2, -Math.PI / 2, k < 0.5);
    g.fill();
    g.restore();
    if (this.kind === 'dome') this.label(g, 'Moon', p, r + 4 * this.unit);
  }

  drawClouds(scene, dt) {
    const g = this.ctx, c = scene.clouds;
    if (!c) return;
    const tile = tex => tex.width, back = this.kind === 'back';
    const speed = this.R / 220;
    for (const kind of ['high', 'low']) {
      const tex = c[kind];
      if (!tex) continue;
      const scale = (this.R * (back ? 1.15 : 1.3)) / tile(tex);
      const d = this.drift[kind], f = kind === 'high' ? 1.6 : 1;
      d[0] = (d[0] + c.wind[0] * f * speed * dt) % (tile(tex) * scale);
      d[1] = (d[1] + c.wind[1] * f * speed * dt) % (tile(tex) * scale);
      if (!this['pat_' + kind] || this['tex_' + kind] !== tex) {
        this['pat_' + kind] = g.createPattern(tex, 'repeat');
        this['tex_' + kind] = tex;
      }
      const pat = this['pat_' + kind];
      pat.setTransform(new DOMMatrix().translate(this.cx + d[0], this.cy + d[1]).scale(scale));
      g.fillStyle = pat;
      g.globalAlpha = back ? 0.55 : 1;
      g.fillRect(this.cx - this.R, this.cy - this.R, 2 * this.R, 2 * this.R);
      g.globalAlpha = 1;
    }
  }

  drawMover(m, now) {
    const g = this.ctx, p = this.project(m.vec), u = this.unit;
    if (!this.inside(p) || m.vec[2] < 0) return;
    if (m.kind === 'iss') {
      if (m.visible) {
        g.fillStyle = 'rgba(255,255,250,0.95)';
        g.beginPath(); g.arc(p[0], p[1], 2.4 * u, 0, TAU); g.fill();
        g.globalAlpha = 0.35;
        g.drawImage(this.glowSprite, p[0] - 9 * u, p[1] - 9 * u, 18 * u, 18 * u);
        g.globalAlpha = 1;
      } else if (this.kind === 'dome') {
        g.strokeStyle = 'rgba(200,196,190,0.6)';
        g.lineWidth = u;
        g.beginPath(); g.arc(p[0], p[1], 3 * u, 0, TAU); g.stroke();
      }
      if (this.kind === 'dome') this.label(g, m.visible ? 'ISS' : 'ISS (in shadow)', p, 6 * u);
      return;
    }
    // An aircraft: red on the left wing, green on the right, a white strobe, a red beacon.
    const q = this.project(m.ahead) || p;
    const ang = Math.atan2(q[1] - p[1], q[0] - p[0]);
    const nx = -Math.sin(ang), ny = Math.cos(ang), span = 2.6 * u;
    if (m.dark) {
      g.fillStyle = 'rgba(255,70,60,0.95)';
      g.beginPath(); g.arc(p[0] - nx * span, p[1] - ny * span, 1.1 * u, 0, TAU); g.fill();
      g.fillStyle = 'rgba(80,255,120,0.95)';
      g.beginPath(); g.arc(p[0] + nx * span, p[1] + ny * span, 1.1 * u, 0, TAU); g.fill();
      const phase = (now + m.seed * 1000) % 1300;
      if (phase < 70) {
        g.globalAlpha = 0.9;
        g.drawImage(this.glowSprite, p[0] - 6 * u, p[1] - 6 * u, 12 * u, 12 * u);
        g.globalAlpha = 1;
      }
      if ((now + m.seed * 700) % 1000 < 120) {
        g.fillStyle = 'rgba(255,40,40,0.9)';
        g.beginPath(); g.arc(p[0], p[1], 1.3 * u, 0, TAU); g.fill();
      }
    } else {
      g.fillStyle = 'rgba(70,70,80,0.8)';
      g.beginPath(); g.arc(p[0], p[1], 1.4 * u, 0, TAU); g.fill();
    }
    if (this.kind === 'dome') this.label(g, m.label, p, 6 * u);
  }

  drawFrame(scene) {
    const g = this.ctx, { cx, cy, R, dpr } = this;
    g.strokeStyle = 'rgba(138,135,132,0.18)';
    g.lineWidth = dpr;
    for (const alt of [30, 60]) {
      const r = R * Math.tan(((90 - alt) * Math.PI / 180) / 2);
      g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke();
    }
    g.strokeStyle = 'rgba(138,135,132,0.55)';
    g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke();
    g.font = `500 ${11 * dpr}px "JetBrains Mono", monospace`;
    g.fillStyle = 'rgba(185,163,227,0.9)';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const o = R + 11 * dpr;
    g.fillText('N', cx, cy - o);
    g.fillText('S', cx, cy + o);
    g.fillText('E', cx - o, cy);
    g.fillText('W', cx + o, cy);
    g.textAlign = 'start';
  }

  drawGlint(egg) {
    const g = this.ctx, p = this.project(egg.vec), u = this.unit;
    if (!this.inside(p)) return;
    g.globalAlpha = 0.6 * egg.strength;
    g.drawImage(this.glowSprite, p[0] - 7 * u, p[1] - 7 * u, 14 * u, 14 * u);
    g.globalAlpha = 1;
    g.fillStyle = `rgba(255,190,150,${0.9 * egg.strength})`;
    g.beginPath(); g.arc(p[0], p[1], 1.1 * u, 0, TAU); g.fill();
  }
}
