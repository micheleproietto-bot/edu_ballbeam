# Protocollo USB — Ball & Beam a blocchi

Collegamento: USB seriale, 115200 baud, 8N1. Una riga = un messaggio JSON (terminato da `\n`). Max 12 KB per riga. Annidamento JSON massimo 40 livelli (circa 18 blocchi uno dentro l'altro): oltre, l'ESP32 risponde `JSON non valido`.

## Browser → ESP32 (comandi, campo `c`)

| Comando | Esempio | Effetto |
|---|---|---|
| hello | `{"c":"hello"}` | L'ESP32 risponde con `hello` (versione, stato sensore) |
| ping | `{"c":"ping"}` | Heartbeat. Va inviato ogni 500 ms: se manca per 2 s con programma in esecuzione, trave a zero e stop |
| cfg | `{"c":"cfg","center":90,"limit":20,"inv":0}` | Centro servo (gradi), limite escursione ±gradi (max 35), inversione segno |
| prog | `{"c":"prog","p":[...]}` | Carica il programma (rifiutato se in esecuzione) |
| run | `{"c":"run"}` | Avvia il programma caricato |
| stop | `{"c":"stop"}` | Ferma programma e PID, trave a zero |
| angle | `{"c":"angle","v":5}` | Angolo manuale (solo a programma fermo), per calibrare |

## ESP32 → Browser

- Telemetria ogni 50 ms: `{"t":12345,"x":18.4,"sp":20,"a":-3.2,"run":1,"pid":1,"ok":1}`
  `x` = posizione palla in cm dal sensore, `sp` = setpoint cm, `a` = angolo trave in gradi (0 = orizzontale), `ok` = sensore valido.
  `s` (solo con programma in esecuzione e istruzione con `i`) = indice `i` dell'istruzione che l'interprete sta eseguendo.
- Eventi (campo `e`): `hello`, `ok`, `err` (campo `m`), `log` (campo `v`, dal blocco "mostra"), `done` (programma terminato).

## Programma (campo `p`): lista di istruzioni

Ogni istruzione ha `o` (operazione) e, opzionalmente, `i` (intero: indice dell'istruzione nel programma, scelto dal browser). Un'espressione è un numero oppure un oggetto con `o`.
L'interprete ignora `i` salvo per riportarlo nella telemetria (`s`), così il browser evidenzia il blocco in esecuzione.

Istruzioni:
- `{"o":"servo","v":E}` angolo trave (gradi, limitato dal firmware); disattiva il PID
- `{"o":"wait","v":E}` attendi E secondi
- `{"o":"repeat","n":E,"b":[...]}` ripeti n volte
- `{"o":"forever","b":[...]}` ripeti per sempre
- `{"o":"while","c":E,"b":[...]}` finché la condizione è vera
- `{"o":"until","c":E}` attendi finché la condizione diventa vera
- `{"o":"if","c":E,"t":[...],"f":[...]}` se / altrimenti
- `{"o":"set","n":"nome","v":E}` assegna variabile; `{"o":"change","n":"nome","v":E}` incrementa
- `{"o":"setpoint","v":E}` posizione obiettivo (cm)
- `{"o":"pid","kp":E,"ki":E,"kd":E}` attiva il PID verso il setpoint
- `{"o":"pid_off"}` disattiva il PID
- `{"o":"say","v":E}` invia un valore al browser

Espressioni:
- `{"o":"pos"}` posizione palla (cm), `{"o":"sp"}` setpoint, `{"o":"angle"}` angolo, `{"o":"time"}` secondi dall'avvio
- `{"o":"var","n":"nome"}`
- `{"o":"bin","op":"+|-|*|/|min|max","a":E,"b":E}`
- `{"o":"cmp","op":"<|>|<=|>=|==|!=","a":E,"b":E}`
- `{"o":"and","a":E,"b":E}`, `{"o":"or","a":E,"b":E}`, `{"o":"not","a":E}`
- `{"o":"abs","a":E}`

## Sicurezza (nel firmware, non aggirabile dai blocchi)

- Angolo sempre limitato a ±`limit` (default 20°, max 35°).
- Sensore senza misura valida per 500 ms: stop e trave a zero.
- Heartbeat perso, STOP, fine programma: trave a zero.
- Integrale del PID limitato (anti-windup).
