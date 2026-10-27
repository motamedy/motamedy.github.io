// The terminal bell (BEL, ASCII 7): a short square-wave beep like a PC speaker.
// With the bell off, the screen flashes instead, like a terminal's visual bell.

let ctx = null;
let on = true;
try { on = localStorage.getItem('bell') !== 'off'; } catch { /* private mode */ }

export const bellOn = () => on;

export function setBell(value) {
  on = value;
  try { localStorage.setItem('bell', value ? 'on' : 'off'); } catch { /* fine */ }
}

export function beep(freq = 880, ms = 110) {
  if (!on) return flash();
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    const t = ctx.currentTime, end = t + ms / 1000;
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.05, t + 0.005);
    gain.gain.setValueAtTime(0.05, end - 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(end + 0.02);
  } catch {
    flash();
  }
}

function flash() {
  const root = document.documentElement;
  root.classList.add('vbell');
  setTimeout(() => root.classList.remove('vbell'), 110);
}
