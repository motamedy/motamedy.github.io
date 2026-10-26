const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (sel) => document.querySelector(sel);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Line under the name: types a phrase, waits, deletes it, next one.
const phrases = [
  'computer science student',
  'into NLP and robotics',
  'still in love with computer architecture',
  'TA, Advanced Programming',
  'probably looking at the sky',
  'listening to Radiohead',
];
const typed = $('#typed');
async function typeLoop() {
  for (let i = 0; ; i = (i + 1) % phrases.length) {
    const t = phrases[i];
    for (let n = typed.textContent.length; n <= t.length; n++) {
      typed.textContent = t.slice(0, n);
      await sleep(55 + Math.random() * 70);
    }
    await sleep(2200);
    for (let k = t.length; k >= 0; k--) {
      typed.textContent = t.slice(0, k);
      await sleep(28);
    }
    await sleep(400);
  }
}
if (!still && typed) { typed.textContent = ''; typeLoop(); }

// Section headings type themselves in as they scroll into view.
if (!still && 'IntersectionObserver' in window) {
  document.documentElement.classList.add('js');
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      const h = e.target.querySelector('h2'), text = h.dataset.type;
      h.textContent = '';
      const cur = document.createElement('span');
      cur.className = 'cursor';
      h.append(cur);
      let i = 0;
      const step = () => {
        if (i < text.length) {
          cur.before(text[i++]);
          setTimeout(step, 45 + Math.random() * 50);
        } else {
          e.target.classList.add('shown');
          setTimeout(() => cur.remove(), 1200);
        }
      };
      step();
    }
  }, { threshold: 0.15 });
  document.querySelectorAll('section').forEach((s) => io.observe(s));
}

// Starfield: a few hundred slow, twinkling dots that drift a little with the mouse.
function starfield(c) {
  const ctx = c.getContext('2d');
  let stars = [], mx = 0, my = 0, ox = 0, oy = 0, w, h, dpr;
  function resize() {
    dpr = window.devicePixelRatio || 1;
    w = c.width = innerWidth * dpr;
    h = c.height = innerHeight * dpr;
    const count = Math.round(innerWidth * innerHeight / 9000);
    stars = [];
    for (let i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * w, y: Math.random() * h,
        r: (Math.random() * 1.1 + 0.2) * dpr,
        z: Math.random() * 0.8 + 0.2,
        a: Math.random() * Math.PI * 2,
        s: Math.random() * 0.015 + 0.004,
        tint: Math.random() < 0.15 ? '185,163,227' : Math.random() < 0.1 ? '232,220,191' : '230,230,230',
      });
    }
  }
  function draw() {
    ox += (mx - ox) * 0.05; oy += (my - oy) * 0.05;
    ctx.clearRect(0, 0, w, h);
    for (const s of stars) {
      if (!still) { s.a += s.s; s.y -= s.z * 0.06 * dpr; if (s.y < 0) s.y += h; }
      const alpha = 0.25 + 0.45 * (0.5 + 0.5 * Math.sin(s.a)) * s.z;
      const x = (s.x + ox * s.z * 14 * dpr + w) % w;
      const y = (s.y + oy * s.z * 14 * dpr + h) % h;
      ctx.fillStyle = `rgba(${s.tint},${alpha})`;
      ctx.beginPath(); ctx.arc(x, y, s.r, 0, 6.283); ctx.fill();
    }
    if (!still) requestAnimationFrame(draw);
  }
  addEventListener('resize', () => { resize(); if (still) draw(); });
  addEventListener('mousemove', (e) => { mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5; });
  resize();
  draw();
}
starfield($('#sky'));
