// Esegue tests/scorer_cases.json con lo Scorer C++ del firmware. Una riga JSON per caso su stdout.
#include <scorer.h>
#include <ArduinoJson.h>
#include <stdio.h>
#include <fstream>
#include <sstream>

int main(int argc, char** argv) {
  if (argc < 2) { fprintf(stderr, "uso: scorer_runner scorer_cases.json\n"); return 2; }
  std::ifstream in(argv[1], std::ios::binary);
  std::stringstream ss; ss << in.rdbuf();
  JsonDocument doc;
  if (deserializeJson(doc, ss.str())) { fprintf(stderr, "json non valido\n"); return 2; }
  for (JsonObject c : doc.as<JsonArray>()) {
    bb::Scorer s;
    int closed[bb::Scorer::WINDOWS + 4], nc = 0;
    for (JsonArray run : c["runs"].as<JsonArray>()) {
      int n = run[0]; bool valid = run[1].as<int>() != 0; float err = run[2].as<float>();
      for (int i = 0; i < n; i++) { int w = s.tick(valid, err); if (w >= 0 && nc < bb::Scorer::WINDOWS + 4) closed[nc++] = w; }
    }
    printf("{\"name\":\"%s\",\"windows\":[", (const char*)(c["name"] | ""));
    for (int w = 0; w < bb::Scorer::WINDOWS; w++) printf("%s%.6f", w ? "," : "", s.windowPoints(w));
    printf("],\"points\":%.6f,\"mae\":%.6f,\"ticks\":%u,\"closed\":[", s.points(), s.mae(), (unsigned)s.ticks);
    for (int i = 0; i < nc; i++) printf("%s%d", i ? "," : "", closed[i]);
    printf("]}\n");
  }
  return 0;
}
