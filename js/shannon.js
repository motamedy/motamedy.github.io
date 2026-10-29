// Shannon's guessing game (1951): guess a hidden word one letter at a time, given the
// sentence before it. How many tries each letter takes says how much information it
// carried. Every round goes to the Worker, so the page keeps a record across visitors.

import { beep } from './bell.js';
import { API_BASE } from './config.js';

// Sentences from this page, and the words in them a reader could actually guess:
// no names, places or numbers.
const SENTENCES = [
  ["I'm a Computer Science student at Ferdowsi University of Mashhad.", ['student']],
  ['I like anything computer related.', ['anything', 'computer', 'related']],
  ["Right now I'm mostly into NLP and robotics.", ['mostly', 'robotics']],
  ['Before that it was computer architecture, which I still enjoy.', ['before', 'architecture', 'still', 'enjoy']],
  ['Outside of that I like spending time with friends, a good debate, looking at the sky for too long, and Mac Miller and Radiohead.',
    ['outside', 'spending', 'time', 'friends', 'debate', 'looking', 'long']],
  ['I wrote the problems and a semester problem set that introduced object-oriented programming a step at a time.',
    ['wrote', 'problems', 'semester', 'introduced', 'object', 'oriented', 'programming', 'step']],
  ['The part I liked most was designing problems and figuring out how to explain things.',
    ['part', 'liked', 'most', 'designing', 'figuring', 'explain', 'things']],
];
export const WORDS = [...new Set(SENTENCES.flatMap(([, w]) => w))];

// Shannon's bounds on entropy per letter from how often the 1st, 2nd, ... guess was right.
// They assume the 1st guess is right more often than the 2nd, and so on; with few letters
// that isn't true yet, so the frequencies are put in that order first.
export function bounds(hist) {
  const total = hist.reduce((a, b) => a + b, 0);
  if (!total) return null;
  const first = hist[1] / total;
  const q = [0, ...hist.slice(1).map((c) => c / total).sort((a, b) => b - a)];
  let upper = 0, lower = 0;
  for (let i = 1; i < q.length; i++) {
    if (q[i] > 0) upper -= q[i] * Math.log2(q[i]);
    lower += i * (q[i] - (q[i + 1] || 0)) * Math.log2(i);
  }
  return { upper, lower, letters: total, first };
}

const load = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};
const save = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* fine */ }
};

export function startShannon(root) {
  if (!root) return;
  const line = root.querySelector('#g-line'), tried = root.querySelector('#g-tried');
  const status = root.querySelector('#g-status'), stats = root.querySelector('#g-stats');
  const input = root.querySelector('#g-input'), next = root.querySelector('#g-next');

  let mine = load('shannon-mine', new Array(27).fill(0));
  let everyone = null;
  let round, lastPick = -1;

  function newRound() {
    const pairs = SENTENCES.flatMap(([s, words], si) => words.map((w) => [si, w]));
    let pick;
    do pick = Math.floor(Math.random() * pairs.length); while (pick === lastPick && pairs.length > 1);
    lastPick = pick;
    const [si, word] = pairs[pick], sentence = SENTENCES[si][0];
    const at = sentence.toLowerCase().search(new RegExp(`\\b${word}\\b`));
    round = {
      word, pos: 0, wrong: new Set(), counts: [],
      before: sentence.slice(0, at), after: sentence.slice(at + word.length),
    };
    draw();
    status.textContent = document.activeElement === input ? 'type the next letter' : 'click here and type a letter';
  }

  function draw() {
    const done = round.pos >= round.word.length;
    const slots = [...round.word].map((ch, i) => {
      const s = document.createElement('span');
      s.className = 'slot' + (i < round.pos ? ' done' : i === round.pos ? ' now' : '');
      s.textContent = i < round.pos ? ch : ' ';
      return s;
    });
    const before = document.createElement('span'), after = document.createElement('span');
    before.className = 'ctx'; before.textContent = round.before;
    after.className = 'rest'; after.textContent = done ? round.after : ' …';
    line.replaceChildren(before, ...slots, after);
    tried.textContent = [...round.wrong].join(' ');
  }

  function guess(ch) {
    if (round.pos >= round.word.length) return;
    if (ch === round.word[round.pos]) {
      round.counts.push(round.wrong.size + 1);
      round.pos++;
      round.wrong.clear();
      if (round.pos === round.word.length) finish();
      else status.textContent = round.counts.at(-1) === 1 ? 'first try' : `got it in ${round.counts.at(-1)}`;
    } else if (!round.wrong.has(ch)) {
      round.wrong.add(ch);
      beep(660, 90);
      status.textContent = 'no';
    } else {
      status.textContent = `already tried ${ch}`;
    }
    draw();
  }

  function finish() {
    for (const c of round.counts) mine[Math.min(c, 26)]++;
    save('shannon-mine', mine);
    const total = round.counts.reduce((a, b) => a + b, 0);
    status.textContent = `${round.word}: ${round.counts.join(' · ')} guesses, ${total} in all. Enter for the next word.`;
    send({ word: round.word, guesses: round.counts });
    showStats();
  }

  function showStats() {
    const fmt = (b) => `${b.lower.toFixed(2)} to ${b.upper.toFixed(2)} bits per letter`;
    const parts = [];
    const m = bounds(mine);
    if (m) parts.push(`<b>you</b>: ${m.letters} letters, ${Math.round(m.first * 100)}% on the first try, about ${fmt(m)}`);
    if (everyone) {
      const e = bounds(everyone.hist);
      if (e) parts.push(`<b>everyone</b>: ${e.letters} letters in ${everyone.rounds} words, about ${fmt(e)}`);
    }
    parts.push('Shannon found 0.6 to 1.3 bits per letter with a long context. Random letters would be 4.7.');
    stats.innerHTML = parts.join('<br>');
  }

  // Rounds wait in a queue until the Worker accepts them.
  let queue = load('shannon-queue', []);
  async function send(item) {
    if (!API_BASE) return;
    if (item) { queue.push(item); queue = queue.slice(-50); save('shannon-queue', queue); }
    while (queue.length) {
      try {
        const res = await fetch(`${API_BASE}/shannon`, {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(queue[0]),
        });
        if (!res.ok && res.status !== 400) break;
      } catch { break; }
      queue.shift();
      save('shannon-queue', queue);
    }
    await pull();
  }
  async function pull() {
    if (!API_BASE) return;
    try {
      const res = await fetch(`${API_BASE}/shannon/stats`);
      if (!res.ok) return;
      const data = await res.json();
      const hist = new Array(27).fill(0);
      for (const [n, c] of Object.entries(data.hist || {})) if (n >= 1 && n <= 26) hist[n] = Number(c) || 0;
      everyone = { hist, rounds: Number(data.rounds) || 0 };
      showStats();
    } catch { /* offline: local stats only */ }
  }

  root.addEventListener('click', (e) => { if (e.target !== next) input.focus(); });
  input.addEventListener('focus', () => { root.classList.add('focused'); status.textContent = 'type the next letter'; });
  input.addEventListener('blur', () => root.classList.remove('focused'));
  input.addEventListener('input', () => {
    const ch = input.value.slice(-1).toLowerCase();
    input.value = '';
    if (/^[a-z]$/.test(ch)) guess(ch);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); newRound(); }
    if (e.key === 'Escape') input.blur();
  });
  next.addEventListener('click', () => { newRound(); input.focus(); });

  newRound();
  showStats();
  if (queue.length) send(); else pull();
}
