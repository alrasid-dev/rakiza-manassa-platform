import mysql from "mysql2/promise";

const raw = process.env.DATABASE_URL || process.env.VITE_DATABASE_URL;
const url = new URL(raw);
const db = await mysql.createConnection({
  host: url.hostname,
  port: Number(url.port || 4000),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.replace(/^\//, "") || "rakiza",
  ssl: { rejectUnauthorized: false, minVersion: "TLSv1.2" },
});
const q = (sql, p = []) => db.query(sql, p).then(([r]) => r);

const emails = ["fsurajeh@moj.gov.sa", "mahjaber@moj.gov.sa", "alothman@moj.gov.sa"];
const out = {};
out.accounts = await q("SELECT id, email, name, role, mustChangePassword FROM users WHERE LOWER(email) IN (?) ORDER BY email", [emails]);
out.grants = await q("SELECT officialEmail, permission, isActive, userId FROM access_grants WHERE LOWER(officialEmail) IN (?) ORDER BY officialEmail", [emails]);
out.profiles = await q("SELECT fullName, email, unitId, status FROM person_profiles WHERE LOWER(email) IN (?) ORDER BY email", [emails]);
out.roles = await q("SELECT u.email, cra.role, cra.unitId, ou.name AS unitName FROM court_role_assignments cra JOIN users u ON u.id = cra.userId LEFT JOIN organization_units ou ON ou.id = cra.unitId WHERE LOWER(u.email) IN (?) ORDER BY u.email", [emails]);
out.legacyGone = await q("SELECT id, email FROM users WHERE LOWER(email) IN ('falrajh@moj.gov.sa','maljaber@moj.gov.sa','aalothman@moj.gov.sa')");
out.taskTemplates = await q("SELECT tt.id, tt.title, tt.frequency, tt.isActive, ou.name AS unitName FROM task_templates tt LEFT JOIN organization_units ou ON ou.id = tt.unitId ORDER BY ou.name, tt.id");
out.templateCount = out.taskTemplates.length;

console.log(JSON.stringify(out, null, 2));
await db.end();
