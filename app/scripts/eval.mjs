// Harness evaluasi klasifikasi keluhan SmartGuest.
//
// Jalankan dari direktori app/:
//   npm run eval
//
// Skrip membaca eval/dataset.jsonl (100 keluhan berlabel), memanggil
// classifyComplaint() dari src/lib/ai.ts satu per satu secara berurutan dengan
// jeda 800-1200 ms, lalu menulis eval/results/*. Bila AI_API_KEY kosong atau
// ada satu panggilan yang gagal (setelah satu kali ulang), skrip berhenti
// dengan exit 1 dan TIDAK menulis hasil setengah jadi.
//
// Catatan env: script npm sengaja tetap "node scripts/eval.mjs" (tanpa flag)
// sesuai kontrak tugas, jadi berkas app/.env dimuat di dalam skrip sebagai
// fallback bila AI_API_KEY belum ada di environment. Tidak pernah mencetak key.

import fs from 'node:fs';
import path from 'node:path';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Path & environment
// ---------------------------------------------------------------------------

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url)); // app/scripts
const APP_DIR = path.resolve(SCRIPT_DIR, '..'); // app
const REPO_ROOT = path.resolve(APP_DIR, '..');
const EVAL_DIR = path.join(REPO_ROOT, 'eval');
const DATASET_FILE = path.join(EVAL_DIR, 'dataset.jsonl');
const RESULTS_DIR = path.join(EVAL_DIR, 'results');
const PREDICTIONS_FILE = path.join(RESULTS_DIR, 'predictions.jsonl');
const MATRIX_CSV = path.join(RESULTS_DIR, 'matrix.csv');
const MATRIX_MD = path.join(RESULTS_DIR, 'matrix.md');
const SUMMARY_MD = path.join(RESULTS_DIR, 'summary.md');
const README_MD = path.join(EVAL_DIR, 'README.md');
const ENV_FILE = path.join(APP_DIR, '.env');

const MIN_DELAY_MS = 800;
const MAX_DELAY_MS = 1200;

if (!process.env.AI_API_KEY?.trim() && fs.existsSync(ENV_FILE)) {
  try {
    process.loadEnvFile(ENV_FILE);
  } catch (err) {
    console.error(`Peringatan: gagal memuat ${path.relative(REPO_ROOT, ENV_FILE)}: ${err?.message ?? err}`);
  }
}

// Node mewajibkan ekstensi eksplisit untuk impor ESM, sedangkan modul aplikasi
// memakai impor tanpa ekstensi (gaya bundler Next.js). Hook ini melengkapi
// specifier relatif tanpa ekstensi dengan `.ts` (trik yang sama dengan
// scripts/seed-ai.mjs).
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

const { CATEGORIES } = await import('../src/lib/types.ts');
const { classifyComplaint, getAiConfig } = await import('../src/lib/ai.ts');

// ---------------------------------------------------------------------------
// Util
// ---------------------------------------------------------------------------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay() {
  return MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1));
}

function fail(message) {
  console.error(`\nGAGAL: ${message}`);
  console.error('Evaluasi dibatalkan. Tidak ada hasil yang ditulis.');
  process.exitCode = 1;
}

function parseDataset() {
  if (!fs.existsSync(DATASET_FILE)) {
    throw new Error(`dataset tidak ditemukan: ${path.relative(REPO_ROOT, DATASET_FILE)}`);
  }

  const items = [];
  const lines = fs.readFileSync(DATASET_FILE, 'utf8').split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i].trim();
    if (!raw) continue;

    let obj;
    try {
      obj = JSON.parse(raw);
    } catch (err) {
      throw new Error(`baris ${i + 1} bukan JSON valid: ${err?.message ?? err}`);
    }

    if (typeof obj?.id !== 'string' || typeof obj?.text !== 'string' || typeof obj?.label !== 'string') {
      throw new Error(`baris ${i + 1} wajib punya id, text, dan label bertipe string`);
    }
    if (!CATEGORIES.includes(obj.label)) {
      throw new Error(`baris ${i + 1} (${obj.id}) label tidak dikenal: ${obj.label}`);
    }
    items.push({ id: obj.id, text: obj.text, label: obj.label });
  }

  const ids = new Set();
  for (const item of items) {
    if (ids.has(item.id)) throw new Error(`id duplikat: ${item.id}`);
    ids.add(item.id);
  }

  return items;
}

function percentile(sortedValues, p) {
  if (sortedValues.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sortedValues.length);
  const index = Math.min(sortedValues.length - 1, Math.max(0, rank - 1));
  return sortedValues[index];
}

function pad(text, width) {
  const value = String(text);
  return value + ' '.repeat(Math.max(0, width - value.length));
}

// ---------------------------------------------------------------------------
// Metrik
// ---------------------------------------------------------------------------

function computeMetrics(predictions) {
  const matrix = {};
  for (const actual of CATEGORIES) {
    matrix[actual] = {};
    for (const predicted of CATEGORIES) matrix[actual][predicted] = 0;
  }
  for (const row of predictions) matrix[row.label][row.predicted] += 1;

  const total = predictions.length;
  const correct = predictions.filter((row) => row.correct).length;
  const accuracy = total === 0 ? 0 : correct / total;

  const perCategory = CATEGORIES.map((category) => {
    const tp = matrix[category][category];
    // Baris = label sebenarnya (support), kolom = label prediksi (predictedCount).
    const support = CATEGORIES.reduce((sum, predicted) => sum + matrix[category][predicted], 0);
    const predictedCount = CATEGORIES.reduce((sum, actual) => sum + matrix[actual][category], 0);
    const precision = predictedCount === 0 ? 0 : tp / predictedCount;
    const recall = support === 0 ? 0 : tp / support;
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
    return { category, support, predictedCount, precision, recall, f1 };
  });

  const macroF1 = perCategory.reduce((sum, row) => sum + row.f1, 0) / perCategory.length;

  const nonReview = predictions.filter((row) => row.label !== 'perlu_ditinjau');
  const abstained = nonReview.filter((row) => row.predicted === 'perlu_ditinjau').length;
  const abstainRate = nonReview.length === 0 ? 0 : abstained / nonReview.length;

  const latencies = predictions.map((row) => row.latency_ms).slice().sort((a, b) => a - b);
  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);

  return {
    matrix,
    total,
    correct,
    accuracy,
    perCategory,
    macroF1,
    nonReviewCount: nonReview.length,
    abstained,
    abstainRate,
    p50,
    p95,
    meanLatency: latencies.reduce((sum, value) => sum + value, 0) / (latencies.length || 1),
  };
}

// ---------------------------------------------------------------------------
// Penulisan hasil
// ---------------------------------------------------------------------------

function writeMatrixCsv(matrix) {
  const header = ['actual\\predicted', ...CATEGORIES, 'total'];
  const lines = [header.join(',')];
  for (const actual of CATEGORIES) {
    const row = [actual, ...CATEGORIES.map((predicted) => matrix[actual][predicted])];
    row.push(CATEGORIES.reduce((sum, predicted) => sum + matrix[actual][predicted], 0));
    lines.push(row.join(','));
  }
  const totalRow = ['total'];
  for (const predicted of CATEGORIES) {
    totalRow.push(CATEGORIES.reduce((sum, actual) => sum + matrix[actual][predicted], 0));
  }
  totalRow.push(
    CATEGORIES.reduce(
      (sum, actual) => sum + CATEGORIES.reduce((inner, predicted) => inner + matrix[actual][predicted], 0),
      0
    )
  );
  lines.push(totalRow.join(','));
  fs.writeFileSync(MATRIX_CSV, `${lines.join('\n')}\n`, 'utf8');
}

function writeMatrixMd(matrix) {
  const header = ['Aktual \\ Prediksi', ...CATEGORIES, 'Total'];
  const separator = header.map(() => '---');
  const lines = [
    `| ${header.join(' | ')} |`,
    `| ${separator.join(' | ')} |`,
  ];
  for (const actual of CATEGORIES) {
    const values = CATEGORIES.map((predicted) => matrix[actual][predicted]);
    const total = values.reduce((sum, value) => sum + value, 0);
    lines.push(`| **${actual}** | ${values.join(' | ')} | ${total} |`);
  }
  const totals = CATEGORIES.map((predicted) =>
    CATEGORIES.reduce((sum, actual) => sum + matrix[actual][predicted], 0)
  );
  lines.push(`| **Total** | ${totals.join(' | ')} | ${totals.reduce((sum, value) => sum + value, 0)} |`);
  fs.writeFileSync(MATRIX_MD, `${lines.join('\n')}\n`, 'utf8');
}

function writeSummary(metrics, meta) {
  const pct = (value) => `${(value * 100).toFixed(2)}%`;
  const f4 = (value) => value.toFixed(4);

  const lines = [
    '# Ringkasan Evaluasi Klasifikasi Keluhan',
    '',
    `- Tanggal run: ${meta.generatedAt}`,
    `- Model: \`${meta.model}\``,
    `- Host API: ${meta.baseUrlHost}`,
    `- Jumlah item: ${metrics.total}`,
    `- Akurasi: **${pct(metrics.accuracy)}** (${metrics.correct}/${metrics.total} benar)`,
    `- Macro-F1: **${f4(metrics.macroF1)}**`,
    `- Operational abstain rate: **${pct(metrics.abstainRate)}** ` +
      `(${metrics.abstained}/${metrics.nonReviewCount} item non-perlu_ditinjau diprediksi perlu_ditinjau)`,
    `- Latensi p50: **${metrics.p50} ms**; p95: **${metrics.p95} ms**; rata-rata: ${Math.round(metrics.meanLatency)} ms`,
    '',
    '## Metrik per kategori',
    '',
    '| Kategori | Support | Prediksi | Precision | Recall | F1 |',
    '| --- | --- | --- | --- | --- | --- |',
  ];

  for (const row of metrics.perCategory) {
    lines.push(
      `| ${row.category} | ${row.support} | ${row.predictedCount} | ` +
        `${f4(row.precision)} | ${f4(row.recall)} | ${f4(row.f1)} |`
    );
  }

  lines.push(
    '',
    '## Catatan',
    '',
    '- Confusion matrix lengkap ada di `matrix.csv` dan `matrix.md`.',
    '- Prediksi per item ada di `predictions.jsonl`.',
    '- Prompt dan model tidak diubah selama evaluasi; angka ini adalah pengukuran, bukan hasil tuning.',
    '- abstain rate dihitung hanya dari item yang label sebenarnya bukan `perlu_ditinjau`.',
    ''
  );

  fs.writeFileSync(SUMMARY_MD, `${lines.join('\n')}\n`, 'utf8');
}

function writeReadme(meta) {
  const lines = [
    '# Evaluasi Klasifikasi Keluhan SmartGuest',
    '',
    'Dataset berlabel dan harness untuk mengukur performa `classifyComplaint()` di `app/src/lib/ai.ts`.',
    '',
    '## Cara menjalankan',
    '',
    'Dari direktori `app/` (memuat `app/.env` otomatis):',
    '',
    '```bash',
    'cd app',
    'npm run eval',
    '```',
    '',
    'Alternatif dari root repo, dengan flag env eksplisit:',
    '',
    '```bash',
    'node --env-file-if-exists=app/.env app/scripts/eval.mjs',
    '```',
    '',
    'Butuh `AI_API_KEY` di `app/.env`. Skrip memanggil AI 100 kali secara berurutan',
    'dengan jeda 800-1200 ms agar tidak menabrak rate limit. Bila key kosong atau ada',
    'panggilan gagal (setelah satu kali ulang), skrip exit 1 tanpa menulis hasil.',
    '',
    '## Isi',
    '',
    '- `dataset.jsonl` - 100 keluhan Bahasa Indonesia, 20 per kategori.',
    '- `results/predictions.jsonl` - prediksi per item + latency.',
    '- `results/matrix.csv`, `results/matrix.md` - confusion matrix 5x5.',
    '- `results/summary.md` - akurasi, macro-F1, metrik per kategori, abstain rate, latensi.',
    '',
    '## Run terakhir',
    '',
    `- Tanggal: ${meta.generatedAt}`,
    `- Model: \`${meta.model}\``,
    `- Jumlah item: 100`,
    '',
    '## Batasan',
    '',
    '- Dataset **sintetis** 100 item yang ditulis penulis; bukan keluhan tamu nyata dan',
    '  tidak mewakili distribusi keluhan hotel sebenarnya.',
    '- Label adalah penilaian manusia tunggal (penulis dataset). Item ambigu diberi',
    '  catatan alasan, tetapi label tetap bisa diperdebatkan.',
    '- Sampel kecil (100 item), sehingga selisih beberapa persen tidak stabil secara statistik.',
    '- Prompt/model dapat berubah kapan saja; hasil tidak sepenuhnya deterministik dan',
    '  tidak boleh digeneralisasi ke populasi tamu lain.',
    '- Evaluasi hanya mengukur kategori, bukan kualitas alasan atau kalibrasi confidence.',
    ''
  ];
  fs.writeFileSync(README_MD, `${lines.join('\n')}\n`, 'utf8');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const config = getAiConfig();
  if (config.provider !== 'llm' || !config.apiKey) {
    fail('AI_API_KEY belum diisi. Isi key di app/.env lalu jalankan npm run eval.');
    return;
  }

  const items = parseDataset();
  const baseUrlHost = config.baseURL ? new URL(config.baseURL).host : '-';

  console.log(
    `Evaluasi ${items.length} keluhan secara berurutan ` +
      `(model: ${config.model}, host: ${baseUrlHost}, jeda: ${MIN_DELAY_MS}-${MAX_DELAY_MS} ms).`
  );

  const predictions = [];

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const progress = `[${index + 1}/${items.length}] ${item.id}`;
    process.stdout.write(`${progress} ${item.text.slice(0, 52)}... `);

    let result;
    let latencyMs = 0;
    let attempt = 0;

    while (attempt < 2) {
      attempt += 1;
      const startedAt = Date.now();
      try {
        result = await classifyComplaint(item.text);
        latencyMs = Date.now() - startedAt;
        break;
      } catch (err) {
        latencyMs = Date.now() - startedAt;
        const message = err?.message ?? String(err);
        if (attempt === 1) {
          console.warn(`\n  percobaan 1 gagal (${latencyMs} ms): ${message}; ulangi sekali...`);
          await sleep(1200);
          process.stdout.write(`${progress} [retry] ... `);
        } else {
          fail(`${item.id} gagal dua kali. Pesan terakhir: ${message}`);
          return;
        }
      }
    }

    const correct = result.category === item.label;
    predictions.push({
      id: item.id,
      label: item.label,
      predicted: result.category,
      confidence: result.confidence,
      reason: result.reason,
      correct,
      latency_ms: latencyMs,
    });

    console.log(`OK ${result.category} (${result.confidence.toFixed(2)}) ${latencyMs}ms${correct ? '' : ' SALAH'}`);

    if (index < items.length - 1) {
      await sleep(randomDelay());
    }
  }

  if (predictions.length !== items.length) {
    fail(`hanya ${predictions.length}/${items.length} item berhasil diprediksi.`);
    return;
  }

  const metrics = computeMetrics(predictions);
  const meta = {
    generatedAt: new Date().toISOString(),
    model: config.model,
    baseUrlHost,
  };

  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(
    PREDICTIONS_FILE,
    `${predictions.map((row) => JSON.stringify(row)).join('\n')}\n`,
    'utf8'
  );
  writeMatrixCsv(metrics.matrix);
  writeMatrixMd(metrics.matrix);
  writeSummary(metrics, meta);
  writeReadme(meta);

  console.log('\n' + '-'.repeat(72));
  console.log(`Item benar      : ${metrics.correct}/${metrics.total}`);
  console.log(`Akurasi         : ${(metrics.accuracy * 100).toFixed(2)}%`);
  console.log(`Macro-F1        : ${metrics.macroF1.toFixed(4)}`);
  console.log(`Abstain rate    : ${(metrics.abstainRate * 100).toFixed(2)}%`);
  console.log(`Latensi p50/p95 : ${metrics.p50} ms / ${metrics.p95} ms`);
  console.log('-'.repeat(72));
  for (const row of metrics.perCategory) {
    console.log(
      `${pad(row.category, 15)} P=${row.precision.toFixed(2)} R=${row.recall.toFixed(2)} ` +
        `F1=${row.f1.toFixed(2)} support=${row.support}`
    );
  }
  console.log(
    `\nDitulis: ${path.relative(REPO_ROOT, PREDICTIONS_FILE)}, matrix.csv, matrix.md, summary.md, README.md`
  );
}

try {
  await main();
} catch (err) {
  fail(err?.message ?? String(err));
}
