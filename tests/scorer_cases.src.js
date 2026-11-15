// Casi di test del punteggio della competizione (C++ firmware/lib/scorer/scorer.h e JS web/scorer.js).
// runs: [[quanti_campioni, valid(1/0), errore_cm], ...] — un campione ogni 50 ms, 120 campioni = 1 finestra (6 s).
// expect: windows (10 valori), points (totale), mae (errore medio, cm), ticks, closed (finestre completate, in ordine).
// Valori attesi calcolati a mano dalle regole: "dentro" = misura recente E errore <= 2.0 cm; finestra = dentro/120.
const all10 = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const ones = (n) => new Array(n).fill(1), zeros = (n) => new Array(n).fill(0);

module.exports = [
  { name: "tutto_dentro", runs: [[1200, 1, 0]], expect: { windows: ones(10), points: 10, mae: 0, ticks: 1200, closed: all10 } },
  { name: "tutto_fuori_banda", runs: [[1200, 1, 2.5]], expect: { windows: zeros(10), points: 0, mae: 2.5, ticks: 1200, closed: all10 } },
  { name: "bordo_banda_incluso_2.0", runs: [[1200, 1, 2.0]], expect: { windows: ones(10), points: 10, mae: 2, ticks: 1200, closed: all10 } },
  { name: "appena_fuori_2.01", runs: [[1200, 1, 2.01]], expect: { windows: zeros(10), points: 0, mae: 2.01, ticks: 1200, closed: all10 } },
  { name: "palla_non_vista_conta_fuori", runs: [[1200, 0, 0]], expect: { windows: zeros(10), points: 0, mae: 35, ticks: 1200, closed: all10 } },
  { name: "finestra_a_meta", runs: [[60, 1, 0], [60, 1, 5], [1080, 1, 0]],
    expect: { windows: [0.5, ...ones(9)], points: 9.5, mae: 0.25, ticks: 1200, closed: all10 } },
  { name: "interrotta_dopo_150_campioni", runs: [[150, 1, 0]],
    expect: { windows: [1, 0.25, ...zeros(8)], points: 1.25, mae: 0, ticks: 150, closed: [0] } },
  { name: "oltre_i_60_secondi_non_conta", runs: [[1300, 1, 0]], expect: { windows: ones(10), points: 10, mae: 0, ticks: 1200, closed: all10 } },
  { name: "misto_validi_e_non_vista", runs: [[30, 1, 1], [30, 0, 0], [60, 1, 3]],
    expect: { windows: [0.25, ...zeros(9)], points: 0.25, mae: 10.5, ticks: 120, closed: [0] } },
  { name: "finestre_diverse", runs: [[120, 1, 0], [90, 1, 1], [30, 1, 9], [960, 1, 9]],
    expect: { windows: [1, 0.75, ...zeros(8)], points: 1.75, mae: 7.5, ticks: 1200, closed: all10 } },
  { name: "nessun_campione", runs: [], expect: { windows: zeros(10), points: 0, mae: 0, ticks: 0, closed: [] } },
];
