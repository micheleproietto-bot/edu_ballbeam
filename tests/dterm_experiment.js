// Esperimento: vibrazione della trave (jitter dell'angolo) e risposta al gradino per vari stimatori della derivata.
// Rumore realistico del VL53L4CD misurato: dev.std 0.36 cm (uniforme ±0.62), risoluzione 0.1 cm.
const { createSim } = require("../web/sim.js");
function trial(kd, dN, dTau, seed) {
  const tele = [], sim = createSim({ length: 70, x0: 35, noise: 0.62, dN, dTau, onLine: (s) => { const o = JSON.parse(s); if (o.x !== undefined) tele.push(o); } });
  const send = (o) => sim.write(JSON.stringify(o) + "\n");
  const run = (ms) => { for (let t = 0; t < ms; t += 100) { if (t % 500 === 0) send({ c: "ping" }); sim.step(Math.min(100, ms - t)); } };
  send({ c: "tune", on: 1, sp: 35, kp: 1.5, ki: 0, kd });
  run(4000);                                                     // regime: jitter dell'angolo con la palla ferma
  const a = tele.slice(-60).map((p) => p.a), m = a.reduce((x, y) => x + y, 0) / a.length;
  const jitter = Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length);
  const n0 = tele.length; send({ c: "tune", sp: 50 }); run(6000);   // gradino 35 -> 50
  const xs = tele.slice(n0).map((p) => p.x), over = Math.max(...xs) - 50;
  const tSet = (xs.findIndex((x, i) => xs.slice(i).every((y) => Math.abs(y - 50) < 1.5)) * 50) / 1000;
  return { jitter, over, tSet };
}
const variants = [["attuale: 1 camp, tau 40ms", 1, 0.04], ["4 camp, tau 40ms", 4, 0.04], ["4 camp, tau 70ms", 4, 0.07], ["3 camp, tau 80ms", 3, 0.08], ["5 camp, tau 50ms", 5, 0.05]];
for (const kd of [0.6, 1.0]) {
  console.log(`\nKd = ${kd}   (jitter = dev.std angolo a palla ferma, gradi; overshoot cm; assestamento s)`);
  for (const [name, dN, tau] of variants) {
    const rs = [1, 2, 3].map(() => trial(kd, dN, tau));
    const avg = (k) => (rs.reduce((x, r) => x + r[k], 0) / rs.length);
    console.log(`  ${name.padEnd(30)} jitter ${avg("jitter").toFixed(2).padStart(5)}°   overshoot ${avg("over").toFixed(1).padStart(5)}   assest. ${avg("tSet").toFixed(1)}`);
  }
}
