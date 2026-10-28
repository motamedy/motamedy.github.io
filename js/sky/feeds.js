// Live inputs: weather and air quality from Open-Meteo.
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
