#!/usr/bin/env node
/** ترحيل أعلى 30 لون hardcoded إلى متغيرات CSS دلالية (الدفعة 1/3). */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve("client/src");
const PREFIX = "rakiza-";

/** hex -> { text?, bg?, border? } حيث القيمة اسم المتغير الدلالي (بدون rakiza-). */
const MAPPING = {
  "#12352f": { text: "ink", bg: "olive-strong" },
  "#e7e0d4": { border: "border" },
  "#65766d": { text: "muted" },
  "#b18448": { text: "gold", bg: "gold", border: "gold" },
  "#006c35": { text: "olive-strong", bg: "olive-strong", border: "olive-strong" },
  "#29463b": { text: "ink" },
  "#2d6b4f": { text: "olive", bg: "olive", border: "olive" },
  "#6a786f": { text: "muted" },
  "#a04a35": { text: "danger", bg: "danger" },
  "#53675d": { text: "muted" },
  "#75837c": { text: "muted" },
  "#718078": { text: "muted" },
  "#2f7653": { text: "olive-strong", bg: "olive-strong", border: "olive-strong" },
  "#738179": { text: "muted" },
  "#6e7e75": { text: "muted" },
  "#f8f8f3": { bg: "surface" },
  "#8a6731": { text: "gold", bg: "gold" },
  "#355d4b": { text: "olive" },
  "#fbfaf6": { bg: "surface" },
  "#386048": { text: "olive" },
  "#1d5245": { text: "ink", bg: "olive-strong" },
  "#245f43": { text: "olive-strong", bg: "olive-strong" },
  "#00552b": { bg: "olive-strong" },
  "#1f5a47": { text: "olive-strong" },
  "#d9e3d8": { border: "border" },
  "#eee8de": { border: "border" },
  "#fbe9e4": { bg: "surface-muted" },
  "#e9f0ea": { bg: "olive-soft" },
  "#d8d1c5": { border: "border" },
  "#cfd7ca": { border: "border" },
  // الدفعة 2: عائلات الأخضر الداكن/المتوسط/الرمادي/الذهبي/الأحمر
  "#26473a": { text: "ink" },
  "#284239": { text: "ink" },
  "#173d30": { text: "ink" },
  "#18352c": { text: "ink", bg: "olive-strong", border: "olive-strong" },
  "#315348": { text: "ink" },
  "#244e3c": { text: "ink" },
  "#315c4a": { text: "ink" },
  "#0b5c45": { text: "ink", bg: "olive-strong", border: "olive-strong" },
  "#16834b": { text: "olive-strong", bg: "olive-strong", border: "olive-strong" },
  "#28623f": { text: "olive-strong" },
  "#17734b": { text: "olive-strong" },
  "#1f7a4d": { text: "olive-strong", bg: "olive-strong" },
  "#2d684a": { text: "olive-strong" },
  "#4a785a": { text: "olive-strong" },
  "#9aa89f": { text: "muted" },
  "#77867d": { text: "muted" },
  "#748279": { text: "muted" },
  "#708078": { text: "muted" },
  "#788980": { text: "muted" },
  "#7a887f": { text: "muted" },
  "#52665b": { text: "muted" },
  "#6d7d74": { text: "muted" },
  "#446075": { text: "muted" },
  "#8a6d20": { text: "gold", bg: "gold" },
  "#80642b": { text: "gold" },
  "#805d27": { text: "gold" },
  "#6f552c": { text: "gold" },
  "#9a4634": { text: "danger" },
  "#a44532": { text: "danger" },
  "#a8493b": { text: "danger" },
};

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
  for (const [hex, ctxMap] of Object.entries(MAPPING)) {
    for (const [ctx, varName] of Object.entries(ctxMap)) {
      const re = new RegExp(`(${ctx}-\\[)${hex}(\\/[0-9.]+)?\\]`, "gi");
      content = content.replace(re, (match, open, opacity) => {
        fileReplacements++;
        return `${open}var(--${PREFIX}${varName})${opacity || ""}]`;
      });
    }
  }
  if (content !== original) {
    fs.writeFileSync(file, content, "utf8");
    filesAffected++;
    replacements += fileReplacements;
    affected.push(path.relative(ROOT, file));
  }
}

console.log("MAPPED_COLORS", Object.keys(MAPPING).length);
console.log("FILES_AFFECTED", filesAffected);
console.log("REPLACEMENTS", replacements);
console.log("AFFECTED_FILES:");
for (const f of affected) console.log("  " + f);
