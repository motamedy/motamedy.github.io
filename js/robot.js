// A differential-drive robot, seen from above, chasing the pointer. The heading is
// controlled by a PID loop; the motors lag behind their commands, which is what
// makes a high P wobble and D worth having.

const TAU = Math.PI * 2;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function startRobot(canvas) {
  if (!canvas) return;
  const g = canvas.getContext('2d');
  const gains = {};
  for (const k of ['kp', 'ki', 'kd']) {
    const el = document.getElementById(k), out = el.nextElementSibling;
    const set = () => { gains[k] = +el.value; out.textContent = (+el.value).toFixed(k === 'kp' ? 1 : 2); };
    el.addEventListener('input', set);
    set();
  }

  let w = 0, h = 0, dpr = 1;
  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = w = Math.round(r.width * dpr);
    canvas.height = h = Math.round(r.height * dpr);
  }
  resize();
  addEventListener('resize', resize);

  const bot = { x: w * 0.3, y: h * 0.5, th: 0, v: 0, om: 0 };
  const target = { x: w * 0.7, y: h * 0.45 };
  let integral = 0, lastErr = 0, dErr = 0;
  const trail = [], errors = [];

  const aim = (e) => {
    const r = canvas.getBoundingClientRect();
    target.x = (e.clientX - r.left) * dpr;
    target.y = (e.clientY - r.top) * dpr;
  };
  canvas.addEventListener('pointermove', aim);
  canvas.addEventListener('pointerdown', aim);

  function step(dt) {
    const dx = target.x - bot.x, dy = target.y - bot.y, dist = Math.hypot(dx, dy);
    const err = dist > 4 * dpr ? wrap(Math.atan2(dy, dx) - bot.th) : 0;
    integral = Math.max(-2, Math.min(2, integral + err * dt));
    dErr += ((err - lastErr) / dt - dErr) * 0.3;          // a little filtering, like real sensors need
    lastErr = err;
    const omCmd = Math.max(-7, Math.min(7, gains.kp * err + gains.ki * integral + gains.kd * dErr));
    const vCmd = Math.min(170 * dpr, Math.max(0, 2.2 * dist * Math.cos(err)));
    const tau = 0.22;                                       // motor time constant, seconds
    bot.om += (omCmd - bot.om) * Math.min(1, dt / tau);
    bot.v += (vCmd - bot.v) * Math.min(1, dt / tau);
    bot.th = wrap(bot.th + bot.om * dt);
    bot.x = Math.max(0, Math.min(w, bot.x + bot.v * Math.cos(bot.th) * dt));
    bot.y = Math.max(0, Math.min(h, bot.y + bot.v * Math.sin(bot.th) * dt));
    trail.push([bot.x, bot.y]);
    if (trail.length > 240) trail.shift();
    errors.push(err);
    if (errors.length > 300) errors.shift();
  }

  function draw() {
    g.clearRect(0, 0, w, h);
    // heading error over the last few seconds, along the bottom
    const base = h - 22 * dpr;
    g.strokeStyle = '#2a2a2a'; g.lineWidth = dpr;
    g.beginPath(); g.moveTo(0, base); g.lineTo(w, base); g.stroke();
    g.strokeStyle = 'rgba(185,163,227,.55)';
    g.beginPath();
    errors.forEach((e, i) => {
      const x = (i / 300) * w, y = base - (e / Math.PI) * 16 * dpr;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    });
    g.stroke();
    g.fillStyle = '#5a5662';
    g.font = `${10 * dpr}px "JetBrains Mono", monospace`;
    g.fillText('heading error', 6 * dpr, h - 6 * dpr);

    g.strokeStyle = 'rgba(232,220,191,.18)';
    g.beginPath();
    trail.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();

    g.strokeStyle = 'rgba(232,220,191,.6)';
    g.beginPath(); g.arc(target.x, target.y, 6 * dpr, 0, TAU); g.stroke();
    g.beginPath(); g.moveTo(target.x - 10 * dpr, target.y); g.lineTo(target.x + 10 * dpr, target.y);
    g.moveTo(target.x, target.y - 10 * dpr); g.lineTo(target.x, target.y + 10 * dpr); g.stroke();

    // the robot: chassis, two wheels, a caster, and an arrow for where it's facing
    const s = dpr;
    g.save();
    g.translate(bot.x, bot.y);
    g.rotate(bot.th);
    g.fillStyle = '#2b2b30'; g.strokeStyle = '#4a4552'; g.lineWidth = s;
    g.beginPath(); g.roundRect(-16 * s, -13 * s, 32 * s, 26 * s, 5 * s); g.fill(); g.stroke();
    g.fillStyle = '#111';
    g.fillRect(-7 * s, -17 * s, 14 * s, 4 * s);
    g.fillRect(-7 * s, 13 * s, 14 * s, 4 * s);
    g.fillStyle = '#3a3a3a';
    g.beginPath(); g.arc(-12 * s, 0, 2.2 * s, 0, TAU); g.fill();
    g.fillStyle = '#b9a3e3';
    g.beginPath(); g.moveTo(14 * s, 0); g.lineTo(7 * s, -5 * s); g.lineTo(7 * s, 5 * s); g.closePath(); g.fill();
    g.restore();
  }

  let visible = false, last = performance.now();
  new IntersectionObserver((es) => { visible = es[0].isIntersecting; }).observe(canvas);
  const tick = (ts) => {
    requestAnimationFrame(tick);
    const dt = Math.min(0.05, (ts - last) / 1000);
    last = ts;
    if (!visible || document.hidden || dt <= 0) return;
    step(dt);
    draw();
  };
  draw();
  requestAnimationFrame(tick);
}
