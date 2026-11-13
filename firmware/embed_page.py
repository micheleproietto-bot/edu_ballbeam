# Prima della compilazione: comprime web/ball-beam-blocchi.html in embed/page.html.gz (incorporato nel firmware).
Import("env")
import gzip, os
proj = env["PROJECT_DIR"]
src = os.path.join(proj, "..", "web", "ball-beam-blocchi.html")
dst = os.path.join(proj, "embed", "page.html.gz")
os.makedirs(os.path.dirname(dst), exist_ok=True)
if os.path.exists(src):
    with open(src, "rb") as f:
        data = f.read()
    with open(dst, "wb") as raw:
        with gzip.GzipFile(filename="", mode="wb", fileobj=raw, compresslevel=9, mtime=0) as g:
            g.write(data)
    print("embed_page: %d KB -> %d KB" % (len(data) // 1024, os.path.getsize(dst) // 1024))
elif not os.path.exists(dst):
    raise SystemExit("embed_page: manca web/ball-beam-blocchi.html (esegui web/build.py)")
