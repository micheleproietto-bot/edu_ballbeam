// Casi di test dell'interprete, condivisi tra C++ (firmware/lib/interp) e JS (web/interp.js).
// `node tests/run.js` genera cases.json da questo file, poi esegue entrambi gli interpreti.
//
// Mondo simulato: orologio virtuale (ms), nessuna fisica. Ogni sleepMs(ms) fa avanzare l'orologio.
// Campi di un caso:
//   prog     programma (lista di istruzioni, come nel protocollo)
//   pos      posizione palla: numero, oppure [[t_ms, cm], ...] a gradini (default 20)
//   stopAt   ms a cui arriva lo STOP (default: mai)
//   expect   { events: [...], finished: bool, end: [min,max] }
//            ogni evento è "testo" oppure ["testo", tMin, tMax]
// Eventi: "servo V", "say V", "setpoint V", "pid KP KI KD", "pid_off", "fail MESSAGGIO".
// Numeri nelle tracce: 4 decimali, zeri finali tolti; "nan", "inf", "-inf".
// Il host di test limita l'angolo a ±20 gradi (e NaN -> 0), setpoint iniziale 20.

const pos = { o: "pos" }, sp = { o: "sp" }, angle = { o: "angle" }, time = { o: "time" };
const v = (n) => ({ o: "var", n });
const bin = (op, a, b) => ({ o: "bin", op, a, b });
const cmp = (op, a, b) => ({ o: "cmp", op, a, b });
const and = (a, b) => ({ o: "and", a, b }), or = (a, b) => ({ o: "or", a, b });
const not = (a) => ({ o: "not", a }), abs = (a) => ({ o: "abs", a });
const servo = (x) => ({ o: "servo", v: x }), wait = (x) => ({ o: "wait", v: x }), say = (x) => ({ o: "say", v: x });
const set = (n, x) => ({ o: "set", n, v: x }), change = (n, x) => ({ o: "change", n, v: x });
const setpoint = (x) => ({ o: "setpoint", v: x });
const pid = (kp, ki, kd) => ({ o: "pid", kp, ki, kd }), pidOff = { o: "pid_off" };
const rep = (n, b) => ({ o: "repeat", n, b }), forever = (b) => ({ o: "forever", b });
const whl = (c, b) => ({ o: "while", c, b }), until = (c) => ({ o: "until", c });
const iff = (c, t, f) => (f ? { o: "if", c, t, f } : { o: "if", c, t });
const says = (...xs) => xs.map(say);
const INF = bin("*", 1e38, 10);              // +infinito in float32
const NAN_ = bin("-", INF, INF);             // NaN

function nested(n, inner) { let p = inner; for (let i = 0; i < n; i++) p = [rep(1, p)]; return p; }

const cases = [
  { name: "servo_basic", prog: [servo(5), servo(-3.5), servo(0)],
    expect: { events: ["servo 5", "servo -3.5", "servo 0"] } },

  { name: "aritmetica", prog: says(
      bin("+", 2, 3), bin("-", 2, 5), bin("*", 4, 2.5), bin("/", 1, 4), bin("/", 5, 0),
      bin("min", 3, 2), bin("max", 3, 2), abs(-7), bin("+", 0.1, 0.2), bin("+", 16777216, 1),
      bin("*", 1.5, 1.5), bin("+", bin("*", 2, 3), bin("-", 10, 4)), { o: "bin", op: "^", a: 2, b: 3 }),
    expect: { events: ["say 5", "say -3", "say 10", "say 0.25", "say 0", "say 2", "say 3", "say 7", "say 0.3",
      "say 16777216", "say 2.25", "say 12", "say 0"] } },

  { name: "float32", prog: says(16777217, 0.1, bin("-", 16777216, 0.5)),
    expect: { events: ["say 16777216", "say 0.1", "say 16777216"] } },

  { name: "confronti_e_logica", prog: says(
      cmp("<", 1, 2), cmp(">", 1, 2), cmp("<=", 2, 2), cmp(">=", 1, 2), cmp("==", 1, 1), cmp("==", 1, 1.00005),
      cmp("==", 1, 1.001), cmp("!=", 1, 2), cmp("!=", 1, 1), and(1, 0), and(2, 3), or(0, 0), or(0, 7), not(0), not(5)),
    expect: { events: ["say 1", "say 0", "say 1", "say 0", "say 1", "say 1", "say 0", "say 1", "say 0",
      "say 0", "say 1", "say 0", "say 1", "say 1", "say 0"] } },

  { name: "nan_nei_confronti", prog: says(cmp("==", NAN_, NAN_), cmp("!=", NAN_, NAN_), cmp("<", NAN_, 1), cmp(">", NAN_, 1)),
    expect: { events: ["say 0", "say 0", "say 0", "say 0"] } },

  { name: "se_altrimenti", prog: [
      iff(cmp("<", 1, 2), [say(1)], [say(2)]),
      iff(cmp(">", 1, 2), [say(1)], [say(2)]),
      iff(0, [say(9)]),
      iff(1, [say(3)]),
      iff(0, [say(8)], []),
      iff(1, [], [say(7)]),
      iff(1, [iff(0, [say(5)], [iff(1, [say(4)])])]),
    ], expect: { events: ["say 1", "say 2", "say 3", "say 4"] } },

  { name: "ripeti", prog: [
      rep(3, [say(1)]), set("n", 0), rep(2, [rep(3, [change("n", 1)])]), say(v("n")),
      rep(0, [say(99)]), rep(-2, [say(99)]), rep(2.9, [say(5)]),
    ], expect: { events: ["say 1", "say 1", "say 1", "say 6", "say 5", "say 5"] } },

  { name: "finche_con_variabile", prog: [
      set("i", 0), whl(cmp("<", v("i"), 3), [change("i", 1), say(v("i"))]), whl(0, [say(99)]),
    ], expect: { events: ["say 1", "say 2", "say 3"] } },

  { name: "attendi_tempo", prog: [until(cmp(">", time, 1)), say(1)],
    expect: { events: [["say 1", 1000, 1010]] } },

  { name: "attendi_posizione", pos: [[0, 30], [500, 10]], prog: [until(cmp("<", pos, 15)), say(7)],
    expect: { events: [["say 7", 500, 510]] } },

  { name: "aspetta_tempi", prog: [servo(1), wait(2), servo(2)],
    expect: { events: [["servo 1", 0, 0], ["servo 2", 2000, 2010]] } },

  { name: "aspetta_limiti", prog: [wait(-5), say(1), wait(0), say(2), wait(NAN_), say(3)],
    expect: { events: [["say 1", 0, 20], ["say 2", 0, 30], ["say 3", 0, 50]] } },

  { name: "aspetta_massimo_3600s", prog: [wait(99999), say(1)],
    expect: { events: [["say 1", 3600000, 3602000]] } },

  { name: "stop_durante_aspetta", stopAt: 3000, prog: [servo(1), wait(10), servo(2)],
    expect: { events: ["servo 1"], finished: false, end: [3000, 3010] } },

  { name: "stop_in_per_sempre", stopAt: 5000, prog: [forever([servo(1), wait(1)])],
    expect: { events: [["servo 1", 0, 5], ["servo 1", 1000, 1010], ["servo 1", 2000, 2015], ["servo 1", 3000, 3020], ["servo 1", 4000, 4025]],
      finished: false, end: [5000, 5010] } },

  { name: "per_sempre_vuoto_non_blocca", stopAt: 100, prog: [forever([])],
    expect: { events: [], finished: false, end: [100, 110] } },

  { name: "stop_in_attendi", stopAt: 500, pos: 10, prog: [until(cmp(">", pos, 100)), say(1)],
    expect: { events: [], finished: false, end: [500, 510] } },

  { name: "stop_in_ripeti_enorme", stopAt: 100, prog: [rep(1000000, [wait(0.01)]), say(1)],
    expect: { events: [], finished: false, end: [100, 110] } },

  { name: "ripeti_1e30_con_stop", stopAt: 100, prog: [rep(1e30, [wait(0.1)]), say(1)],
    expect: { events: [], finished: false, end: [100, 130] } },

  { name: "stop_in_finche", stopAt: 200, prog: [set("a", 1), whl(v("a"), [wait(0.05)])],
    expect: { events: [], finished: false, end: [200, 220] } },

  { name: "variabili", prog: [
      say(v("mai_assegnata")), set("a", 5), change("a", 2.5), say(v("a")),
      set("abcdefghijklmnopq", 5), say(v("abcdefghijklmnoXYZ")),              // 15 byte uguali: stessa variabile
      set("àààààààà", 3), say(v("ààààààààb")),                                 // 8x"à" = 16 byte: troncati a 15
      say(v("àààààààX")),                                                      // 7x"à"+X: diversa
    ], expect: { events: ["say 0", "say 7.5", "say 5", "say 3", "say 0"] } },

  { name: "variabili_massimo_24", prog: [
      ...Array.from({ length: 24 }, (_, i) => set("v" + i, i + 1)),
      set("v24", 99), say(v("v24")), change("v24", 1), say(v("v24")), say(v("v23")), say(v("v0")),
    ], expect: { events: ["say 0", "say 0", "say 24", "say 1"] } },

  { name: "sensori_e_obiettivo", pos: 12.5, prog: [
      say(pos), say(sp), setpoint(150), say(sp), setpoint(-3), say(sp), setpoint(NAN_), setpoint(42.5), say(sp),
      servo(50), say(angle), servo(-50), say(angle), servo(NAN_), say(angle),
      wait(1.5), say(cmp(">=", time, 1.5)), say(cmp("<", time, 1.6)),
    ], expect: { events: ["say 12.5", "say 20", "setpoint 100", "say 100", "setpoint 0", "say 0", "setpoint 0",
      "setpoint 42.5", "say 42.5", "servo 50", "say 20", "servo -50", "say -20", "servo nan", "say 0", "say 1", "say 1"] } },

  { name: "pid", prog: [pid(2, 0, 1), pid(1.5, 0.25, 0), pidOff],
    expect: { events: ["pid 2 0 1", "pid 1.5 0.25 0", "pid_off"] } },

  { name: "annidamento_24_ok", prog: nested(24, [say(1)]),
    expect: { events: ["say 1"] } },

  { name: "annidamento_25_errore", prog: nested(25, [say(1)]),
    expect: { events: ["fail programma troppo annidato"], finished: false } },

  { name: "programma_malformato", prog: [
      say({ o: "bogus" }), say({ o: "cmp", op: "<" }), say("abc"), say(true), say(null), say([1, 2]),
      { o: "zzz" }, 5, null, "x", true, [1],
      { o: "servo" }, say({ o: "bin", op: "+", a: 1 }), say({ o: "var" }),
      { o: "if", c: 1, t: "non-una-lista" }, { o: "repeat", n: 2, b: { o: "say" } }, say(4),
    ], expect: { events: ["say 0", "say 0", "say 0", "say 0", "say 0", "say 0", "servo 0", "say 1", "say 0", "say 4"] } },

  { name: "programma_vuoto", prog: [], expect: { events: [], end: [0, 0] } },
];

module.exports = cases;
