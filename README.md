# Ball & Beam a blocchi

Sistema didattico: editor a blocchi nel browser (Chrome/Edge) che comanda un ball & beam
con ESP32 + sensore VL53L4CD + servo, via USB. Interfaccia e messaggi in italiano.

| Cartella | Contenuto |
|---|---|
| `PROTOCOLLO.md` | Protocollo JSON a righe browser ↔ ESP32 (fonte di verità) |
| `firmware/` | PlatformIO. `lib/interp/interp.h` = interprete (indipendente dall'hardware), `src/main.cpp` = task di controllo, sicurezze, seriale |
| `web/` | `app.html` + `app.js` + `interp.js` + `sim.js` → `build.py` → **`ball-beam-blocchi.html`** (file unico, offline) |
| `tests/` | Suite dell'interprete (stessi casi su C++ e JS) e scenari del simulatore |

## Provare senza hardware
Apri `web/ball-beam-blocchi.html` e premi **Simulazione**.

## Rigenerare la pagina
```
cd web && npm install blockly --prefix build   # una volta
python build.py                                # usa build/node_modules/blockly
```

## Test
```
cd firmware && pio run          # compila e scarica ArduinoJson (serve anche ai test C++)
node tests/run.js               # interprete: atteso a mano + JS e C++ devono essere identici
node tests/sim_test.js          # simulatore: protocollo, sicurezze, fisica, PID
```
`run.js` compila `tests/host_runner.cpp` con `CXX` (es. `CXX="python -m ziglang c++"`, oppure g++/clang++).
Senza compilatore esegue solo la parte JS (`--no-cpp`).

## Regola
Se cambia la semantica dell'interprete si modificano **entrambi** `firmware/lib/interp/interp.h` e
`web/interp.js`, e si aggiunge un caso in `tests/cases.src.js`. Se cambia il protocollo, `PROTOCOLLO.md`.
