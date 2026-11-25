// Membekukan hasil klasifikasi AI untuk 15 keluhan seed ke data/seed-ai.json.
//
// Jalankan dari direktori app/:
//   npm run seed:ai
//
// Skrip memanggil classifyComplaint() dari src/lib/ai.ts satu per satu
// (berurutan, dengan jeda) supaya tidak menabrak rate limit penyedia. Hasilnya
// beku di data/seed-ai.json sehingga seeding berikutnya deterministik dan tidak
// memanggil AI lagi. Bila key tidak ada atau satu keluhan gagal, skrip berhenti
// dengan exit 1 dan tidak menulis file setengah jadi.

import fs from 'node:fs';
import path from 'node:path';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

// Node mewajibkan ekstensi eksplisit untuk impor ESM, sedangkan modul aplikasi
// memakai impor tanpa ekstensi (gaya bundler Next.js). Hook ini hanya
// melengkapi specifier relatif tanpa ekstensi dengan `.ts`.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      specifier.startsWith('.') &&
      path.extname(specifier) === '' &&
      context.parentURL?.startsWith('file:')
    ) {
      const candidate = new URL(`${specifier}.ts`, context.parentURL);
      if (fs.existsSync(fileURLToPath(candidate))) {
        return nextResolve(candidate.href, context);
      }
    }
    return nextResolve(specifier, context);
  },
});

const { SEED_COMPLAINTS, seedComplaintId } = await import('../src/lib/seed-data.ts');
const { classifyComplaint, getAiConfig } = await import('../src/lib/ai.ts');

const DATA_DIR = path.join(process.cwd(), 'data');
const OUTPUT_FILE = path.join(DATA_DIR, 'seed-ai.json');
const DELAY_MS = 1200;
const TEXT_WIDTH = 50;
const REASON_WIDTH = 60;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function truncate(text, width) {
  const value = String(text).replace(/\s+/g, ' ').trim();
  if (value.length <= width) return value;
  return `${value.slice(0, width - 1)}…`;
}

function pad(text, width) {
  const value = truncate(text, width);
  return value + ' '.repeat(Math.max(0, width - value.length));
}

function printTable(rows) {
  const header =
    `${pad('#', 3)}  ` +
    `${pad('Teks keluhan', TEXT_WIDTH)}  ` +
    `${pad('Kategori', 16)}  ` +
    `${pad('Conf', 5)}  ` +
    `${pad('Alasan', REASON_WIDTH)}`;
  const separator = '-'.repeat(header.length);

  console.log(`\n${separator}`);
  console.log(header);
  console.log(separator);
  for (const row of rows) {
    console.log(
      `${pad(row.index, 3)}  ` +
        `${pad(row.text, TEXT_WIDTH)}  ` +
        `${pad(row.category, 16)}  ` +
        `${pad(row.confidence, 5)}  ` +
        `${pad(row.reason, REASON_WIDTH)}`
    );
  }
  console.log(separator);
}

async function main() {
  const config = getAiConfig();
  if (config.provider !== 'llm' || !config.apiKey) {
    console.error(
      'Gagal: AI_API_KEY belum diisi. Isi key di app/.env (atau environment) lalu jalankan npm run seed:ai.'
    );
    process.exitCode = 1;
    return;
  }

  const baseUrlHost = config.baseURL ? new URL(config.baseURL).host : '-';
  console.log(
    `Klasifikasi ${SEED_COMPLAINTS.length} keluhan seed secara berurutan ` +
      `(model: ${config.model}, host: ${baseUrlHost}, jeda: ${DELAY_MS} ms).`
  );

  const items = {};
  const rows = [];

  for (let index = 0; index < SEED_COMPLAINTS.length; index += 1) {
    const seed = SEED_COMPLAINTS[index];
    const id = seedComplaintId(index);
    const progress = `[${index + 1}/${SEED_COMPLAINTS.length}]`;

    process.stdout.write(`${progress} ${truncate(seed.raw_text, TEXT_WIDTH)} ... `);

    let result;
    try {
      result = await classifyComplaint(seed.raw_text);
    } catch (err) {
      console.error(`GAGAL: ${err?.message ?? err}`);
      console.error('\nSeed AI dibatalkan. data/seed-ai.json tidak ditulis.');
      process.exitCode = 1;
      return;
    }

    console.log(`OK ${result.category} (${result.confidence.toFixed(2)})`);

    items[id] = {
      category: result.category,
      confidence: result.confidence,
      reason: result.reason,
    };
    rows.push({
      index: index + 1,
      text: seed.raw_text,
      category: result.category,
      confidence: result.confidence.toFixed(2),
      reason: result.reason,
    });

    if (index < SEED_COMPLAINTS.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  printTable(rows);

  const payload = {
    generated_at: new Date().toISOString(),
    model: config.model,
    base_url_host: baseUrlHost,
    items,
  };

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  const size = fs.statSync(OUTPUT_FILE).size;
  console.log(
    `\nDitulis: ${path.relative(process.cwd(), OUTPUT_FILE)} ` +
      `(${Object.keys(items).length} item, ${size} byte).`
  );
}

await main();
