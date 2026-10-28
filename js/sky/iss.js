// The International Space Station: SGP4 orbit propagation (satellite.js), sunlight,
// and the next passes over a place. You see it only when it is in sunlight while
// your own sky is dark, a short window after sunset or before sunrise.

import { DEG, RAD, sun, horizonMatrix, apply, altAzToVec } from './astro.js';

let lib;
function loadLib() {
  lib ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'vendor/satellite.min.js';
    s.onload = () => resolve(window.satellite);
    s.onerror = () => reject(new Error('satellite.js failed to load'));
    document.head.appendChild(s);
  });
  return lib;
}

const EARTH_R = 6378;

export async function makeIss(tle) {
  const sat = await loadLib();
  const rec = sat.twoline2satrec(tle[0], tle[1]);

  function look(place, ms) {
    const d = new Date(ms);
    const pv = sat.propagate(rec, d);
    if (!pv || !pv.position) return null;
    const ecf = sat.eciToEcf(pv.position, sat.gstime(d));
    const la = sat.ecfToLookAngles({ latitude: place.lat * DEG, longitude: place.lon * DEG, height: place.elev / 1000 }, ecf);
    const p = pv.position, s = sun(ms).vec;
    const along = p.x * s[0] + p.y * s[1] + p.z * s[2];
    const off = Math.hypot(p.x - along * s[0], p.y - along * s[1], p.z - along * s[2]);
    const alt = la.elevation * RAD, az = ((la.azimuth * RAD) % 360 + 360) % 360;
    return { alt, az, vec: altAzToVec(alt, az), range: la.rangeSat, sunlit: along > 0 || off > EARTH_R };
  }

  function sunAlt(place, ms) {
    return Math.asin(apply(horizonMatrix(ms, place.lat, place.lon), sun(ms).vec)[2]) * RAD;
  }

  // Passes above 10 degrees in the next `hours`; `visible` when it is sunlit against a dark sky.
  function passes(place, from, hours = 72) {
    const out = [], step = 20000;
    let cur = null;
    for (let t = from; t < from + hours * 3600000; t += step) {
      const l = look(place, t);
      if (!l) break;
      if (l.alt > 10) {
        if (!cur) cur = { start: t, startAz: l.az, maxAlt: 0, visible: false };
        if (l.alt > cur.maxAlt) { cur.maxAlt = l.alt; cur.maxAt = t; }
        if (l.sunlit && sunAlt(place, t) < -6) {
          cur.visible = true;
          cur.visStart ??= t;
          cur.visStartAz ??= l.az;
        }
        cur.end = t; cur.endAz = l.az;
      } else if (cur) {
        out.push(cur);
        cur = null;
      }
    }
    return out;
  }

  return { look, passes, epochAgeDays: (Date.now() - (rec.jdsatepoch - 2440587.5) * 86400000) / 86400000 };
}
