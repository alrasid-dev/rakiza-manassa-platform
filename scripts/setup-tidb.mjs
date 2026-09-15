import mysql from "mysql2/promise";

const raw = process.env.SETUP_DATABASE_URL;
if (!raw) {
  console.error("SETUP_DATABASE_URL is required");
  process.exit(1);
}

const url = new URL(raw);
const base = {
  host: url.hostname,
  port: Number(url.port || 4000),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  ssl: { rejectUnauthorized: false, minVersion: "TLSv1.2" },
};

const DB_NAME = process.env.SETUP_DATABASE_NAME || "rakiza";

const admin = await mysql.createConnection({ ...base, database: "test" });
await admin.query(`DROP DATABASE IF EXISTS \`${DB_NAME}\``);
await admin.query(`CREATE DATABASE \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
console.log(`[reset] ${DB_NAME} dropped & recreated`);
await admin.end();

