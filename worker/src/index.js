// motamedy-api: a small Cloudflare Worker behind motamedy.github.io.
//   POST /shannon                 record one round of the guessing game
//   GET  /shannon/stats           how many guesses letters took, across everyone
//   GET  /flights/:lat/:lon/:nm   aircraft near a point (ADSB.lol, cached 10 s)
//   GET  /tle                     the ISS orbit from CelesTrak (cached 6 h)

const WORDS = new Set([
  'student', 'anything', 'computer', 'related', 'mostly', 'robotics', 'before', 'architecture',
  'still', 'enjoy', 'outside', 'spending', 'time', 'friends', 'debate', 'looking', 'long', 'wrote',
  'problems', 'semester', 'introduced', 'object', 'oriented', 'programming', 'step', 'part', 'liked',
  'most', 'designing', 'figuring', 'explain', 'things',
]);

function cors(request, env) {
  const origin = request.headers.get('origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim());
  return {
    'access-control-allow-origin': allowed.includes(origin) ? origin : allowed[0] || '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
}

const json = (data, status, headers) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json', ...headers },
});

async function cached(ctx, key, ttl, make) {
  const cache = caches.default, req = new Request('https://cache.local/' + key);
  const hit = await cache.match(req);
  if (hit) return hit.text();
  const body = await make();
  ctx.waitUntil(cache.put(req, new Response(body, { headers: { 'cache-control': `max-age=${ttl}` } })));
  return body;
}

async function record(request, env, h) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400, h); }
  const { word, guesses } = body || {};
  if (!WORDS.has(word) || !Array.isArray(guesses) || guesses.length !== word.length
      || !guesses.every((n) => Number.isInteger(n) && n >= 1 && n <= 26)) {
    return json({ error: 'not a valid round' }, 400, h);
  }
  const stmts = [env.DB.prepare('INSERT INTO rounds (ts, word, guesses) VALUES (?, ?, ?)')
    .bind(Date.now(), word, guesses.join(','))];
  for (const n of guesses) {
    stmts.push(env.DB.prepare('INSERT INTO hist (n, count) VALUES (?, 1) ON CONFLICT(n) DO UPDATE SET count = count + 1').bind(n));
  }
  await env.DB.batch(stmts);
  return json({ ok: true }, 200, h);
}

async function stats(env, h) {
  const [rows, rounds] = await env.DB.batch([
    env.DB.prepare('SELECT n, count FROM hist'),
    env.DB.prepare('SELECT COUNT(*) AS c FROM rounds'),
  ]);
  const hist = {};
  for (const r of rows.results) hist[r.n] = r.count;
  return json({ rounds: rounds.results[0].c, hist }, 200, { ...h, 'cache-control': 'max-age=30' });
}

async function flights(params, ctx, h) {
  const [lat, lon, nm] = params.map(Number);
  if (![lat, lon, nm].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || nm <= 0 || nm > 250) {
    return json({ error: 'bad point' }, 400, h);
  }
  const key = `flights/${lat.toFixed(2)}/${lon.toFixed(2)}/${Math.round(nm)}`;
  const body = await cached(ctx, key, 10, async () => {
    const res = await fetch(`https://api.adsb.lol/v2/point/${lat}/${lon}/${nm}`, { headers: { 'user-agent': 'motamedy.github.io sky' } });
    if (!res.ok) throw new Error('upstream ' + res.status);
    const data = await res.json();
    const ac = (data.ac || []).map((p) => ({
      hex: p.hex, flight: p.flight, r: p.r, t: p.t, lat: p.lat, lon: p.lon,
      alt_baro: p.alt_baro, alt_geom: p.alt_geom, gs: p.gs, track: p.track, seen_pos: p.seen_pos,
    }));
    return JSON.stringify({ ac, now: data.now });
  });
  return new Response(body, { headers: { 'content-type': 'application/json', ...h } });
}

async function tle(ctx, h) {
  const body = await cached(ctx, 'tle-iss', 21600, async () => {
    const res = await fetch('https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE');
    if (!res.ok) throw new Error('upstream ' + res.status);
    return res.text();
  });
  return new Response(body, { headers: { 'content-type': 'text/plain', ...h } });
}

export default {
  async fetch(request, env, ctx) {
    const h = cors(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    const path = new URL(request.url).pathname.replace(/\/+$/, '');
    try {
      if (path === '/shannon' && request.method === 'POST') return await record(request, env, h);
      if (path === '/shannon/stats') return await stats(env, h);
      if (path.startsWith('/flights/')) return await flights(path.split('/').slice(2), ctx, h);
      if (path === '/tle') return await tle(ctx, h);
      return json({ error: 'not found' }, 404, h);
    } catch (err) {
      return json({ error: String(err.message || err) }, 502, h);
    }
  },
};
