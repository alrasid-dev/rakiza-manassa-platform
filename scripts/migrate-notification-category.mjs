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

const VALUES = ["trainee_due_soon", "task_due", "delay_alert", "access_request", "support_ticket", "attendance_confirmation", "security_alert", "performance_recommendation", "chat_message", "report_review", "correspondence_update", "disciplinary_team", "disciplinary_employee", "attendance_modified"];
const enumSql = VALUES.map(v => `'${v}'`).join(',');
const alter = `ALTER TABLE notifications MODIFY COLUMN category ENUM(${enumSql}) NOT NULL`;
console.log('Running: ' + alter);
await connection.query(alter);
console.log('Done. notifications.category now includes attendance_modified.');
await connection.end();
