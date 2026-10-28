# data

`stars.bin`: every star in the HYG database v4.1 down to magnitude 6.8 (12,495 stars),
with position, magnitude and B-V colour, quantised into 6 bytes per star. Made with
`tools/make_stars.py` from `hygdata_v41.csv`.
Source: HYG database by David Nash, https://codeberg.org/astronexus/hyg,
licensed CC BY-SA 4.0. This derived file is under the same licence.

`iss.tle`: the ISS orbit as two-line elements from CelesTrak, refreshed daily by
`.github/workflows/iss-orbit.yml`.
