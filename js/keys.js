// Keyboard navigation in the spirit of less and vi. Unknown keys ring the bell.

import { beep, bellOn, setBell } from './bell.js';

const smooth = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
let echoEl, echoTimer;

export function echo(text) {
  if (!echoEl) return;
  echoEl.textContent = text;
  echoEl.classList.add('show');
  clearTimeout(echoTimer);
  echoTimer = setTimeout(() => echoEl.classList.remove('show'), 1600);
}

const name = (section) => section.querySelector('h2')?.dataset.type || '';

function jump(dir) {
  const sections = [...document.querySelectorAll('section')];
  let target;
  if (dir > 0) target = sections.find((s) => s.getBoundingClientRect().top > 12);
  else target = sections.reverse().find((s) => s.getBoundingClientRect().top < -12);
  if (target) {
    target.scrollIntoView({ behavior: smooth, block: 'start' });
    echo(name(target));
  } else if (dir < 0 && scrollY > 0) {
    scrollTo({ top: 0, behavior: smooth });
    echo('~');
  } else {
    beep();
    echo(dir > 0 ? '(END)' : '(TOP)');
  }
}

export function startKeys({ echoBox, help }) {
  echoEl = echoBox;
  let pendingG = false, gTimer;

  addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    const key = e.key;
    const open = document.querySelector('dialog[open]');
    if (open) {
      if (key === 'q') { open.close(); e.preventDefault(); }
      return;                              // Escape already closes dialogs
    }
    if (key.length !== 1 || key === ' ') return;   // arrows, space, tab: the browser's
    if (pendingG && key !== 'g') pendingG = false;

    switch (key) {
      case 'j': jump(1); break;
      case 'k': jump(-1); break;
      case 'g':
        if (pendingG) {
          pendingG = false;
          scrollTo({ top: 0, behavior: smooth });
          echo('gg');
        } else {
          pendingG = true;
          clearTimeout(gTimer);
          gTimer = setTimeout(() => { pendingG = false; }, 900);
          echo('g');
        }
        break;
      case 'G':
        scrollTo({ top: document.documentElement.scrollHeight, behavior: smooth });
        echo('G');
        break;
      case '?':
        help?.showModal?.();
        break;
      case 'b':
        setBell(!bellOn());
        echo(bellOn() ? 'bell on' : 'bell off (visual bell)');
        if (bellOn()) beep();
        break;
      default:
        beep();
        echo(`${key}: not a key here (? for help)`);
        return;
    }
    e.preventDefault();
  });
}
