#!/usr/bin/env node
// Punteggio della competizione: atteso scritto a mano + JS e C++ devono dare gli stessi numeri.
// Uso: node tests/scorer_test.js [--no-cpp]    (compilatore e ArduinoJson come per tests/run.js: CXX, ARDUINOJSON_DIR)
"use strict";
const fs = require("fs"), path = require("path"), cp = require("child_process");
const root = path.resolve(__dirname, "..");
const { Scorer } = require(path.join(root, "web", "scorer.js"));
const cases = require("./scorer_cases.src.js");
fs.writeFileSync(path.join(__dirname, "scorer_cases.json"), "[\n" + cases.map((c) => JSON.stringify({ name: c.name, runs: c.runs })).join(",\n") + "\n]\n", "utf8");

function runJs(c) {
  const s = new Scorer(), closed = [];
  for (const [n, valid, err] of c.runs) for (let i = 0; i < n; i++) { const w = s.tick(!!valid, err); if (w >= 0) closed.push(w); }
  return { name: c.name, windows: Array.from({ length: 10 }, (_, w) => s.windowPoints(w)), points: s.points(), mae: s.mae(), ticks: s.ticks, closed };
}
function findCxx() {
  for (const c of process.env.CXX ? [process.env.CXX] : ["c++", "g++", "clang++"]) {
    const [cmd, ...args] = c.split(/\s+/); const r = cp.spawnSync(cmd, [...args, "--version"], { encoding: "utf8" });
    if (!r.error && r.status === 0) return [cmd, ...args];
  }
  return null;
}
function findJson() {
  if (process.env.ARDUINOJSON_DIR) return process.env.ARDUINOJSON_DIR;
  const base = path.join(root, "firmware", ".pio", "libdeps");
  if (fs.existsSync(base)) for (const d of fs.readdirSync(base)) { const p = path.join(base, d, "ArduinoJson", "src"); if (fs.existsSync(path.join(p, "ArduinoJson.h"))) return p; }
  return null;
}
function runCpp() {
  const cxx = findCxx(), aj = findJson();
  if (!cxx || !aj) { console.log("! C++ saltato (compilatore o ArduinoJson non trovati)"); return null; }
  const out = path.join(root, "tests", "build"); fs.mkdirSync(out, { recursive: true });
  const exe = path.join(out, "scorer_runner" + (process.platform === "win32" ? ".exe" : "")), [cmd, ...args] = cxx;
  const b = cp.spawnSync(cmd, [...args, "-std=c++17", "-O1", "-Wall", "-Wextra", "-I" + path.join(root, "firmware", "lib", "scorer"), "-I" + aj, path.join(__dirname, "scorer_runner.cpp"), "-o", exe], { encoding: "utf8" });
  if (b.status !== 0) { console.log(b.stdout + b.stderr); throw new Error("compilazione C++ fallita"); }
  const r = cp.spawnSync(exe, [path.join(__dirname, "scorer_cases.json")], { encoding: "utf8" });
  if (r.status !== 0) throw new Error("scorer_runner: " + r.stderr);
  return r.stdout.trim().split("\n").map((l) => JSON.parse(l));
}

const near = (a, b) => Math.abs(a - b) < 1e-4;
function check(c, g) {
  const e = c.expect, bad = [];
  e.windows.forEach((v, i) => { if (!near(g.windows[i], v)) bad.push(`finestra ${i}: attesa ${v}, ottenuta ${g.windows[i]}`); });
  if (!near(g.points, e.points)) bad.push(`punti: attesi ${e.points}, ottenuti ${g.points}`);
  if (!near(g.mae, e.mae)) bad.push(`errore medio: atteso ${e.mae}, ottenuto ${g.mae}`);
  if (g.ticks !== e.ticks) bad.push(`campioni: attesi ${e.ticks}, ottenuti ${g.ticks}`);
  if (JSON.stringify(g.closed) !== JSON.stringify(e.closed)) bad.push(`finestre chiuse: attese ${JSON.stringify(e.closed)}, ottenute ${JSON.stringify(g.closed)}`);
  return bad;
}
const js = cases.map(runJs), cpp = process.argv.includes("--no-cpp") ? null : runCpp();
let fails = 0;
cases.forEach((c, i) => {
  const probs = check(c, js[i]).map((p) => "JS:  " + p);
  if (cpp) {
    probs.push(...check(c, cpp[i]).map((p) => "C++: " + p));
    const a = js[i], b = cpp[i];
    if (!near(a.points, b.points) || !near(a.mae, b.mae) || a.ticks !== b.ticks || JSON.stringify(a.closed) !== JSON.stringify(b.closed) || a.windows.some((v, k) => !near(v, b.windows[k]))) probs.push("JS e C++ DIVERGONO");
  }
  console.log((probs.length ? "FAIL " : "ok   ") + c.name); probs.forEach((p) => console.log("     " + p)); if (probs.length) fails++;
});
console.log(fails ? `\n${fails} casi falliti` : `\ntutti i ${cases.length} casi del punteggio passano` + (cpp ? " (JS e C++ identici)" : " (solo JS)"));
process.exit(fails ? 1 : 0);
