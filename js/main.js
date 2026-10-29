import { beep } from './bell.js';
import { startKeys, echo } from './keys.js';
import { startSky } from './sky/index.js';
import { startShannon } from './shannon.js';

const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (sel) => document.querySelector(sel);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The Orange Pi: red while the page comes up, then the green heartbeat of Linux's LED
// trigger. It doesn't wait for every file to load, only for the page to be usable.
const born = performance.now();
setTimeout(() => {
  $('#pi-led')?.classList.add('ok');
  const status = $('#pi-status');
  const uptime = () => {
    const s = Math.floor((performance.now() - born) / 1000);
    status.textContent = `up ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  uptime();
  setInterval(uptime, 1000);
}, 900);
$('#pi')?.addEventListener('click', () => { beep(1000, 140); echo('POST: one beep, all good'); });

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

// "Mobin": a small light that follows the pointer and lights up the letters under it.
const mobin = $('#mobin');
if (mobin) {
  const aim = (e) => {
    const r = mobin.getBoundingClientRect();
    mobin.style.setProperty('--x', `${e.clientX - r.left}px`);
    mobin.style.setProperty('--y', `${e.clientY - r.top}px`);
  };
  mobin.addEventListener('pointerenter', (e) => { aim(e); mobin.classList.add('lit'); });
  mobin.addEventListener('pointermove', aim);
  mobin.addEventListener('pointerleave', () => mobin.classList.remove('lit'));
}

// "Linux", and the truth typed out above it.
for (const tip of document.querySelectorAll('.tip')) {
  const bubble = document.createElement('span');
  bubble.className = 'bubble';
  bubble.setAttribute('role', 'tooltip');
  tip.append(bubble);
  let timer;
  const show = () => {
    clearTimeout(timer);
    const text = tip.dataset.tip;
    tip.classList.add('open');
    if (still) { bubble.textContent = text; return; }
    let i = 0;
    const step = () => {
      bubble.textContent = text.slice(0, ++i);
      if (i < text.length) timer = setTimeout(step, 60 + Math.random() * 70);
    };
    bubble.textContent = '';
    timer = setTimeout(step, 120);
  };
  const hide = () => { clearTimeout(timer); tip.classList.remove('open'); };
  tip.addEventListener('pointerenter', show);
  tip.addEventListener('pointerleave', hide);
  tip.addEventListener('focus', show);
  tip.addEventListener('blur', hide);
}

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

startKeys({ echoBox: $('#echo'), help: $('#keys-help') });
startSky({
  background: $('#sky'),
  dome: $('#dome'),
  stats: $('#sky-stats'),
  buttons: [...document.querySelectorAll('.sky-modes button')],
  card: $('#egg-card'),
});
startShannon($('#game'));
