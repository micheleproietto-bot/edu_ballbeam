#!/usr/bin/env node
// Finta scheda per provare la pagina "servita dall'ESP32" senza hardware né Wi-Fi:
//   node tests/fake_esp.js [portaHttp=8080]   ->  apri http://localhost:8080
// Pagina su HTTP, WebSocket sulla porta 81 (stesso protocollo JSON dell'ESP32), dietro il simulatore.
"use strict";
const http = require("http"), crypto = require("crypto"), fs = require("fs"), path = require("path");
const { createSim } = require(path.join(__dirname, "..", "web", "sim.js"));
const PORT = +process.argv[2] || 8080;
const page = () => {
  let h = fs.readFileSync(path.join(__dirname, "..", "web", "ball-beam-blocchi.html"), "utf8");
  if (process.env.INJECT) h = h.replace("</body>", () => "<script>" + fs.readFileSync(process.env.INJECT, "utf8") + "</script></body>");   // solo per i test automatici
  return Buffer.from(h);
};

http.createServer((req, res) => {
  if (req.url === "/health") { res.end("ok"); return; }
  if (req.method === "POST" && req.url === "/result" && process.env.RESULT) {      // solo per i test automatici
    let b = ""; req.on("data", (d) => (b += d)); req.on("end", () => { fs.writeFileSync(process.env.RESULT, b); res.end("ok"); }); return;
  }
  if (req.url !== "/") { res.writeHead(404); res.end("non trovato"); return; }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" }); res.end(page());
}).listen(PORT, () => console.log("pagina su http://localhost:" + PORT));

const clients = new Set();
const sim = createSim({ length: 70, x0: 50, centerOffset: 1, noise: 0.3, onLine: (l) => { for (const c of clients) frame(c, l); } });
setInterval(() => sim.step(10), 10);

function frame(sock, text) {                         // frame di testo, non mascherato (server -> client)
  const b = Buffer.from(text), n = b.length;
  const h = n < 126 ? Buffer.from([0x81, n]) : Buffer.from([0x81, 126, n >> 8, n & 255]);
  try { sock.write(Buffer.concat([h, b])); } catch (e) {}
}
http.createServer().on("upgrade", (req, sock) => {
  const key = req.headers["sec-websocket-key"];
  sock.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " +
    crypto.createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64") + "\r\n\r\n");
  clients.add(sock); console.log("client WebSocket collegato (" + clients.size + ")");
  let buf = Buffer.alloc(0);
  sock.on("data", (d) => {
    buf = Buffer.concat([buf, d]);
    for (;;) {
      if (buf.length < 2) return;
      const op = buf[0] & 15; let len = buf[1] & 127, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      if (buf.length < off + 4 + len) return;
      const mask = buf.subarray(off, off + 4), data = Buffer.from(buf.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < len; i++) data[i] ^= mask[i & 3];
      buf = buf.subarray(off + 4 + len);
      if (op === 1) sim.write(data.toString("utf8") + "\n");
      else if (op === 8) { sock.end(); return; }
      else if (op === 9) sock.write(Buffer.concat([Buffer.from([0x8A, len]), data]));
    }
  });
  sock.on("close", () => { clients.delete(sock); console.log("client WebSocket chiuso"); });
  sock.on("error", () => clients.delete(sock));
}).listen(81, () => console.log("WebSocket su ws://localhost:81"));
