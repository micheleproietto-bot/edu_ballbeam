// Interprete dei programmi a blocchi — gemello di firmware/lib/interp/interp.h.
// La semantica deve restare IDENTICA (stessa suite: tests/cases.json, eseguita su entrambi).
// Differenze solo meccaniche: qui il "sonno" è un `yield <ms>` (generatore), così nel browser
// l'interprete non blocca la pagina. I numeri sono float a 32 bit come sul firmware (Math.fround).
//
// Host: { nowMs(), halted(), pos(), sp(), angle(), servo(v), setpoint(v), pidOn(kp,ki,kd), pidOff(), say(v), fail(msg) }
(function (root) {
  "use strict";
  const f = Math.fround;
  const MAX_VARS = 24, NAME_LEN = 15, MAX_DEPTH = 24;
  const utf8 = new TextEncoder();

  const clampf = (v, lo, hi) => (!(v >= lo) ? lo : v > hi ? hi : v);   // NaN -> lo
  const toCount = (v) => (!(v > 0) ? 0 : v >= 2147483520 ? 2147483647 : Math.trunc(v));
  // chiave variabile = primi 15 BYTE UTF-8 (come strncpy nel firmware)
  const vkey = (n) => Array.prototype.join.call(utf8.encode(String(n)).subarray(0, NAME_LEN), ",");
  const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);

  function createInterp(h) {
    let vars = new Map(), t0 = 0;

    function varRef(n) {                     // restituisce la chiave oppure null se finito lo spazio
      const k = vkey(typeof n === "string" ? n : "x");
      if (vars.has(k)) return k;
      if (vars.size >= MAX_VARS) return null;
      vars.set(k, 0);
      return k;
    }

    function evalE(e) {
      if (typeof e === "number") return f(e);
      if (!isObj(e)) return 0;
      const o = e.o;
      if (o === "pos") return f(h.pos());
      if (o === "sp") return f(h.sp());
      if (o === "angle") return f(h.angle());
      if (o === "time") return f(f((h.nowMs() - t0) >>> 0) / 1000);
      if (o === "var") { const k = varRef(e.n); return k === null ? 0 : vars.get(k); }
      if (o === "not") return evalE(e.a) === 0 ? 1 : 0;
      if (o === "abs") return Math.abs(evalE(e.a));
      const isAnd = o === "and", isOr = o === "or", isBin = o === "bin", isCmp = o === "cmp";
      if (!(isAnd || isOr || isBin || isCmp)) return 0;
      const a = evalE(e.a);
      if (isAnd) return a !== 0 && evalE(e.b) !== 0 ? 1 : 0;
      if (isOr) return a !== 0 || evalE(e.b) !== 0 ? 1 : 0;
      const b = evalE(e.b), op = e.op;
      if (isBin) {
        if (op === "+") return f(a + b);
        if (op === "-") return f(a - b);
        if (op === "*") return f(a * b);
        if (op === "/") return b === 0 ? 0 : f(a / b);
        if (op === "min") return a < b ? a : b;
        if (op === "max") return a > b ? a : b;
      } else {
        if (op === "<") return +(a < b);
        if (op === ">") return +(a > b);
        if (op === "<=") return +(a <= b);
        if (op === ">=") return +(a >= b);
        if (op === "==") return +(Math.abs(f(a - b)) < f(1e-4));
        if (op === "!=") return +(Math.abs(f(a - b)) >= f(1e-4));
      }
      return 0;
    }

    function* waitMs(ms) {
      const t = h.nowMs();
      while (!h.halted() && ((h.nowMs() - t) >>> 0) < ms) yield 5;
    }

    function* execBlock(b, depth) {
      if (!Array.isArray(b)) return;
      for (const s of b) {
        if (h.halted()) return;
        yield* execStmt(s, depth);
        yield 1;
      }
    }

    function* execStmt(s, depth) {
      if (depth > MAX_DEPTH) { h.fail("programma troppo annidato"); return; }
      if (!isObj(s)) return;
      switch (s.o) {
        case "servo": h.servo(evalE(s.v)); break;
        case "wait": yield* waitMs(Math.trunc(f(clampf(evalE(s.v), 0, 3600) * 1000))); break;
        case "setpoint": h.setpoint(clampf(evalE(s.v), 0, 100)); break;
        case "pid": { const kp = evalE(s.kp), ki = evalE(s.ki), kd = evalE(s.kd); h.pidOn(kp, ki, kd); break; }
        case "pid_off": h.pidOff(); break;
        case "set": { const v = evalE(s.v), k = varRef(s.n); if (k !== null) vars.set(k, v); break; }
        case "change": { const v = evalE(s.v), k = varRef(s.n); if (k !== null) vars.set(k, f(vars.get(k) + v)); break; }
        case "say": h.say(evalE(s.v)); break;
        case "if":
          if (evalE(s.c) !== 0) yield* execBlock(s.t, depth + 1); else yield* execBlock(s.f, depth + 1);
          break;
        case "repeat": {
          const n = toCount(evalE(s.n));
          for (let i = 0; i < n && !h.halted(); i++) { yield* execBlock(s.b, depth + 1); yield 1; }
          break;
        }
        case "forever":
          while (!h.halted()) { yield* execBlock(s.b, depth + 1); yield 1; }
          break;
        case "while":
          while (!h.halted() && evalE(s.c) !== 0) { yield* execBlock(s.b, depth + 1); yield 1; }
          break;
        case "until":
          while (!h.halted() && evalE(s.c) === 0) yield 5;
          break;
      }
    }

    return {
      // generatore: ogni `yield ms` chiede di dormire per ms millisecondi
      *run(prog) { vars = new Map(); t0 = h.nowMs(); yield* execBlock(prog, 0); },
    };
  }

  const api = { createInterp, clampf };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.BBInterp = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
