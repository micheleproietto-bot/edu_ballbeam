#!/usr/bin/env node
// Esegue la suite sull'interprete JS e su quello C++ e controlla:
//   1) ogni traccia coincide con l'atteso scritto a mano in cases.src.js
//   2) le tracce JS e C++ sono IDENTICHE (eventi, tempi, fine)
// Uso:  node tests/run.js [--no-cpp]
// Compilatore C++: variabile CXX (es. CXX="python -m ziglang c++"), altrimenti c++/g++/clang++.
// ArduinoJson: cartella con ArduinoJson.h in ARDUINOJSON_DIR, altrimenti firmware/.pio/libdeps/*/ArduinoJson/src
"use strict";
const fs = require("fs"), path = require("path"), cp = require("child_process");
const root = path.resolve(__dirname, "..");
const { createInterp, clampf } = require(path.join(root, "web", "interp.js"));
const cases = require("./cases.src.js");

fs.writeFileSync(path.join(__dirname, "cases.json"), "[\n" + cases.map((c) => JSON.stringify(c)).join(",\n") + "\n]\n", "utf8");

function fmt(x) {
  if (Number.isNaN(x)) return "nan";
  if (!Number.isFinite(x)) return x > 0 ? "inf" : "-inf";
  let s = x.toFixed(4);
  if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, "");
  return s === "-0" ? "0" : s;
}

function runJs(c) {
  const st = { clock: 0, sp: 20, ang: 0, stopped: false, sawHalt: false, ev: [] };
  const stopAt = c.stopAt === undefined ? Infinity : c.stopAt, maxMs = 10000000;
  const steps = Array.isArray(c.pos) ? c.pos : [[0, c.pos === undefined ? 20 : c.pos]];
  const add = (s) => st.ev.push([s, st.clock]);
  const host = {
    nowMs: () => st.clock,
    halted: () => { const h = st.stopped || st.clock >= stopAt || st.clock >= maxMs; if (h) st.sawHalt = true; return h; },
    pos: () => { let v = steps[0][1]; for (const [t, x] of steps) if (t <= st.clock) v = x; return Math.fround(v); },
    sp: () => st.sp, angle: () => st.ang,
    servo: (d) => { add("servo " + fmt(d)); st.ang = Number.isNaN(d) ? 0 : clampf(d, -20, 20); },
    setpoint: (v) => { add("setpoint " + fmt(v)); st.sp = v; },
    pidOn: (a, b, d) => add("pid " + fmt(a) + " " + fmt(b) + " " + fmt(d)),
    pidOff: () => add("pid_off"),
    say: (v) => add("say " + fmt(v)),
    fail: (m) => { add("fail " + m); st.stopped = true; },
  };
  const it = createInterp(host).run(c.prog);
  for (let r = it.next(); !r.done; r = it.next()) st.clock += r.value;
  return { name: c.name, finished: !(st.sawHalt || st.stopped), end: st.clock, events: st.ev };
}

function findCxx() {
  const cands = process.env.CXX ? [process.env.CXX] : ["c++", "g++", "clang++"];
  for (const c of cands) {
    const [cmd, ...args] = c.split(/\s+/);
    const r = cp.spawnSync(cmd, [...args, "--version"], { encoding: "utf8" });
    if (!r.error && r.status === 0) return [cmd, ...args];
  }
  return null;
}
function findJson() {
  if (process.env.ARDUINOJSON_DIR) return process.env.ARDUINOJSON_DIR;
  const base = path.join(root, "firmware", ".pio", "libdeps");
  if (fs.existsSync(base)) for (const d of fs.readdirSync(base)) {
    const p = path.join(base, d, "ArduinoJson", "src");
    if (fs.existsSync(path.join(p, "ArduinoJson.h"))) return p;
  }
  return null;
}
function runCpp() {
  const cxx = findCxx(), aj = findJson();
  if (!cxx || !aj) { console.log("! C++ saltato (" + (!cxx ? "nessun compilatore: imposta CXX" : "ArduinoJson non trovato: esegui 'pio run' in firmware/") + ")"); return null; }
  const outDir = path.join(root, "tests", "build"); fs.mkdirSync(outDir, { recursive: true });
  const exe = path.join(outDir, "host_runner" + (process.platform === "win32" ? ".exe" : ""));
  const [cmd, ...args] = cxx;
  const b = cp.spawnSync(cmd, [...args, "-std=c++17", "-O1", "-Wall", "-Wextra", "-I" + path.join(root, "firmware", "lib", "interp"), "-I" + aj,
    path.join(__dirname, "host_runner.cpp"), "-o", exe], { encoding: "utf8" });
  if (b.status !== 0) { console.log(b.stdout + b.stderr); throw new Error("compilazione C++ fallita"); }
  if (b.stderr) console.log(b.stderr);
  const r = cp.spawnSync(exe, [path.join(__dirname, "cases.json")], { encoding: "utf8", maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error("host_runner: " + r.stderr);
  return r.stdout.trim().split("\n").map((l) => JSON.parse(l));
}

function check(c, got) {          // confronta con l'atteso scritto a mano; ritorna lista di problemi
  const bad = [], e = c.expect, ev = e.events || [];
  if (got.events.length !== ev.length) bad.push(`eventi: attesi ${ev.length}, ottenuti ${got.events.length}: ${JSON.stringify(got.events.map((x) => x[0]))}`);
  else ev.forEach((x, i) => {
    const [txt, lo, hi] = Array.isArray(x) ? x : [x];
    const [gt, tt] = got.events[i];
    if (gt !== txt) bad.push(`evento ${i}: atteso "${txt}", ottenuto "${gt}"`);
    else if (lo !== undefined && (tt < lo || tt > hi)) bad.push(`evento ${i} ("${txt}") a t=${tt}, atteso in [${lo},${hi}]`);
  });
  const fin = e.finished === undefined ? true : e.finished;
  if (got.finished !== fin) bad.push(`finished: atteso ${fin}, ottenuto ${got.finished}`);
  if (e.end && (got.end < e.end[0] || got.end > e.end[1])) bad.push(`fine a t=${got.end}, attesa in [${e.end}]`);
  return bad;
}

const js = cases.map(runJs);
const cpp = process.argv.includes("--no-cpp") ? null : runCpp();
let fails = 0;
cases.forEach((c, i) => {
  const probs = check(c, js[i]).map((p) => "JS:  " + p);
  if (cpp) {
    probs.push(...check(c, cpp[i]).map((p) => "C++: " + p));
    if (JSON.stringify(js[i]) !== JSON.stringify(cpp[i]) ) probs.push("JS e C++ DIVERGONO:\n   JS : " + JSON.stringify(js[i]) + "\n   C++: " + JSON.stringify(cpp[i]));
  }
  console.log((probs.length ? "FAIL " : "ok   ") + c.name);
  probs.forEach((p) => console.log("     " + p));
  if (probs.length) fails++;
});
console.log(fails ? `\n${fails} casi falliti su ${cases.length}` : `\ntutti i ${cases.length} casi passano` + (cpp ? " (JS e C++ identici)" : " (solo JS)"));
process.exit(fails ? 1 : 0);
