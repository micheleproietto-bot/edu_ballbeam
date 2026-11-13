// Esegue tests/cases.json con l'interprete C++ del firmware, su PC (orologio virtuale).
// Uso: host_runner cases.json   -> una riga JSON per caso su stdout.
// Il host di test e il formato delle tracce devono restare identici a quelli di tests/run.js.
#include <interp.h>
#include <math.h>
#include <stdio.h>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

static std::string fmt(float v) {
  if (isnan(v)) return "nan";
  if (isinf(v)) return v > 0 ? "inf" : "-inf";
  char b[64];
  snprintf(b, sizeof b, "%.4f", (double)v);
  std::string s = b;
  if (s.find('.') != std::string::npos) {
    while (s.back() == '0') s.pop_back();
    if (s.back() == '.') s.pop_back();
  }
  if (s == "-0") s = "0";
  return s;
}

struct Ev { std::string text; uint32_t t; };

struct TestHost : bb::Host {
  uint32_t clock = 0, stopAt = 0xFFFFFFFFu, maxMs = 10000000;
  std::vector<std::pair<uint32_t, float>> posSteps;
  float spv = 20, ang = 0;
  bool stopped = false, sawHalt = false;
  std::vector<Ev> ev;

  void add(const std::string& s) { ev.push_back({s, clock}); }
  uint32_t nowMs() override { return clock; }
  void sleepMs(uint32_t ms) override { clock += ms; }
  bool halted() override {
    bool h = stopped || clock >= stopAt || clock >= maxMs;
    if (h) sawHalt = true;
    return h;
  }
  float pos() override {
    float v = posSteps[0].second;
    for (auto& p : posSteps) if (p.first <= clock) v = p.second;
    return v;
  }
  float sp() override { return spv; }
  float angle() override { return ang; }
  void servo(float d) override { add("servo " + fmt(d)); ang = isnan(d) ? 0 : bb::clampf(d, -20, 20); }
  void setpoint(float cm) override { add("setpoint " + fmt(cm)); spv = cm; }
  void pidOn(float kp, float ki, float kd) override { add("pid " + fmt(kp) + " " + fmt(ki) + " " + fmt(kd)); }
  void pidOff() override { add("pid_off"); }
  void say(float v) override { add("say " + fmt(v)); }
  void fail(const char* m) override { add(std::string("fail ") + m); stopped = true; }
};

static std::string esc(const std::string& s) {
  std::string o;
  for (char c : s) { if (c == '"' || c == '\\') o += '\\'; o += c; }
  return o;
}

int main(int argc, char** argv) {
  if (argc < 2) { fprintf(stderr, "uso: host_runner cases.json\n"); return 2; }
  std::ifstream in(argv[1], std::ios::binary);
  std::stringstream ss; ss << in.rdbuf();
  JsonDocument doc;
  if (deserializeJson(doc, ss.str(), DeserializationOption::NestingLimit(250))) { fprintf(stderr, "cases.json non valido\n"); return 2; }
  for (JsonObject c : doc.as<JsonArray>()) {
    TestHost h;
    JsonVariant pv = c["pos"];
    if (pv.is<JsonArray>()) for (JsonArray p : pv.as<JsonArray>()) h.posSteps.push_back({p[0].as<uint32_t>(), p[1].as<float>()});
    else h.posSteps.push_back({0, pv.isNull() ? 20.0f : pv.as<float>()});
    if (!c["stopAt"].isNull()) h.stopAt = c["stopAt"].as<uint32_t>();
    bb::Interp interp(h);
    interp.run(c["prog"]);
    printf("{\"name\":\"%s\",\"finished\":%s,\"end\":%u,\"events\":[", esc(c["name"] | "").c_str(),
           (h.sawHalt || h.stopped) ? "false" : "true", (unsigned)h.clock);
    for (size_t i = 0; i < h.ev.size(); i++)
      printf("%s[\"%s\",%u]", i ? "," : "", esc(h.ev[i].text).c_str(), (unsigned)h.ev[i].t);
    printf("]}\n");
  }
  return 0;
}
