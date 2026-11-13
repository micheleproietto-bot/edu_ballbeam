// Ball & Beam a blocchi — firmware ESP32 (VL53L4CD + servo)
// Protocollo: vedi PROTOCOLLO.md (JSON per riga su USB seriale, 115200).
#include <Arduino.h>
#include <Wire.h>
#include <ESP32Servo.h>
#include <ArduinoJson.h>
#include <vl53l4cd_class.h>
#include <interp.h>

// ---------- Hardware ----------
#define PIN_SERVO 18
#define PIN_SDA   21
#define PIN_SCL   22
#define BAUD      115200
#define FW_VERSION "1.0"

// ---------- Configurazione (modificabile da browser con "cfg") ----------
static float cfgCenter = 90.0f;  // angolo servo con trave orizzontale
static float cfgLimit  = 20.0f;  // escursione massima ± gradi
static bool  cfgInv    = false;  // inverte il verso del servo
static const float HARD_LIMIT = 35.0f;

// ---------- Stato condiviso ----------
static volatile float g_pos = 0;        // cm dal sensore
static volatile bool  g_posOk = false;
static volatile float g_sp = 20;        // setpoint cm
static volatile float g_angle = 0;      // gradi rispetto all'orizzontale
static volatile bool  g_pid = false;
static volatile float g_kp = 2, g_ki = 0, g_kd = 1;
static volatile bool  g_running = false;
static volatile bool  g_stopReq = false;
static volatile bool  g_startReq = false;
static volatile uint32_t g_lastPing = 0;
static volatile uint32_t g_lastGood = 0;

static Servo servo;
static VL53L4CD sensor(&Wire, -1);
static SemaphoreHandle_t txMutex;
static SemaphoreHandle_t servoMutex;   // serializza chi decide l'angolo (programma, PID, comandi)
static JsonDocument g_prog;
static bool g_progLoaded = false;

// ---------- Utilità ----------
static float clampf(float v, float lo, float hi) { return bb::clampf(v, lo, hi); }

static void sendDoc(const JsonDocument& d) {
  xSemaphoreTake(txMutex, portMAX_DELAY);
  serializeJson(d, Serial);
  Serial.print('\n');
  xSemaphoreGive(txMutex);
}
static void sendErr(const char* m) { JsonDocument d; d["e"] = "err"; d["m"] = m; sendDoc(d); }
static void sendEv(const char* e)  { JsonDocument d; d["e"] = e; sendDoc(d); }

static void writeServo(float angle) {
  float limit = clampf(cfgLimit, 1, HARD_LIMIT);
  if (isnan(angle)) angle = 0;
  angle = clampf(angle, -limit, limit);
  g_angle = angle;
  float a = cfgCenter + (cfgInv ? -angle : angle);
  servo.write((int)lroundf(clampf(a, 0, 180)));
}

// Angolo manuale: spegne il PID e scrive il servo in modo atomico rispetto al task di controllo.
static void setManual(float angle) {
  xSemaphoreTake(servoMutex, portMAX_DELAY);
  g_pid = false;
  writeServo(angle);
  xSemaphoreGive(servoMutex);
}

static void stopAll() { setManual(0); }

// ---------- Interprete (lib/interp/interp.h) ----------
struct FwHost : bb::Host {
  uint32_t nowMs() override { return millis(); }
  void sleepMs(uint32_t ms) override { vTaskDelay(pdMS_TO_TICKS(ms)); }
  bool halted() override { return g_stopReq; }
  float pos() override { return g_pos; }
  float sp() override { return g_sp; }
  float angle() override { return g_angle; }
  void servo(float deg) override { setManual(deg); }
  void setpoint(float cm) override { g_sp = cm; }
  void pidOn(float kp, float ki, float kd) override {
    xSemaphoreTake(servoMutex, portMAX_DELAY);
    g_kp = kp; g_ki = ki; g_kd = kd; g_pid = true;
    xSemaphoreGive(servoMutex);
  }
  void pidOff() override {
    xSemaphoreTake(servoMutex, portMAX_DELAY);
    g_pid = false;
    xSemaphoreGive(servoMutex);
  }
  void say(float v) override { JsonDocument d; d["e"] = "log"; d["v"] = v; sendDoc(d); }
  void fail(const char* msg) override { sendErr(msg); g_stopReq = true; }
};
static FwHost fwHost;
static bb::Interp interp(fwHost);

static void programTask(void*) {
  for (;;) {
    if (g_startReq) {
      g_startReq = false;
      g_lastPing = millis();
      interp.run(g_prog["p"]);
      bool wasStopped = g_stopReq;
      g_running = false;
      g_stopReq = false;
      stopAll();
      if (!wasStopped) sendEv("done");
    }
    vTaskDelay(pdMS_TO_TICKS(5));
  }
}

// ---------- Loop di controllo (50 Hz) ----------
static void controlTask(void*) {
  float integ = 0, prevPos = 0, dFilt = 0;
  uint32_t prevSampleMs = 0;
  bool prevPid = false;
  TickType_t last = xTaskGetTickCount();
  for (;;) {
    bool newSample = false;
    uint32_t sampleMs = 0;
    uint8_t ready = 0;
    sensor.VL53L4CD_CheckForDataReady(&ready);
    if (ready) {
      VL53L4CD_Result_t r;
      sensor.VL53L4CD_ClearInterrupt();
      sensor.VL53L4CD_GetResult(&r);
      if (r.range_status == 0 && r.distance_mm > 0) {
        g_pos = r.distance_mm / 10.0f;
        g_posOk = true;
        g_lastGood = millis();
        sampleMs = g_lastGood;
        newSample = true;
      }
    }
    if (millis() - g_lastGood > 500) g_posOk = false;

    // sicurezze
    if (g_running && !g_stopReq && !g_posOk) { sendErr("sensore non valido: stop"); g_stopReq = true; }
    if (g_running && !g_stopReq && millis() - g_lastPing > 2000) { sendErr("connessione persa: stop"); g_stopReq = true; }
    if (g_stopReq && !g_running) g_stopReq = false;

    xSemaphoreTake(servoMutex, portMAX_DELAY);
    if (g_pid && g_posOk) {
      float pos = g_pos;
      float err = g_sp - pos;
      if (!prevPid) { integ = 0; prevPos = pos; prevSampleMs = sampleMs ? sampleMs : g_lastGood; dFilt = 0; }
      if (newSample) {                              // PID aggiornato solo con campioni nuovi
        float dt = (sampleMs - prevSampleMs) / 1000.0f;
        if (dt < 0.005f) dt = 0.02f;
        integ = clampf(integ + err * dt, -50, 50);
        float dRaw = -(pos - prevPos) / dt;         // derivata sulla misura
        dFilt += 0.3f * (dRaw - dFilt);
        prevPos = pos;
        prevSampleMs = sampleMs;
      }
      writeServo(g_kp * err + g_ki * integ + g_kd * dFilt);
    } else if (g_pid && !g_posOk) {
      writeServo(0);
    }
    prevPid = g_pid;
    if (g_stopReq) { g_pid = false; writeServo(0); }
    xSemaphoreGive(servoMutex);

    vTaskDelayUntil(&last, pdMS_TO_TICKS(20));
  }
}

// ---------- Comandi seriali ----------
static char lineBuf[12288];
static size_t lineLen = 0;

static void handleLine(const char* line) {
  JsonDocument d;
  DeserializationError err = deserializeJson(d, line, DeserializationOption::NestingLimit(40));
  if (err) { sendErr("JSON non valido"); return; }
  const char* c = d["c"] | "";
  g_lastPing = millis();
  if (!strcmp(c, "hello")) {
    JsonDocument r; r["e"] = "hello"; r["v"] = 1; r["fw"] = FW_VERSION; r["ok"] = g_posOk ? 1 : 0;
    r["limit"] = cfgLimit; sendDoc(r);
  } else if (!strcmp(c, "ping")) {
    // heartbeat: g_lastPing già aggiornato
  } else if (!strcmp(c, "cfg")) {
    if (g_running) { sendErr("ferma il programma prima"); return; }
    if (d["center"].is<float>()) cfgCenter = clampf(d["center"], 60, 120);
    if (d["limit"].is<float>())  cfgLimit  = clampf(d["limit"], 1, HARD_LIMIT);
    if (!d["inv"].isNull())      cfgInv    = d["inv"].as<int>() != 0;
    setManual(0);
    sendEv("ok");
  } else if (!strcmp(c, "prog")) {
    if (g_running) { sendErr("programma in esecuzione"); return; }   // g_running sale subito con "run"
    g_prog.clear();
    g_prog["p"] = d["p"];
    g_progLoaded = !g_prog["p"].isNull();
    if (g_progLoaded) sendEv("ok"); else sendErr("programma vuoto");
  } else if (!strcmp(c, "run")) {
    if (g_running) { sendErr("già in esecuzione"); return; }
    if (!g_progLoaded) { sendErr("nessun programma"); return; }
    if (!g_posOk) { sendErr("sensore non valido"); return; }
    g_stopReq = false;
    g_running = true;     // subito, così "prog" e "stop" successivi vedono lo stato corretto
    g_startReq = true;
  } else if (!strcmp(c, "stop")) {
    g_stopReq = true;
    if (!g_running) { stopAll(); g_stopReq = false; }
  } else if (!strcmp(c, "angle")) {
    if (!g_running) setManual(d["v"] | 0.0f);
  } else {
    sendErr("comando sconosciuto");
  }
}

static void pollSerial() {
  while (Serial.available()) {
    char ch = (char)Serial.read();
    if (ch == '\n') {
      lineBuf[lineLen] = 0;
      if (lineLen > 0) handleLine(lineBuf);
      lineLen = 0;
    } else if (ch != '\r') {
      if (lineLen < sizeof(lineBuf) - 1) lineBuf[lineLen++] = ch;
      else { lineLen = 0; sendErr("riga troppo lunga"); }
    }
  }
}

void setup() {
  Serial.setRxBufferSize(8192);   // i programmi arrivano in un'unica riga lunga
  Serial.begin(BAUD);
  txMutex = xSemaphoreCreateMutex();
  servoMutex = xSemaphoreCreateMutex();
  servo.setPeriodHertz(50);
  servo.attach(PIN_SERVO, 500, 2400);
  setManual(0);

  Wire.begin(PIN_SDA, PIN_SCL);
  Wire.setClock(400000);
  sensor.begin();
  sensor.VL53L4CD_SensorInit();
  sensor.VL53L4CD_SetRangeTiming(20, 0);   // 20 ms di misura, continuo
  sensor.VL53L4CD_StartRanging();

  g_lastGood = millis();
  xTaskCreatePinnedToCore(controlTask, "ctrl", 4096, nullptr, 3, nullptr, 1);
  xTaskCreatePinnedToCore(programTask, "prog", 8192, nullptr, 2, nullptr, 0);
}

void loop() {
  pollSerial();
  static uint32_t lastTel = 0;
  if (millis() - lastTel >= 50) {
    lastTel = millis();
    JsonDocument t;
    t["t"] = millis();
    t["x"] = serialized(String(g_pos, 1));
    t["sp"] = g_sp;
    t["a"] = serialized(String(g_angle, 1));
    t["run"] = g_running ? 1 : 0;
    t["pid"] = g_pid ? 1 : 0;
    t["ok"] = g_posOk ? 1 : 0;
    sendDoc(t);
  }
  delay(2);
}
