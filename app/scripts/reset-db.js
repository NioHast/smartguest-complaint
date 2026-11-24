// Deletes the local SQLite database (and its WAL side files).
// The next server start recreates the schema and seeds the demo data.
//
// Usage: npm run db:reset

const fs = require('node:fs');
const path = require('node:path');

const dbFile = process.env.SMARTGUEST_DB_PATH || path.join(process.cwd(), 'data', 'smartguest.db');

// Windows reports a database still held by a running process (usually
// `next dev`) as EPERM/EBUSY; EACCES shows up on other platforms/ACLs.
const LOCKED_ERROR_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']);

function printLockedMessage(file) {
  console.error('Gagal menghapus database: file sedang dipakai proses lain.');
  console.error(`  file: ${file}`);
  console.error('');
  console.error('Kemungkinan besar server Next.js masih berjalan. Hentikan dulu:');
  console.error('  - tekan Ctrl+C di terminal `npm run dev`, atau');
  console.error('  - taskkill /PID <pid> /F   (PID bisa dilihat dari `netstat -ano | findstr :3000`)');
  console.error('');
  console.error('Lalu jalankan lagi: npm run db:reset');
}

let locked = false;

for (const file of [dbFile, `${dbFile}-wal`, `${dbFile}-shm`]) {
  if (!fs.existsSync(file)) {
    continue;
  }

  try {
    fs.rmSync(file);
    console.log(`removed ${file}`);
  } catch (error) {
    if (error && LOCKED_ERROR_CODES.has(error.code)) {
      // Report a friendly hint instead of a stack trace, and stop before
      // touching the remaining side files of a database still in use.
      printLockedMessage(file);
      process.exitCode = 1;
      locked = true;
      break;
    }

    throw error;
  }
}

if (!locked) {
  console.log('database reset complete');
}
