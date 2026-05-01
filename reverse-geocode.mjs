// reverse-geocode.mjs
//
// Notkun:
//   node reverse-geocode.mjs
//
// Les contentful-name-location.json (sömu möppu) og bætir við heimilisfangi
// fyrir hvert hús með því að nota Nominatim (OpenStreetMap, ókeypis).
// Skrifar niðurstöður í akranes-houses-with-address.json.
//
// Mikilvægt: Nominatim leyfir hámark 1 fyrirspurn á sekúndu og krefst
// User-Agent. Skriftið virðir þetta. 256 hús taka u.þ.b. 4–5 mínútur.
// Engar dependencies — bara innbyggt fetch (Node 18+).

import fs from 'node:fs/promises';
import path from 'node:path';

const INPUT = 'contentful-name-location.json';
const OUTPUT = 'akranes-houses-with-address.json';
const CACHE = 'reverse-geocode-cache.json'; // svo þú getir endurræst án þess að missa framfarir

const USER_AGENT = 'Akranes-Hus-Geocoder/1.0 (bippi@bippi.is)';
const NOMINATIM = 'https://nominatim.openstreetmap.org/reverse';
const RATE_LIMIT_MS = 1100; // svolítið yfir 1s til öryggis

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function loadJson(file, fallback) {
  try {
    const txt = await fs.readFile(file, 'utf8');
    return JSON.parse(txt);
  } catch {
    return fallback;
  }
}

async function reverseGeocode(lat, lon) {
  const url = `${NOMINATIM}?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1&accept-language=is`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Nominatim ${res.status} ${res.statusText}`);
  return await res.json();
}

function shapeAddress(nom) {
  if (!nom) return null;
  const a = nom.address || {};
  // Reynum nokkrar leiðir til að mynda mannlesanlegt heimilisfang
  const street =
    a.road || a.street || a.pedestrian || a.residential || a.path || '';
  const number = a.house_number || '';
  const postcode = a.postcode || '';
  const town =
    a.town || a.city || a.village || a.suburb || a.municipality || '';
  const composed = [
    [street, number].filter(Boolean).join(' '),
    [postcode, town].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(', ');
  return {
    display_name: nom.display_name || '',
    composed,
    street,
    house_number: number,
    postcode,
    town,
    osm_type: nom.osm_type,
    osm_id: nom.osm_id,
    raw_address: a,
  };
}

(async () => {
  const houses = await loadJson(INPUT, null);
  if (!houses) {
    console.error(`Vantar ${INPUT}. Keyrðu í sömu möppu.`);
    process.exit(1);
  }
  const cache = await loadJson(CACHE, {});
  const out = [];

  console.log(`Reverse-geocoding ${houses.length} hús...`);
  console.log(
    `(Áætlaður tími: ${((houses.length * RATE_LIMIT_MS) / 60000).toFixed(
      1,
    )} mín)\n`,
  );

  let done = 0,
    hits = 0,
    misses = 0,
    fromCache = 0,
    errors = 0;
  const t0 = Date.now();

  for (const h of houses) {
    const lat = h.location?.lat;
    const lon = h.location?.lon;
    if (typeof lat !== 'number' || typeof lon !== 'number') {
      out.push({ ...h, address: null, error: 'no coordinates' });
      misses++;
      done++;
      continue;
    }
    const key = `${lat.toFixed(6)},${lon.toFixed(6)}`;

    let nom;
    if (cache[key]) {
      nom = cache[key];
      fromCache++;
    } else {
      try {
        nom = await reverseGeocode(lat, lon);
        cache[key] = nom;
        // Vistum cache reglulega svo þú getur stöðvað og endurræst
        if ((hits + errors) % 10 === 0) {
          await fs.writeFile(CACHE, JSON.stringify(cache, null, 2));
        }
        await sleep(RATE_LIMIT_MS);
      } catch (e) {
        errors++;
        done++;
        out.push({ ...h, address: null, error: e.message });
        process.stdout.write(
          `\r${done}/${houses.length}  ${h.name.padEnd(20)} VILLA: ${
            e.message
          }\n`,
        );
        continue;
      }
    }

    const address = shapeAddress(nom);
    if (address && address.composed) hits++;
    else misses++;

    out.push({ ...h, address });
    done++;

    const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
    process.stdout.write(
      `\r${done}/${houses.length}  hits:${hits} miss:${misses} cache:${fromCache} err:${errors}  (${elapsed}s)   `,
    );
  }

  await fs.writeFile(CACHE, JSON.stringify(cache, null, 2));
  await fs.writeFile(OUTPUT, JSON.stringify(out, null, 2));

  console.log(`\n\nKláraði:`);
  console.log(`  Hits (heimilisfang fannst): ${hits}`);
  console.log(`  Miss (ekkert heimilisfang): ${misses}`);
  console.log(`  Frá cache:                  ${fromCache}`);
  console.log(`  Villur:                     ${errors}`);
  console.log(`\nVistaði í ${OUTPUT}`);
  console.log(`Cache í ${CACHE} (má eyða ef þú vilt byrja upp á nýtt)`);
})();
