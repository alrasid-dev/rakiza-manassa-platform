import * as esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";

const outfile = "api/handler.js";

await esbuild.build({
  entryPoints: ["server/vercel-handler.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  outfile,
  alias: { "@shared": path.resolve("shared") },
  logLevel: "info",
});

const bundled = fs.readFileSync(outfile, "utf8");
const banned = [
  /from\s+["']\.\.\/server["']/,
  /from\s+["']\.\/server["']/,
  /from\s+["'][^"']*\/server\/_core\/app["']/,
  /from\s+["'][^"']*\/server\/_core\/static["']/,
];
if (banned.some(pattern => pattern.test(bundled))) {
  console.error("Vercel bundle still contains unresolved server/ ESM imports");
  process.exit(1);
}

console.log("Vercel API bundle ready:", outfile);
