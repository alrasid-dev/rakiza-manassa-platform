import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';

function readEnvValue(filePath, key) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const m = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
      if (m && m[1] === key) return m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch { /* ignore */ }
  return '';
}

const rawUrl = readEnvValue(path.resolve('.env.production.local'), 'DATABASE_URL') || process.env.DATABASE_URL;
if (!rawUrl) { console.error('DATABASE_URL not found'); process.exit(1); }
const url = new URL(rawUrl);
const database = decodeURIComponent(url.pathname.replace(/^\//, '')) || 'rakiza';
const connection = await mysql.createConnection({
  host: url.hostname,
  port: Number(url.port || 4000),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database,
  ssl: { rejectUnauthorized: false, minVersion: 'TLSv1.2' },
  supportBigNumbers: true,
  bigNumberStrings: true,
});

const ddl = `CREATE TABLE IF NOT EXISTS task_reassignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  task_id INT NOT NULL,
  from_profile_id INT NOT NULL,
  to_profile_id INT NOT NULL,
  reason TEXT NOT NULL,
  duration_days INT NULL,
  auto_return_at TIMESTAMP NULL,
  returned_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by INT NOT NULL,
  INDEX idx_task (task_id),
  INDEX idx_auto_return (auto_return_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;
console.log('Creating task_reassignments table...');
await connection.query(ddl);
console.log('Done. task_reassignments table is ready.');
await connection.end();
