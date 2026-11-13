"use strict";
// =====================================================================
//  BLOCCHI
// =====================================================================
const H = { act: 210, sens: 160, ctl: 20, extra: 290 };
Blockly.common.defineBlocksWithJsonArray([
  { type:"bb_start", message0:"▶ quando premo AVVIA", nextStatement:null, colour:120, tooltip:"Il programma parte da qui." },
  { type:"bb_servo", message0:"inclina la trave a %1 gradi", args0:[{type:"input_value",name:"V",check:"Number"}],
    previousStatement:null, nextStatement:null, colour:H.act, tooltip:"Angolo positivo = la palla rotola verso valori di posizione più grandi (se calibrato)." },
  { type:"bb_wait", message0:"aspetta %1 secondi", args0:[{type:"input_value",name:"V",check:"Number"}],
    previousStatement:null, nextStatement:null, colour:H.act },
  { type:"bb_say", message0:"mostra %1", args0:[{type:"input_value",name:"V"}],
    previousStatement:null, nextStatement:null, colour:H.act, tooltip:"Scrive un valore nei messaggi." },
  { type:"bb_until", message0:"attendi finché %1", args0:[{type:"input_value",name:"C",check:"Boolean"}],
    previousStatement:null, nextStatement:null, colour:H.ctl },
  { type:"bb_forever", message0:"per sempre %1", args0:[{type:"input_statement",name:"DO"}],
    previousStatement:null, colour:H.ctl },
  { type:"bb_setpoint", message0:"obiettivo palla a %1 cm", args0:[{type:"input_value",name:"V",check:"Number"}],
    previousStatement:null, nextStatement:null, colour:H.extra, tooltip:"Dove vuoi che il PID porti la palla (distanza dal sensore)." },
  { type:"bb_pid", message0:"attiva PID  Kp %1  Ki %2  Kd %3",
    args0:[{type:"input_value",name:"KP",check:"Number"},{type:"input_value",name:"KI",check:"Number"},{type:"input_value",name:"KD",check:"Number"}],
    previousStatement:null, nextStatement:null, colour:H.extra, inputsInline:true,
    tooltip:"Il PID resta attivo finché il programma gira. Alla fine del programma la trave torna orizzontale." },
  { type:"bb_pid_off", message0:"disattiva PID", previousStatement:null, nextStatement:null, colour:H.extra },
  { type:"bb_pos", message0:"posizione palla (cm)", output:"Number", colour:H.sens, tooltip:"Distanza della palla dal sensore." },
  { type:"bb_sp", message0:"obiettivo (cm)", output:"Number", colour:H.sens },
  { type:"bb_angle", message0:"angolo trave (gradi)", output:"Number", colour:H.sens },
  { type:"bb_time", message0:"tempo dall'avvio (s)", output:"Number", colour:H.sens },
]);

const num = (n) => ({ shadow: { type: "math_number", fields: { NUM: n } } });
const B = (type, inputs) => (inputs ? { kind:"block", type, inputs } : { kind:"block", type });

function toolboxFor(level) {
  const cats = [];
  cats.push({ kind:"category", name:"Azioni", colour:H.act, contents:[
    B("bb_servo",{V:num(0)}), B("bb_wait",{V:num(1)}), B("bb_say",{V:num(0)}) ]});
  cats.push({ kind:"category", name:"Sensori", colour:H.sens, contents:[
    B("bb_pos"), B("bb_time"), ...(level>=3 ? [B("bb_sp"), B("bb_angle")] : []) ]});
  const ctl = [ B("controls_repeat_ext",{TIMES:num(5)}), B("bb_forever") ];
  if (level>=2) ctl.push(B("controls_whileUntil"), B("bb_until"));
  cats.push({ kind:"category", name:"Cicli", colour:H.ctl, contents:ctl });
  if (level>=2) {
    cats.push({ kind:"category", name:"Logica", colour:210, contents:[
      B("controls_if"), B("logic_compare",{A:num(0),B:num(0)}), B("logic_operation"), B("logic_negate"), B("logic_boolean") ]});
    cats.push({ kind:"category", name:"Operazioni", colour:230, contents:[
      B("math_arithmetic",{A:num(1),B:num(1)}), B("math_single",{NUM:num(0)}) ]});
    cats.push({ kind:"category", name:"Variabili", colour:330, custom:"VARIABLE" });
  }
  cats.push({ kind:"category", name:"Numeri", colour:230, contents:[ B("math_number") ]});
  if (level>=3) {
    cats.push({ kind:"category", name:"Controllo PID", colour:H.extra, contents:[
      B("bb_setpoint",{V:num(20)}), B("bb_pid",{KP:num(2),KI:num(0),KD:num(1)}), B("bb_pid_off") ]});
  }
  return { kind:"categoryToolbox", contents:cats };
}

const ws = Blockly.inject("blocklyDiv", {
  toolbox: toolboxFor(3), renderer:"zelos", trashcan:true, sounds:false,
  zoom:{ controls:true, wheel:true, startScale:1.0, minScale:.5, maxScale:2 },
  grid:{ spacing:25, length:3, colour:"#e3e8ee", snap:true }, move:{ scrollbars:true, drag:true, wheel:false },
});
ws.addChangeListener(Blockly.Events.disableOrphans);

// ---------------- esempi e stato iniziale ----------------
const nb = (n) => ({ block:{ type:"math_number", fields:{ NUM:n } } });
function chain(arr) {                       // arr: [{type, inputs, ...}] -> catena con "next"
  let head = null;
  for (let i = arr.length - 1; i >= 0; i--) head = head ? { ...arr[i], next:{ block:head } } : { ...arr[i] };
  return head;
}
function startWith(blocks) {
  const first = chain(blocks);
  return { blocks:{ languageVersion:0, blocks:[ { type:"bb_start", x:40, y:40, deletable:false, ...(first ? { next:{ block:first } } : {}) } ] } };
}
const EX1 = startWith([
  { type:"bb_setpoint", inputs:{ V:nb(20) } },
  { type:"bb_pid", inputs:{ KP:nb(2), KI:nb(0), KD:nb(1) } },
  { type:"bb_forever", inputs:{ DO:{ block:{ type:"bb_wait", inputs:{ V:nb(0.1) } } } } },
]);
const EX2 = startWith([
  { type:"bb_pid", inputs:{ KP:nb(2), KI:nb(0), KD:nb(1) } },
  { type:"bb_forever", inputs:{ DO:{ block: chain([
      { type:"bb_setpoint", inputs:{ V:nb(12) } }, { type:"bb_wait", inputs:{ V:nb(6) } },
      { type:"bb_setpoint", inputs:{ V:nb(28) } }, { type:"bb_wait", inputs:{ V:nb(6) } } ]) } } },
]);
function loadState(st) {
  Blockly.Events.disable();
  try { Blockly.serialization.workspaces.load(st, ws); } finally { Blockly.Events.enable(); }
  ensureStart(); saveLocal();
}
function ensureStart() {
  if (ws.getBlocksByType("bb_start", false).length === 0) {
    const b = ws.newBlock("bb_start"); b.initSvg(); b.render(); b.moveBy(40,40); b.setDeletable(false);
  }
}
function saveLocal() { try { localStorage.setItem("bb_ws", JSON.stringify(Blockly.serialization.workspaces.save(ws))); } catch(e) {} }
ws.addChangeListener((e) => { if (!e.isUiEvent) saveLocal(); });
(function init() {
  let st = null;
  try { st = JSON.parse(localStorage.getItem("bb_ws") || "null"); } catch(e) {}
  loadState(st || startWith([]));
})();

// =====================================================================
//  GENERATORE: blocchi -> programma JSON
// =====================================================================
class GenError extends Error {}
function expr(block) {
  if (!block) return 0;
  const inp = (n) => expr(block.getInputTargetBlock(n));
  switch (block.type) {
    case "math_number": return Number(block.getFieldValue("NUM"));
    case "logic_boolean": return block.getFieldValue("BOOL") === "TRUE" ? 1 : 0;
    case "bb_pos": return { o:"pos" };
    case "bb_sp": return { o:"sp" };
    case "bb_angle": return { o:"angle" };
    case "bb_time": return { o:"time" };
    case "variables_get": return { o:"var", n:varName(block) };
    case "logic_negate": return { o:"not", a:inp("BOOL") };
    case "logic_operation": return { o: block.getFieldValue("OP")==="AND" ? "and" : "or", a:inp("A"), b:inp("B") };
    case "logic_compare": {
      const m = { EQ:"==", NEQ:"!=", LT:"<", LTE:"<=", GT:">", GTE:">=" };
      return { o:"cmp", op:m[block.getFieldValue("OP")], a:inp("A"), b:inp("B") };
    }
    case "math_arithmetic": {
      const m = { ADD:"+", MINUS:"-", MULTIPLY:"*", DIVIDE:"/" };
      const op = m[block.getFieldValue("OP")];
      if (!op) throw new GenError("Operazione non supportata (usa + − × ÷).");
      return { o:"bin", op, a:inp("A"), b:inp("B") };
    }
    case "math_single": {
      const op = block.getFieldValue("OP");
      if (op === "ABS") return { o:"abs", a:inp("NUM") };
      if (op === "NEG") return { o:"bin", op:"-", a:0, b:inp("NUM") };
      throw new GenError("Operazione non supportata: usa solo valore assoluto o negativo.");
    }
    default: throw new GenError("Blocco non supportato: " + block.type);
  }
}
function varName(b) { return String(b.getField("VAR").getText()).slice(0, 15); }
function chainOf(first) { const out = []; for (let b = first; b; b = b.getNextBlock()) { const s = stmt(b); if (s) out.push(s); } return out; }
function stmt(b) {
  const inp = (n) => expr(b.getInputTargetBlock(n));
  const body = (n) => chainOf(b.getInputTargetBlock(n));
  switch (b.type) {
    case "bb_servo": return { o:"servo", v:inp("V") };
    case "bb_wait": return { o:"wait", v:inp("V") };
    case "bb_say": return { o:"say", v:inp("V") };
    case "bb_setpoint": return { o:"setpoint", v:inp("V") };
    case "bb_pid": return { o:"pid", kp:inp("KP"), ki:inp("KI"), kd:inp("KD") };
    case "bb_pid_off": return { o:"pid_off" };
    case "bb_until": return { o:"until", c:inp("C") };
    case "bb_forever": return { o:"forever", b:body("DO") };
    case "controls_repeat_ext": return { o:"repeat", n:inp("TIMES"), b:body("DO") };
    case "controls_whileUntil": {
      let c = inp("BOOL"); if (b.getFieldValue("MODE") === "UNTIL") c = { o:"not", a:c };
      return { o:"while", c, b:body("DO") };
    }
    case "controls_if": {
      let n = 0; while (b.getInput("IF" + n)) n++;
      let els = b.getInput("ELSE") ? body("ELSE") : [];
      for (let i = n - 1; i >= 0; i--) {
        const node = { o:"if", c:inp("IF" + i), t:body("DO" + i) };
        if (els.length) node.f = els;
        els = [node];
      }
      return els[0];
    }
    case "variables_set": return { o:"set", n:varName(b), v:inp("VALUE") };
    case "math_change": return { o:"change", n:varName(b), v:inp("DELTA") };
    default: throw new GenError("Blocco non supportato: " + b.type);
  }
}
function buildProgram() {
  const starts = ws.getBlocksByType("bb_start", true);
  if (!starts.length) throw new GenError("Manca il blocco “quando premo AVVIA”.");
  return chainOf(starts[0].getNextBlock());
}

// =====================================================================
//  USB (Web Serial)
// =====================================================================
const $ = (id) => document.getElementById(id);
let port = null, writer = null, reader = null, pingTimer = null, connected = false, running = false, sensorOk = false;
const enc = new TextEncoder();

function logLine(text, cls) {
  const d = document.createElement("div"); if (cls) d.className = cls; d.textContent = text;
  const L = $("log"); L.appendChild(d); while (L.childNodes.length > 200) L.removeChild(L.firstChild); L.scrollTop = L.scrollHeight;
}
function say(text, isErr) { const m = $("msg"); m.textContent = text || ""; m.className = isErr ? "err" : ""; }
function refreshUi() {
  $("connBadge").textContent = connected ? "connesso" : "non connesso"; $("connBadge").className = "badge " + (connected ? "ok" : "");
  $("sensorBadge").textContent = connected ? (sensorOk ? "sensore OK" : "sensore ?") : "sensore ?";
  $("sensorBadge").className = "badge " + (connected ? (sensorOk ? "ok" : "bad") : "");
  $("btnConnect").textContent = connected ? "Disconnetti" : "Connetti USB";
  $("btnRun").disabled = !connected || running; $("btnStop").disabled = !connected;
  $("tryAngle").disabled = !connected || running;
}
async function sendRaw(str) {
  const data = enc.encode(str);
  for (let i = 0; i < data.length; i += 128) {           // a pezzi, per non saturare il buffer dell'ESP32
    await writer.write(data.slice(i, i + 128));
    if (data.length > 128) await new Promise((r) => setTimeout(r, 8));
  }
}
async function send(obj) { if (!writer) return; try { await sendRaw(JSON.stringify(obj) + "\n"); } catch (e) { logLine("Errore invio: " + e.message, "err"); } }

async function connect() {
  if (!("serial" in navigator)) { say("Questo browser non supporta l'USB. Usa Chrome o Edge.", true); return; }
  try {
    port = await navigator.serial.requestPort();
    await port.open({ baudRate:115200 });
  } catch (e) { say("Connessione annullata: " + e.message, true); port = null; return; }
  writer = port.writable.getWriter(); connected = true; sensorOk = false; say("");
  refreshUi(); readLoop();
  setTimeout(() => send({ c:"hello" }), 1800);             // l'ESP32 può riavviarsi all'apertura della porta
  pingTimer = setInterval(() => send({ c:"ping" }), 500);
}
async function disconnect() {
  clearInterval(pingTimer); pingTimer = null;
  try { await send({ c:"stop" }); } catch (e) {}
  try { if (reader) await reader.cancel(); } catch (e) {}
  try { if (writer) { writer.releaseLock(); } } catch (e) {}
  try { if (port) await port.close(); } catch (e) {}
  port = writer = reader = null; connected = false; running = false; refreshUi();
}
async function readLoop() {
  reader = port.readable.getReader(); const dec = new TextDecoder(); let buf = "";
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream:true });
      let i; while ((i = buf.indexOf("\n")) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line[0] === "{") handleLine(line); }
      if (buf.length > 20000) buf = "";
    }
  } catch (e) { logLine("Porta chiusa: " + e.message, "err"); }
  try { reader.releaseLock(); } catch (e) {}
  if (connected) { clearInterval(pingTimer); connected = false; running = false; port = writer = reader = null; say("Cavo scollegato.", true); refreshUi(); }
}

// ---------------- messaggi dall'ESP32 ----------------
const hist = []; let lastSp = null;
function handleLine(line) {
  let o; try { o = JSON.parse(line); } catch (e) { return; }
  if (o.e) {
    if (o.e === "hello") { logLine("ESP32 pronto (fw " + o.fw + ")", "info"); }
    else if (o.e === "err") { logLine("⚠ " + o.m, "err"); say(o.m, true); }
    else if (o.e === "log") { logLine("→ " + (+o.v).toFixed(2), "info"); }
    else if (o.e === "done") { logLine("Programma finito.", "info"); }
    return;
  }
  if (o.x === undefined) return;
  sensorOk = !!o.ok; const wasRunning = running; running = !!o.run;
  if (wasRunning !== running || $("sensorBadge").textContent !== (sensorOk ? "sensore OK" : "sensore ?")) refreshUi();
  hist.push({ t:o.t, x:+o.x, sp:+o.sp, a:+o.a, pid:o.pid, ok:o.ok }); if (hist.length > 220) hist.shift();
  $("vPos").textContent = o.ok ? (+o.x).toFixed(1) : "–"; $("vSp").textContent = o.pid ? (+o.sp).toFixed(1) : "–"; $("vAng").textContent = (+o.a).toFixed(1);
  lastSp = o.pid ? +o.sp : null;
}

// ---------------- grafico ----------------
const cv = $("chart"), cx = cv.getContext("2d");
function drawChart() {
  const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== w * dpr || cv.height !== h * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
  cx.setTransform(dpr, 0, 0, dpr, 0, 0); cx.clearRect(0, 0, w, h);
  const len = Math.max(10, +$("cLen").value || 40), lim = Math.max(1, +$("cLimit").value || 20);
  const padL = 34, padR = 6, topH = h * 0.62, gap = 14, botY = topH + gap, botH = h - botY - 4;
  const style = getComputedStyle(document.documentElement);
  const col = (n) => style.getPropertyValue(n).trim();
  cx.font = "11px system-ui"; cx.fillStyle = "#6b7785"; cx.strokeStyle = "#e3e8ee"; cx.lineWidth = 1;
  const yP = (v) => 6 + (topH - 12) * (1 - Math.min(Math.max(v, 0), len) / len);
  for (let i = 0; i <= 4; i++) { const v = len * i / 4, y = yP(v); cx.beginPath(); cx.moveTo(padL, y); cx.lineTo(w - padR, y); cx.stroke(); cx.fillText(v.toFixed(0), 4, y + 4); }
  const yA = (v) => botY + botH * (1 - (Math.min(Math.max(v, -lim), lim) + lim) / (2 * lim));
  cx.beginPath(); cx.moveTo(padL, yA(0)); cx.lineTo(w - padR, yA(0)); cx.stroke(); cx.fillText("0°", 4, yA(0) + 4);
  cx.fillText("+" + lim, 4, botY + 8); cx.fillText("−" + lim, 4, botY + botH);
  if (hist.length < 2) return;
  const t1 = hist[hist.length - 1].t, win = 10000, xT = (t) => padL + (w - padL - padR) * (1 - (t1 - t) / win);
  const line = (key, color, yf, dash, valid) => {
    cx.beginPath(); cx.strokeStyle = color; cx.lineWidth = 2; cx.setLineDash(dash || []); let pen = false;
    for (const p of hist) { if (t1 - p.t > win || (valid && !valid(p))) { pen = false; continue; } const x = xT(p.t), y = yf(p[key]); if (!pen) { cx.moveTo(x, y); pen = true; } else cx.lineTo(x, y); }
    cx.stroke(); cx.setLineDash([]);
  };
  line("sp", col("--sp"), yP, [6, 4], (p) => p.pid);
  line("x", col("--pos"), yP, null, (p) => p.ok);
  line("a", col("--ang"), yA);
}
(function loop() { drawChart(); requestAnimationFrame(loop); })();

// =====================================================================
//  AZIONI
// =====================================================================
function cfgObj() { return { c:"cfg", center:+$("cCenter").value, limit:+$("cLimit").value, inv:$("cInv").checked ? 1 : 0 }; }
async function run() {
  let prog; try { prog = buildProgram(); } catch (e) { say(e.message, true); return; }
  if (!prog.length) { say("Il programma è vuoto: aggiungi blocchi sotto “quando premo AVVIA”.", true); return; }
  const line = JSON.stringify({ c:"prog", p:prog });
  if (line.length > 11000) { say("Programma troppo grande: usa meno blocchi.", true); return; }
  say(""); hist.length = 0;
  await send(cfgObj()); await new Promise((r) => setTimeout(r, 100));
  await sendRaw(line + "\n"); await new Promise((r) => setTimeout(r, 150));
  await send({ c:"run" }); logLine("Avvio programma (" + line.length + " byte)", "info");
}
$("btnConnect").onclick = () => (connected ? disconnect() : connect());
$("btnRun").onclick = run;
$("btnStop").onclick = () => { send({ c:"stop" }); say(""); };
$("tryAngle").oninput = (e) => { $("tryVal").textContent = e.target.value; if (!running) send({ c:"angle", v:+e.target.value }); };
for (const id of ["cCenter", "cLimit", "cInv"]) $(id).onchange = () => {
  const l = Math.min(35, Math.max(1, +$("cLimit").value || 20)); $("cLimit").value = l; $("tryAngle").min = -l; $("tryAngle").max = l;
  try { localStorage.setItem("bb_cfg", JSON.stringify({ c:$("cCenter").value, l:$("cLimit").value, i:$("cInv").checked, n:$("cLen").value })); } catch (e) {}
  if (connected && !running) send(cfgObj());
};
$("cLen").onchange = $("cCenter").onchange;
try { const s = JSON.parse(localStorage.getItem("bb_cfg") || "null"); if (s) { $("cCenter").value = s.c; $("cLimit").value = s.l; $("cInv").checked = s.i; $("cLen").value = s.n; $("tryAngle").min = -s.l; $("tryAngle").max = s.l; } } catch (e) {}

$("level").onchange = (e) => ws.updateToolbox(toolboxFor(+e.target.value));
$("btnExample1").onclick = () => loadState(EX1);
$("btnExample2").onclick = () => loadState(EX2);
$("btnNew").onclick = () => { if (confirm("Cancellare il programma attuale?")) loadState(startWith([])); };
$("btnSave").onclick = () => {
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(Blockly.serialization.workspaces.save(ws))], { type:"application/json" }));
  a.download = "ball-beam-programma.json"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$("btnLoad").onclick = () => $("fileIn").click();
$("fileIn").onchange = async (e) => { const f = e.target.files[0]; if (!f) return; try { loadState(JSON.parse(await f.text())); } catch (err) { say("File non valido.", true); } e.target.value = ""; };
window.addEventListener("resize", () => Blockly.svgResize(ws));
window.addEventListener("beforeunload", () => { if (connected) send({ c:"stop" }); });
refreshUi();
