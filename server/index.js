import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase, closeDatabase } from './db.js';
import { createApp } from './app.js';

try {
  process.loadEnvFile?.();
} catch {
  // .env is optional; the demo runs with safe local defaults.
}

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT) || 8788;
const host = process.env.HOST || '127.0.0.1';
const databasePath = process.env.DATABASE_PATH || path.join(rootDir, 'data', 'callflow-full.db');
const staticDir = path.join(rootDir, 'dist');
const db = openDatabase(databasePath);
const app = createApp({ db, staticDir, demoMode: process.env.DEMO_MODE !== 'false' });

const server = app.listen(port, host, () => {
  console.log(`CallFlow API listening on http://${host}:${port}`);
  console.log(`[callflow] database: ${databasePath}`);
});

function shutdown(signal) {
  console.log(`\n[callflow] received ${signal}, shutting down`);
  server.close(() => {
    closeDatabase(db);
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
