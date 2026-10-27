# Converts the HYG v4.1 CSV into the compact binary the page loads (data/stars.bin).
# Usage: python3 tools/make_stars.py hygdata_v41.csv data/stars.bin 6.8
# Layout (little-endian): "STAR", u8 version, 3 pad bytes, u32 count,
# then u16 ra[n] (0..24h), i16 dec[n] (-90..90 deg), u8 mag[n] ((mag+2)*10), u8 bv[n] ((B-V+0.5)*50).
import csv, struct, sys
src, dst, limit = sys.argv[1], sys.argv[2], float(sys.argv[3])
stars = []
for r in csv.DictReader(open(src)):
    if r['id'] == '0' or not r['mag']:
        continue
    m = float(r['mag'])
    if m > limit:
        continue
    ci = float(r['ci']) if r['ci'] else 0.6
    stars.append((m, float(r['ra']), float(r['dec']), ci))
stars.sort()
n = len(stars)
clamp = lambda v, lo, hi: max(lo, min(hi, v))
ra = [clamp(round(s[1] / 24 * 65535), 0, 65535) for s in stars]
de = [clamp(round(s[2] / 90 * 32767), -32767, 32767) for s in stars]
mg = [clamp(round((s[0] + 2) * 10), 0, 255) for s in stars]
bv = [clamp(round((s[3] + 0.5) * 50), 0, 255) for s in stars]
with open(dst, 'wb') as f:
    f.write(b'STAR' + bytes([1, 0, 0, 0]) + struct.pack('<I', n))
    f.write(struct.pack('<%dH' % n, *ra))
    f.write(struct.pack('<%dh' % n, *de))
    f.write(bytes(mg))
    f.write(bytes(bv))
print(n, 'stars written to', dst)
