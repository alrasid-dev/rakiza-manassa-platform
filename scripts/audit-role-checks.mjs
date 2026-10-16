// scripts/audit-role-checks.mjs
// جرد آلي لكل مواضع فحص أدوار CourtRole (client + server + shared).
// ينتج JSON + ملخص نصي، دون تعديل أي كود.
// التشغيل: node scripts/audit-role-checks.mjs
// ⚠️ تصنيف القدرة (capability) تقريبي — سيُحسَّن في المرحلة 10.

import fs from "node:fs";
import path from "node:path";

const ROLE_NAMES = [
  "court_president", "assistant_president", "court_secretary",
  "human_resources_manager", "department_manager", "performance_monitor",
  "trainee_affairs_manager", "technical_support_manager", "technical_support_agent",
  "administrative_staff", "judicial_trainee", "judge", "owner",
];

const ROLE_RE = new RegExp(`"(${ROLE_NAMES.join("|")})"`, "g");

const PATTERNS = [
  /roles\s*\.\s*some\s*\(/,
  /roles\s*\?\.\s*some\s*\(/,
  /roleList\s*\.\s*some\s*\(/,
  /roles\s*\.\s*includes\s*\(/,
  /roles\s*\?\.\s*includes\s*\(/,
  /roleList\s*\.\s*includes\s*\(/,
  /roles\s*\.\s*filter\s*\(/,
  /\.\s*some\s*\(\s*(?:\(\s*)?r\s*(?:\)\s*)?=>/,
  /\.\s*some\s*\(\s*role\s*=>/,
  /\brole\s*===?\s*"/,
  /\brole\s*!==?\s*"/,
];

const ROOT = process.cwd();
const SCAN_DIRS = [path.resolve("client/src"), path.resolve("server"), path.resolve("shared")];
const EXCLUDE_DIR_SEGMENTS = new Set(["node_modules", "api", "backups", "public", "dist", ".git"]);
const EXCLUDE_FILES = new Set([
  path.resolve("shared/role-capabilities.ts"),
  path.resolve("scripts/audit-role-checks.mjs"),
]);

function isTestFile(file) {
  return /\.(test|spec)\.(ts|tsx)$/.test(file);
}

function collectFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDE_DIR_SEGMENTS.has(entry.name)) continue;
      collectFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function stripComments(line, state) {
  let out = line;
  if (state.inBlock) {
    const close = out.indexOf("*/");
    if (close === -1) return "";
    out = out.slice(close + 2);
    state.inBlock = false;
  }
  const lineComment = out.indexOf("//");
  if (lineComment !== -1) out = out.slice(0, lineComment);
  const open = out.indexOf("/*");
  if (open !== -1) {
    const closeAfter = out.indexOf("*/", open + 2);
    if (closeAfter === -1) {
      state.inBlock = true;
      out = out.slice(0, open);
    } else {
      out = out.slice(0, open) + out.slice(closeAfter + 2);
    }
  }
  return out;
}

function extractRoles(line) {
  const found = [];
  let m;
  ROLE_RE.lastIndex = 0;
  while ((m = ROLE_RE.exec(line)) !== null) {
    if (!found.includes(m[1])) found.push(m[1]);
  }
  return found;
}

function contextTracker() {
  let current = "";
  return {
    feed(line) {
      const fn = line.match(/(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)/);
      const arrow = line.match(/(?:export\s+)?const\s+([A-Za-z0-9_]+)\s*=\s*(?:async\s*)?\(/);
      const method = line.match(/\s(?:async\s+)?([A-Za-z0-9_]+)\s*\([^)]*\)\s*\{/);
      if (fn) current = fn[1];
      else if (arrow) current = arrow[1];
      else if (method && !/^(if|for|while|switch|catch)$/.test(method[1])) current = method[1];
    },
    get() {
      return current;
    },
  };
}

function inferCapability(line, context) {
  const text = (line + " " + context).toLowerCase();
  if (/attendance|حضور|انصراف/.test(text)) return /edit|modify|owner|record|تعديل/.test(text) ? "manage_attendance" : "view_attendance";
  if (/support|ticket|تذكرة|دعم/.test(text)) return "support";
  if (/hr|human_resources|موارد|personnel|ملفات موظف/.test(text)) return "manage_hr";
  if (/judge|قاض/.test(text)) return "manage_judiciary";
  if (/trainee|ملازم/.test(text)) return "manage_trainees";
  if (/correspondence|مراسل/.test(text)) return "manage_correspondence";
  if (/delegat|تفويض|مدراء|department_manager/.test(text)) return "manage_departments";
  if (/approv|اعتماد|تصعيد/.test(text)) return "approve";
  if (/report|تقارير|تقرير/.test(text)) return "attach_reports";
  if (/operation|إدارة|operational/.test(text)) return "manage_operations";
  return "generic";
}

function main() {
  const files = SCAN_DIRS.flatMap((dir) => collectFiles(dir))
    .filter((f) => !isTestFile(f) && !EXCLUDE_FILES.has(f));

  const matches = [];

  for (const file of files) {
    const rel = path.relative(ROOT, file).replace(/\\/g, "/");
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    const tracker = contextTracker();
    const commentState = { inBlock: false };

    lines.forEach((raw, index) => {
      tracker.feed(raw);
      const line = stripComments(raw, commentState);
      if (!line.trim()) return;

      const matched = PATTERNS.some((re) => re.test(line));
      if (!matched) return;

      const roles = extractRoles(line);
      if (roles.length === 0) return;

      matches.push({
        file: rel,
        line: index + 1,
        roles,
        capability: inferCapability(line, tracker.get()),
        context: tracker.get() || "",
        snippet: line.trim().slice(0, 120),
      });
    });
  }

  const byFile = {};
  const byRoleGroup = {};
  const byCapability = {};
  for (const m of matches) {
    byFile[m.file] = (byFile[m.file] || 0) + 1;
    byCapability[m.capability] = (byCapability[m.capability] || 0) + 1;
    const groupKey = [...m.roles].sort().join("|");
    (byRoleGroup[groupKey] ||= []).push(`${m.file}:${m.line}`);
  }

  const duplicatedGroups = Object.entries(byRoleGroup)
    .filter(([, locs]) => locs.length >= 2)
    .map(([group, locs]) => ({ group: group.split("|"), count: locs.length, locations: locs }))
    .sort((a, b) => b.count - a.count);

  const topFiles = Object.entries(byFile)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([file, count]) => ({ file, count }));

  const report = {
    generatedAt: new Date().toISOString(),
    totalMatches: matches.length,
    affectedFiles: Object.keys(byFile).length,
    capabilities: byCapability,
    duplicatedRoleGroups: duplicatedGroups,
    topFiles,
    matches,
  };

  const outPath = path.resolve("scripts/audit-role-checks-report.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log("=== تقرير جرد فحص الأدوار ===\n");
  console.log(`المواضع الكلية: ${report.totalMatches}`);
  console.log(`الملفات المتأثرة: ${report.affectedFiles}`);
  console.log(`القدرات المكتشفة: ${Object.keys(byCapability).sort().join(", ")}\n`);

  console.log("Top 10 ملفات (الأكثر مواضع):");
  for (const t of topFiles) console.log(`  ${t.count}\t${t.file}`);

  console.log("\nالمجموعات المكررة (نفس القائمة في >=2 موضع):");
  for (const g of duplicatedGroups) {
    console.log(`  [${g.group.join(", ")}] x${g.count}`);
  }

  console.log(`\nالتقرير محفوظ في: ${outPath}`);
}

main();

