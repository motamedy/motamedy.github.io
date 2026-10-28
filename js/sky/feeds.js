// Live inputs: weather and air quality (Open-Meteo), aircraft (ADSB.lol), and the ISS
// orbit (a file a GitHub Action refreshes).
// Every feed fails quietly; the sky still draws without it.

async function getJSON(url, ms = 9000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new Error(res.status + ' ' + url);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function weather(place) {
  const q = `latitude=${place.lat}&longitude=${place.lon}`;
  const [w, a] = await Promise.allSettled([
    getJSON(`https://api.open-meteo.com/v1/forecast?${q}&current=cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,wind_speed_10m,wind_direction_10m`),
    getJSON(`https://air-quality-api.open-meteo.com/v1/air-quality?${q}&current=pm2_5,pm10,aerosol_optical_depth,dust,us_aqi`),
  ]);
  const cw = w.status === 'fulfilled' ? w.value.current : null;
  const ca = a.status === 'fulfilled' ? a.value.current : null;
  return {
    clouds: cw && {
      total: cw.cloud_cover / 100, low: cw.cloud_cover_low / 100,
      mid: cw.cloud_cover_mid / 100, high: cw.cloud_cover_high / 100,
      windSpeed: cw.wind_speed_10m, windFrom: cw.wind_direction_10m,
    },
    air: ca && {
      pm25: ca.pm2_5, pm10: ca.pm10, aod: ca.aerosol_optical_depth, dust: ca.dust, aqi: ca.us_aqi,
    },
    at: Date.now(),
  };
}

// Aircraft within `nm` nautical miles. ADSB.lol is a volunteer network: over Iran it
// may see few planes, or none.
export async function aircraft(place, nm = 160) {
  const path = `${place.lat.toFixed(3)}/${place.lon.toFixed(3)}/${nm}`;
  const url = `https://api.adsb.lol/v2/point/${path}`;
  const data = await getJSON(url, 8000);
  const now = Date.now();
  return (data.ac || [])
    .filter((p) => p.lat != null && p.lon != null && typeof p.alt_baro === 'number')
    .map((p) => ({
      id: p.hex, call: (p.flight || '').trim() || p.r || p.hex, type: p.t || '',
      lat: p.lat, lon: p.lon, altFt: p.alt_geom ?? p.alt_baro,
      gs: p.gs || 0, track: p.track ?? p.true_heading ?? 0, at: now - (p.seen_pos || 0) * 1000,
    }));
}

// Two-line orbital elements for the ISS. The same-origin file is the reliable path;
// the others are fallbacks for when it is missing or stale.
export async function issTle() {
  try {
    const res = await fetch('data/iss.tle', { cache: 'no-cache' });
    if (res.ok) {
      const lines = (await res.text()).trim().split(/\r?\n/).filter((l) => /^[12] /.test(l));
      if (lines.length >= 2 && tleAgeDays(lines[0]) < 4) return lines.slice(0, 2);
    }
  } catch { /* fall through */ }
  const j = await getJSON('https://api.wheretheiss.at/v1/satellites/25544/tles');
  return [j.line1, j.line2];
}

// TLE epochs are "YYDDD.ddddd" in columns 19-32 of line 1.
export function tleAgeDays(line1) {
  const yy = +line1.slice(18, 20), day = +line1.slice(20, 32);
  const epoch = Date.UTC(yy < 57 ? 2000 + yy : 1900 + yy, 0, 1) + (day - 1) * 86400000;
  return (Date.now() - epoch) / 86400000;
}
