#!/usr/bin/env node
/** ترحيل ألوان Tailwind النصية (gray/slate/neutral/zinc) إلى متغير دلالي. */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve("client/src");

// داكن (عناوين) → ink ؛ فاتح/متوسط (نصوص ثانوية) → muted
const RULES = [
  { from: /text-(gray|slate|neutral|zinc)-(900|800|700)/g, to: "text-[var(--rakiza-ink)]" },
  { from: /text-(gray|slate|neutral|zinc)-(600|500|400|300|200)/g, to: "text-[var(--rakiza-muted)]" },
];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      walk(full, out);
    } else if (entry.name.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

const files = walk(ROOT);
let filesAffected = 0;
let replacements = 0;
const affected = [];

for (const file of files) {
  const original = fs.readFileSync(file, "utf8");
  let content = original;
  let fileReplacements = 0;
  for (const rule of RULES) {
    content = content.replace(rule.from, () => { fileReplacements++; return rule.to; });
  }
  if (content !== original) {
    fs.writeFileSync(file, content, "utf8");
    filesAffected++;
    replacements += fileReplacements;
    affected.push(path.relative(ROOT, file));
  }
}

console.log("FILES_AFFECTED", filesAffected);
console.log("REPLACEMENTS", replacements);
console.log("AFFECTED_FILES:");
for (const f of affected) console.log("  " + f);
