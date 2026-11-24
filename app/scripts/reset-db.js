// Deletes the local SQLite database (and its WAL side files).
// The next server start recreates the schema and seeds the demo data.
//
// Usage: npm run db:reset

const fs = require('node:fs');
const path = require('node:path');

const dbFile = process.env.SMARTGUEST_DB_PATH || path.join(process.cwd(), 'data', 'smartguest.db');

for (const file of [dbFile, `${dbFile}-wal`, `${dbFile}-shm`]) {
  if (fs.existsSync(file)) {
    fs.rmSync(file);
    console.log(`removed ${file}`);
  }
}

console.log('database reset complete');
