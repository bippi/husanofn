// contentful-archived.mjs
//
// Skoða og endurheimta archived efni á Contentful.
//
// Notkun:
//   node contentful-archived.mjs list                # listar allar archived færslur
//   node contentful-archived.mjs list-assets         # listar archived assets (myndir/skrár)
//   node contentful-archived.mjs unarchive <ENTRY_ID> # unarchive eina færslu
//   node contentful-archived.mjs unarchive-all       # unarchive ALLAR archived færslur (spyr fyrst)
//   node contentful-archived.mjs export              # vistar allar archived færslur í archived-export.json
//
// Engar dependencies — notar bara innbyggt fetch (Node 18+).

const CMA_TOKEN =
  process.env.CF_CMA_TOKEN ||
  'CFPAT-MjKtpby_fyQvOk5e1oLKUyYpU5D9dQ_ertyLPdbu_Bo';
const SPACE_ID = process.env.CF_SPACE_ID || '8uvjmwzljnes';
const ENVIRONMENT_ID = process.env.CF_ENVIRONMENT_ID || 'master';

const BASE = `https://api.contentful.com/spaces/${SPACE_ID}/environments/${ENVIRONMENT_ID}`;
const HEADERS = {
  Authorization: `Bearer ${CMA_TOKEN}`,
  'Content-Type': 'application/vnd.contentful.management.v1+json',
};

async function cf(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { ...HEADERS, ...(opts.headers || {}) },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = text;
  }
  if (!res.ok) {
    throw new Error(
      `Contentful ${res.status} ${res.statusText} on ${path}\n${typeof body === 'string' ? body : JSON.stringify(body, null, 2)}`,
    );
  }
  return body;
}

async function fetchAllArchived(kind /* "entries" | "assets" */) {
  const all = [];
  let skip = 0;
  const limit = 100;
  while (true) {
    const qs = new URLSearchParams({
      'sys.archivedAt[exists]': 'true',
      limit: String(limit),
      skip: String(skip),
      order: 'sys.archivedAt',
    });
    const data = await cf(`/${kind}?${qs}`);
    all.push(...(data.items || []));
    if (!data.items || data.items.length < limit) break;
    skip += limit;
  }
  return all;
}

function summarize(item) {
  const id = item.sys.id;
  const ct = item.sys.contentType?.sys?.id || '(asset)';
  const archivedAt = item.sys.archivedAt;
  // Reyna að finna eitthvað mannlesanlegt nafn
  const fields = item.fields || {};
  const firstStringField = Object.entries(fields).find(([, v]) => {
    const val = v && (v['en-US'] ?? v['is-IS'] ?? Object.values(v)[0]);
    return typeof val === 'string';
  });
  let label = '';
  if (firstStringField) {
    const val = firstStringField[1];
    label = val['en-US'] ?? val['is-IS'] ?? Object.values(val)[0];
    label = String(label).slice(0, 60);
  }
  return { id, contentType: ct, archivedAt, label };
}

async function cmdList(kind) {
  const items = await fetchAllArchived(kind);
  if (items.length === 0) {
    console.log(`Engar archived ${kind} fundust.`);
    return;
  }
  console.log(`Fann ${items.length} archived ${kind}:\n`);
  for (const item of items) {
    const s = summarize(item);
    console.log(
      `  ${s.id}  [${s.contentType}]  ${s.archivedAt}  ${s.label ? `— ${s.label}` : ''}`,
    );
  }
}

async function cmdExport() {
  const entries = await fetchAllArchived('entries');
  const assets = await fetchAllArchived('assets');
  const fs = await import('node:fs/promises');
  const path = 'archived-export.json';
  await fs.writeFile(path, JSON.stringify({ entries, assets }, null, 2));
  console.log(
    `Vistaði ${entries.length} entries og ${assets.length} assets í ${path}`,
  );
}

async function unarchiveOne(kind, id) {
  // Fyrst þarf að ná í núverandi version
  const current = await cf(`/${kind}/${id}`);
  const version = current.sys.version;
  await cf(`/${kind}/${id}/archived`, {
    method: 'DELETE',
    headers: { 'X-Contentful-Version': String(version) },
  });
  console.log(`✓ Unarchived ${kind.slice(0, -1)} ${id}`);
}

async function cmdUnarchive(id) {
  // Reynum entries fyrst, svo assets
  try {
    await unarchiveOne('entries', id);
  } catch (e) {
    if (String(e).includes('404')) {
      await unarchiveOne('assets', id);
    } else {
      throw e;
    }
  }
}

async function cmdUnarchiveAll() {
  const entries = await fetchAllArchived('entries');
  const assets = await fetchAllArchived('assets');
  const total = entries.length + assets.length;
  if (total === 0) {
    console.log('Ekkert archived til staðar.');
    return;
  }
  console.log(
    `Mun unarchive ${entries.length} entries og ${assets.length} assets (samtals ${total}).`,
  );
  console.log(
    `Skrifaðu YES og ýttu á Enter til að halda áfram, annað til að hætta.`,
  );
  const answer = await new Promise((resolve) => {
    process.stdin.once('data', (d) => resolve(d.toString().trim()));
  });
  if (answer !== 'YES') {
    console.log('Hætt við.');
    process.exit(0);
  }
  let ok = 0,
    fail = 0;
  for (const e of entries) {
    try {
      await unarchiveOne('entries', e.sys.id);
      ok++;
    } catch (err) {
      console.error(`✗ entry ${e.sys.id}: ${err.message}`);
      fail++;
    }
  }
  for (const a of assets) {
    try {
      await unarchiveOne('assets', a.sys.id);
      ok++;
    } catch (err) {
      console.error(`✗ asset ${a.sys.id}: ${err.message}`);
      fail++;
    }
  }
  console.log(`\nKláraði: ${ok} OK, ${fail} villa.`);
}

const [, , cmd, arg] = process.argv;

(async () => {
  try {
    switch (cmd) {
      case 'list':
        await cmdList('entries');
        break;
      case 'list-assets':
        await cmdList('assets');
        break;
      case 'export':
        await cmdExport();
        break;
      case 'unarchive':
        if (!arg) {
          console.error(
            'Notkun: node contentful-archived.mjs unarchive <ENTRY_ID>',
          );
          process.exit(1);
        }
        await cmdUnarchive(arg);
        break;
      case 'unarchive-all':
        await cmdUnarchiveAll();
        break;
      default:
        console.log(
          'Skipanir: list | list-assets | export | unarchive <id> | unarchive-all',
        );
    }
  } catch (e) {
    console.error('Villa:', e.message);
    process.exit(1);
  }
})();
