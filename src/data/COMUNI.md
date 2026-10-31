# Italian comuni

Static list used for comune autocomplete and for the approximate area drawn around each stop.

## Sources

- ISTAT, Codici statistici delle unità amministrative territoriali, elenco dei comuni italiani aggiornato al 21 febbraio 2026.
  Permalink: https://www.istat.it/storage/codici-unita-amministrative/Elenco-comuni-italiani.xlsx
  Page: https://www.istat.it/classificazione/codici-dei-comuni-delle-province-e-delle-regioni/
- ISTAT, Confini delle unità amministrative a fini statistici al 1° gennaio 2026, versione generalizzata.
  File: https://www.istat.it/storage/cartografia/confini_amministrativi/generalizzati/2026/Limiti01012026_g.zip
  Page: https://www.istat.it/notizia/confini-delle-unita-amministrative-a-fini-statistici-al-1-gennaio-2018-2/

## Licence

ISTAT publishes these datasets under [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).
The ISTAT legal notes say the same: https://www.istat.it/note-legali/

Guidocasa contributors: the derived file in this folder.

## What changed from the sources

`comuni.json` is a derived file, not a copy of either download.

- One row per comune in the 21 February 2026 code list: 7,894 comuni.
- Each row is `[istat, name, nameAlt, province, provinceCode, lat, lng, areaKm2]`.
- `name` is the Italian denomination. `nameAlt` is the other official language, or an empty string.
- `province` is the unità territoriale sovracomunale (province or metropolitan city). `provinceCode` is the vehicle registration sigla.
- Coordinates are the geometric centroid of the generalised boundary, transformed from WGS84 / UTM zone 32N to WGS84 longitude and latitude. If that centroid falls outside the boundary, the point is an interior point instead, so the marker still sits on the comune.
- `areaKm2` is the boundary area in square kilometres.
- Castegnero Nanto (ISTAT `024129`) was instituted on 21 February 2026 by merging Castegnero (`024027`) and Nanto (`024071`). It is not in the 1 January boundary file. Its point and area are the union of those two comuni.
- Lirio (`018082`) is in the 1 January boundary file and not in the 21 February code list, so it is omitted.

Regenerate with `python3 scripts/build-comuni.py`. That script needs `pyshp`, `shapely`, `pyproj` and `openpyxl`.

The map circle is not stored in this file. `src/lib/comuni/radius.ts` turns `areaKm2` into the radius of a circle with the same area, clamped between 1.5 km and 20 km, and that radius is saved on the trip listing.
