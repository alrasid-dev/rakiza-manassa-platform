#!/usr/bin/env node
/**
 * تشخيص حي داخل متصفح حقيقي (Chrome DevTools Protocol):
 * يفتح الصفحة المنشورة، يجمع أخطاء الكونسول والاستثناءات غير المعالَجة،
 * ويطبع حالة DOM النهائية (هل الشاشة بيضاء؟).
 *
 * الاستخدام:
 *   node scripts/diagnose-live-browser.mjs [url] [waitMs]
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve as resolvePath } from "node:path";

const URL_TO_CHECK = process.argv[2] || process.env.RAKIZA_BASE_URL || "https://rakiza-manassa-platform.vercel.app/";
const WAIT_MS = Number(process.argv[3] || process.env.RAKIZA_WAIT_MS || 18000);
const PORT = Number(process.env.RAKIZA_CDP_PORT || 9333);
const REPORT_PATH = resolvePath(process.env.RAKIZA_REPORT || "browser-diag-report.json");

const CANDIDATES = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);

const chromePath = CANDIDATES.find(path => existsSync(path));
if (!chromePath) {
  console.error("لم يُعثر على متصفح Chrome/Edge للتشخيص.");
  process.exit(2);
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const ATTACH_ONLY = process.env.RAKIZA_ATTACH === "1";
const profileDir = mkdtempSync(join(tmpdir(), "rakiza-cdp-"));

const chrome = ATTACH_ONLY ? null : spawn(chromePath, [
  "--headless=new",
  "--disable-gpu",
  "--no-sandbox",
  "--no-first-run",
  "--disable-extensions",
  "--disable-background-networking",
  `--user-data-dir=${profileDir}`,
  `--remote-debugging-port=${PORT}`,
  "--remote-allow-origins=*",
  "about:blank",
], { stdio: "ignore", windowsHide: true });

function shutdown(code) {
  try { chrome?.kill(); } catch { /* تجاهل */ }
  try { rmSync(profileDir, { recursive: true, force: true }); } catch { /* تجاهل */ }
  // لا نستخدم process.exit مباشرةً: قد يقطع الكتابة المعلّقة على stdout عند إعادة التوجيه لملف.
  process.exitCode = code;
  setTimeout(() => process.exit(code), 1500).unref();
}

async function waitForDevTools() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/version`, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return await response.json();
    } catch { /* لم يجهز بعد */ }
    await sleep(500);
  }
  throw new Error("لم يستجب Chrome على منفذ التنقيح.");
}

async function openTarget(url) {
  try {
    const response = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`, { method: "PUT", signal: AbortSignal.timeout(5000) });
    if (response.ok) return await response.json();
  } catch { /* نعود لقائمة الأهداف */ }
  const list = await fetch(`http://127.0.0.1:${PORT}/json/list`, { signal: AbortSignal.timeout(5000) });
  const targets = await list.json();
  const page = targets.find(item => item.type === "page");
  if (!page) throw new Error("لا يوجد تبويب متاح للتنقيح.");
  return page;
}

function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  const listeners = new Set();

  socket.addEventListener("message", event => {
    const message = JSON.parse(typeof event.data === "string" ? event.data : String(event.data));
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
      return;
    }
    if (message.method) listeners.forEach(listener => listener(message));
  });

  const ready = new Promise((resolve, reject) => {
    socket.addEventListener("open", () => resolve());
    socket.addEventListener("error", () => reject(new Error("فشل اتصال WebSocket بالمنفّذ.")));
  });


function summarize(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text && text.length > 400 ? `${text.slice(0, 400)}…` : text;
}

const findings = { exceptions: [], consoleErrors: [], logErrors: [], requests: new Map() };

async function main() {
  const version = await waitForDevTools();
  console.log(`المتصفح: ${version.Browser}`);
  const target = await openTarget("about:blank");
  const client = connect(target.webSocketDebuggerUrl);
  await client.ready;

  client.on(message => {
    if (message.method === "Runtime.exceptionThrown") {
      const details = message.params.exceptionDetails;
      findings.exceptions.push({
        text: details.exception?.description || details.text,
        url: details.url,
        line: details.lineNumber,
      });
    }
    if (message.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(message.params.type)) {
      findings.consoleErrors.push({
        type: message.params.type,
        text: message.params.args.map(arg => arg.description ?? arg.value ?? arg.type).join(" "),
      });
    }
    if (message.method === "Log.entryAdded" && message.params.entry.level === "error") {
      findings.logErrors.push({ text: message.params.entry.text, url: message.params.entry.url });
    }
    if (message.method === "Network.responseReceived") {
      const { response, type } = message.params;
      findings.requests.set(response.url, { url: response.url, type, status: response.status, mime: response.mimeType });
    }
    if (message.method === "Network.loadingFailed") {
      findings.logErrors.push({ text: `loadingFailed: ${message.params.errorText}`, url: message.params.requestId });
    }
  });

  await Promise.all([
    client.send("Runtime.enable"),
    client.send("Log.enable"),
    client.send("Page.enable"),
    client.send("Network.enable"),
  ]);

  console.log(`فتح: ${URL_TO_CHECK}`);
  await client.send("Page.navigate", { url: URL_TO_CHECK });
  await sleep(WAIT_MS);

  const probe = await client.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const root = document.getElementById("root");
      return {
        title: document.title,
        readyState: document.readyState,
        rootExists: Boolean(root),
        rootHtmlLength: root ? root.innerHTML.length : -1,
        bodyTextLength: document.body ? document.body.innerText.length : -1,
        bodyText: document.body ? document.body.innerText.slice(0, 240) : "",
        scripts: Array.from(document.scripts).map(s => ({ src: s.src || "(inline)", type: s.type, len: (s.textContent || "").length })),
        stylesheets: Array.from(document.styleSheets).map(s => s.href || "(inline)"),
      };
    })()`,
  });

  console.log("\n=== حالة DOM ===");
  console.log(JSON.stringify(probe.result.value, null, 2));
  console.log("\n=== استثناءات غير معالَجة ===");
  console.log(findings.exceptions.length ? JSON.stringify(findings.exceptions, null, 2) : "لا شيء");
  console.log("\n=== أخطاء الكونسول ===");
  console.log(findings.consoleErrors.length ? JSON.stringify(findings.consoleErrors, null, 2) : "لا شيء");
  console.log("\n=== سجل أخطاء المستعرض ===");
  console.log(findings.logErrors.length ? JSON.stringify(findings.logErrors, null, 2) : "لا شيء");

  const interesting = [...findings.requests.values()].filter(item => !item.url.includes("fonts.g"));
  console.log("\n=== الشبكة (HTML/JS/API) ===");
  console.log(JSON.stringify(interesting.slice(0, 40), null, 2));

  const blank = probe.result.value?.rootHtmlLength === 0;
  console.log(`\nالنتيجة: ${blank ? "شاشة بيضاء — #root فارغ" : "الصفحة رسمت محتوى"}`);
  for (const item of findings.exceptions) console.log(`سبب مرشّح: ${summarize(item.text)}`);

  writeFileSync(REPORT_PATH, JSON.stringify({
    url: URL_TO_CHECK,
    checkedAt: new Date().toISOString(),
    dom: probe.result.value,
    blank,
    exceptions: findings.exceptions,
    consoleErrors: findings.consoleErrors,
    logErrors: findings.logErrors,
    network: [...findings.requests.values()].filter(item => !item.url.includes("fonts.g")),
  }, null, 2), "utf8");
  client.close();
  return blank ? 1 : 0;
}

main()
  .then(code => shutdown(code))
  .catch(error => {
    console.error(`فشل التشخيص: ${error.message}`);
    shutdown(3);
  });

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });

  return { ready, send, on: listener => listeners.add(listener), close: () => socket.close() };
}
