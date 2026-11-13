// Interprete dei programmi a blocchi — indipendente dall'hardware.
// Usato dal firmware (main.cpp) e dai test su PC (tests/host_runner.cpp).
// Deve restare semanticamente identico a web/interp.js (stessa suite: tests/cases.json).
#pragma once
#include <ArduinoJson.h>
#include <math.h>
#include <stdint.h>
#include <string.h>

namespace bb {

// Tutto ciò che l'interprete può fare nel mondo reale (o simulato).
struct Host {
  virtual ~Host() {}
  virtual uint32_t nowMs() = 0;           // millisecondi (monotòno)
  virtual void sleepMs(uint32_t ms) = 0;  // cede la CPU per circa ms
  virtual bool halted() = 0;              // stop richiesto?
  virtual float pos() = 0;                // posizione palla (cm)
  virtual float sp() = 0;                 // setpoint corrente (cm)
  virtual float angle() = 0;              // angolo trave (gradi)
  virtual void servo(float deg) = 0;      // inclina la trave (spegne il PID); l'host limita l'angolo
  virtual void setpoint(float cm) = 0;    // già limitato a 0..100
  virtual void pidOn(float kp, float ki, float kd) = 0;
  virtual void pidOff() = 0;
  virtual void say(float v) = 0;
  virtual void fail(const char* msg) = 0; // segnala l'errore E richiede lo stop
};

// NaN -> lo (così un valore impazzito non diventa mai un angolo o un'attesa assurda)
inline float clampf(float v, float lo, float hi) { return !(v >= lo) ? lo : (v > hi ? hi : v); }

class Interp {
 public:
  static const int MAX_VARS = 24;
  static const int NAME_LEN = 15;  // byte
  static const int MAX_DEPTH = 24;

  explicit Interp(Host& h) : h_(h) {}

  void run(JsonVariantConst prog) {
    nvars_ = 0;
    t0_ = h_.nowMs();
    execBlock(prog, 0);
  }

 private:
  struct Var { char n[NAME_LEN + 1]; float v; };
  Host& h_;
  Var vars_[MAX_VARS];
  int nvars_ = 0;
  uint32_t t0_ = 0;

  float* varRef(const char* n) {
    for (int i = 0; i < nvars_; i++)
      if (strncmp(vars_[i].n, n, NAME_LEN) == 0) return &vars_[i].v;  // i nomi lunghi sono troncati
    if (nvars_ >= MAX_VARS) return nullptr;
    strncpy(vars_[nvars_].n, n, NAME_LEN);
    vars_[nvars_].n[NAME_LEN] = 0;
    vars_[nvars_].v = 0;
    return &vars_[nvars_++].v;
  }

  float evalE(JsonVariantConst e) {
    if (e.is<float>() || e.is<int>() || e.is<double>()) return e.as<float>();
    if (!e.is<JsonObjectConst>()) return 0;                 // null, testo, lista, booleano
    const char* o = e["o"] | "";
    if (!strcmp(o, "pos"))   return h_.pos();
    if (!strcmp(o, "sp"))    return h_.sp();
    if (!strcmp(o, "angle")) return h_.angle();
    if (!strcmp(o, "time"))  return (h_.nowMs() - t0_) / 1000.0f;
    if (!strcmp(o, "var"))   { float* p = varRef(e["n"] | "x"); return p ? *p : 0; }
    if (!strcmp(o, "not"))   return evalE(e["a"]) == 0 ? 1 : 0;
    if (!strcmp(o, "abs"))   return fabsf(evalE(e["a"]));
    bool isAnd = !strcmp(o, "and"), isOr = !strcmp(o, "or");
    bool isBin = !strcmp(o, "bin"), isCmp = !strcmp(o, "cmp");
    if (!(isAnd || isOr || isBin || isCmp)) return 0;       // operazione sconosciuta
    float a = evalE(e["a"]);
    if (isAnd) return (a != 0 && evalE(e["b"]) != 0) ? 1 : 0;
    if (isOr)  return (a != 0 || evalE(e["b"]) != 0) ? 1 : 0;
    float b = evalE(e["b"]);
    const char* op = e["op"] | "";
    if (isBin) {
      if (!strcmp(op, "+")) return a + b;
      if (!strcmp(op, "-")) return a - b;
      if (!strcmp(op, "*")) return a * b;
      if (!strcmp(op, "/")) return b == 0 ? 0 : a / b;
      if (!strcmp(op, "min")) return a < b ? a : b;
      if (!strcmp(op, "max")) return a > b ? a : b;
    } else {
      if (!strcmp(op, "<"))  return a < b;
      if (!strcmp(op, ">"))  return a > b;
      if (!strcmp(op, "<=")) return a <= b;
      if (!strcmp(op, ">=")) return a >= b;
      if (!strcmp(op, "==")) return fabsf(a - b) < 1e-4f;
      if (!strcmp(op, "!=")) return fabsf(a - b) >= 1e-4f;
    }
    return 0;
  }

  void waitMs(uint32_t ms) {
    uint32_t t = h_.nowMs();
    while (!h_.halted() && h_.nowMs() - t < ms) h_.sleepMs(5);
  }

  static int toCount(float v) {  // numero di ripetizioni: troncato, mai negativo
    if (!(v > 0)) return 0;
    if (v >= 2147483520.0f) return 2147483647;
    return (int)v;
  }

  void execBlock(JsonVariantConst b, int depth) {
    for (JsonVariantConst s : b.as<JsonArrayConst>()) {
      if (h_.halted()) return;
      execStmt(s, depth);
      h_.sleepMs(1);
    }
  }

  void execStmt(JsonVariantConst s, int depth) {
    if (depth > MAX_DEPTH) { h_.fail("programma troppo annidato"); return; }
    if (!s.is<JsonObjectConst>()) return;
    const char* o = s["o"] | "";
    if (!strcmp(o, "servo"))         h_.servo(evalE(s["v"]));
    else if (!strcmp(o, "wait"))     waitMs((uint32_t)(clampf(evalE(s["v"]), 0, 3600) * 1000));
    else if (!strcmp(o, "setpoint")) h_.setpoint(clampf(evalE(s["v"]), 0, 100));
    else if (!strcmp(o, "pid"))      { float kp = evalE(s["kp"]), ki = evalE(s["ki"]), kd = evalE(s["kd"]); h_.pidOn(kp, ki, kd); }
    else if (!strcmp(o, "pid_off"))  h_.pidOff();
    else if (!strcmp(o, "set"))      { float v = evalE(s["v"]); float* p = varRef(s["n"] | "x"); if (p) *p = v; }
    else if (!strcmp(o, "change"))   { float v = evalE(s["v"]); float* p = varRef(s["n"] | "x"); if (p) *p += v; }
    else if (!strcmp(o, "say"))      h_.say(evalE(s["v"]));
    else if (!strcmp(o, "if")) {
      if (evalE(s["c"]) != 0) execBlock(s["t"], depth + 1); else execBlock(s["f"], depth + 1);
    }
    else if (!strcmp(o, "repeat")) {
      int n = toCount(evalE(s["n"]));
      for (int i = 0; i < n && !h_.halted(); i++) { execBlock(s["b"], depth + 1); h_.sleepMs(1); }
    }
    else if (!strcmp(o, "forever")) {
      while (!h_.halted()) { execBlock(s["b"], depth + 1); h_.sleepMs(1); }
    }
    else if (!strcmp(o, "while")) {
      while (!h_.halted() && evalE(s["c"]) != 0) { execBlock(s["b"], depth + 1); h_.sleepMs(1); }
    }
    else if (!strcmp(o, "until")) {
      while (!h_.halted() && evalE(s["c"]) == 0) h_.sleepMs(5);
    }
  }
};

}  // namespace bb
