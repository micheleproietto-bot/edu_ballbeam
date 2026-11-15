#!/usr/bin/env python3
"""Genera web/ball-beam-blocchi.html (file unico, nessuna dipendenza a runtime).

Uso: python build.py [cartella-blockly]
La cartella è quella del pacchetto npm 'blockly' (default: build/node_modules/blockly).
Si ottiene con:  npm install blockly   (in una cartella di build, ad es. web/build)
"""
import pathlib, sys

here = pathlib.Path(__file__).parent
blk = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else here / "build" / "node_modules" / "blockly"

def read(p):
    return pathlib.Path(p).read_text(encoding="utf-8")

parts = {
    "/*__BLOCKLY__*/": read(blk / "blockly.min.js"),   # core + blocchi + generatore JS
    "/*__MSG_IT__*/": read(blk / "msg" / "it.js"),
    "/*__INTERP__*/": read(here / "interp.js") if (here / "interp.js").exists() else "",
    "/*__SCORER__*/": read(here / "scorer.js"),
    "/*__SIM__*/": read(here / "sim.js"),
    "/*__APP__*/": read(here / "app.js"),
}
html = read(here / "app.html")
for k, v in parts.items():
    if k in html:
        # niente </script> dentro il contenuto inline
        html = html.replace(k, v.replace("</script", "<\\/script"))
out = here / "ball-beam-blocchi.html"
out.write_text(html, encoding="utf-8")
print("scritto", out, len(html) // 1024, "KB")
