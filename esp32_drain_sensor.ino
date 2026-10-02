/*
  EcoDrain — ESP32 Sensor Node
  ----------------------------
  Reads an HC-SR04 ultrasonic sensor mounted at the top of the drain
  (looking straight down) to estimate waste/fill level, reads a simple
  digital float switch to detect blocked / slow water flow, and POSTs
  a JSON reading to the EcoDrain Flask backend's /api/sensor-data route
  every SEND_INTERVAL_MS milliseconds.

  Hardware
  --------
  - ESP32 dev board (any variant with WiFi)
  - HC-SR04 ultrasonic distance sensor
  - Float switch OR a second HC-SR04 pointed at the water surface
    (this sketch assumes a simple digital float switch for simplicity)

  Wiring
  ------
  HC-SR04         ESP32
  -------         -----
  VCC     ---->   5V (or VIN)
  GND     ---->   GND
  TRIG    ---->   GPIO 5
  ECHO    ---->   GPIO 18   *** THROUGH A VOLTAGE DIVIDER ***
                            HC-SR04 ECHO outputs 5V, ESP32 GPIOs are
                            3.3V-only. Use two resistors (e.g. 1k + 2k)
                            as a divider from ECHO -> GPIO18 -> GND to
                            step 5V down to ~3.3V. Skipping this can
                            damage the ESP32 pin.

  Float switch    ESP32
  ------------    -----
  Signal  ---->   GPIO 4  (configured with internal pull-up)
  GND     ---->   GND
  (Switch closes / pulls LOW when water backs up and floods the switch)

  Setup before uploading
  -----------------------
  1. Fill in WIFI_SSID / WIFI_PASSWORD below.
  2. Fill in SERVER_HOST with your computer's LAN IP (run `ipconfig`
     on Windows or `ifconfig`/`ip a` on macOS/Linux while the Flask
     app is running). Keep SERVER_PORT as 5000 unless you changed it.
  3. Set DRAIN_ID to one of the drains already seeded in the backend
     (ED-001 .. ED-005), or a new one you create via the dashboard.
  4. Calibrate EMPTY_DISTANCE_CM / FULL_DISTANCE_CM for your physical
     install (see comments below).
  5. Install board support: File > Preferences > Additional Board
     Manager URLs > add the ESP32 URL, then Tools > Board > ESP32.
     No extra libraries needed — WiFi.h and HTTPClient.h ship with
     the ESP32 core.
*/

#include <WiFi.h>
#include <HTTPClient.h>

// ------------------------------------------------------------------
// EDIT THESE FOR YOUR SETUP
// ------------------------------------------------------------------
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

const char* SERVER_HOST   = "192.168.1.100";   // your computer's LAN IP
const int   SERVER_PORT   = 5000;
const char* DRAIN_ID      = "ED-001";          // must match a drain_id in the backend

// Calibration: measure with a tape once the sensor is mounted.
// EMPTY_DISTANCE_CM = distance the sensor reads when the drain is empty (0% full).
// FULL_DISTANCE_CM  = distance the sensor reads when the drain is completely full (100%).
const float EMPTY_DISTANCE_CM = 20.0;
const float FULL_DISTANCE_CM  = 2.0;

const unsigned long SEND_INTERVAL_MS = 30000;  // send a reading every 30s

// ------------------------------------------------------------------
// PIN CONFIG
// ------------------------------------------------------------------
const int TRIG_PIN        = 5;
const int ECHO_PIN        = 18;
const int FLOW_SWITCH_PIN = 4;

// ------------------------------------------------------------------
unsigned long lastSendTime = 0;

void connectWiFi() {
  Serial.print("Connecting to WiFi");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("WiFi connected, IP address: ");
  Serial.println(WiFi.localIP());
}

// Take several ultrasonic readings and return the median (rejects noisy outliers).
float readDistanceCm() {
  const int SAMPLES = 5;
  float samples[SAMPLES];
  int valid = 0;

  for (int i = 0; i < SAMPLES; i++) {
    digitalWrite(TRIG_PIN, LOW);
    delayMicroseconds(2);
    digitalWrite(TRIG_PIN, HIGH);
    delayMicroseconds(10);
    digitalWrite(TRIG_PIN, LOW);

    long duration = pulseIn(ECHO_PIN, HIGH, 30000UL); // 30ms timeout ~5m range
    if (duration > 0) {
      float distance = duration * 0.0343 / 2.0; // speed of sound = 343 m/s
      samples[valid++] = distance;
    }
    delay(30);
  }

  if (valid == 0) return -1; // sensor read failure

  // simple insertion sort, then take the middle value
  for (int i = 1; i < valid; i++) {
    float key = samples[i];
    int j = i - 1;
    while (j >= 0 && samples[j] > key) {
      samples[j + 1] = samples[j];
      j--;
    }
    samples[j + 1] = key;
  }
  return samples[valid / 2];
}

float distanceToWasteLevel(float distanceCm) {
  // Map distance -> 0-100%, closer to FULL_DISTANCE_CM = higher waste level.
  float level = (EMPTY_DISTANCE_CM - distanceCm) / (EMPTY_DISTANCE_CM - FULL_DISTANCE_CM) * 100.0;
  if (level < 0) level = 0;
  if (level > 100) level = 100;
  return level;
}

const char* readWaterFlow() {
  // Float switch pulled LOW when triggered (water backing up = restricted flow).
  bool triggered = (digitalRead(FLOW_SWITCH_PIN) == LOW);
  return triggered ? "LOW" : "NORMAL";
}

void sendReading(float distanceCm, float wasteLevel, const char* waterFlow) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected, skipping send.");
    return;
  }

  HTTPClient http;
  String url = String("http://") + SERVER_HOST + ":" + SERVER_PORT + "/api/sensor-data";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  String payload = String("{") +
    "\"drain_id\":\"" + DRAIN_ID + "\"," +
    "\"distance\":" + String(distanceCm, 1) + "," +
    "\"waste_level\":" + String(wasteLevel, 1) + "," +
    "\"water_flow\":\"" + waterFlow + "\"" +
    "}";

  Serial.print("POST ");
  Serial.println(url);
  Serial.print("Body: ");
  Serial.println(payload);

  int httpCode = http.POST(payload);

  if (httpCode > 0) {
    Serial.printf("Server responded: %d\n", httpCode);
    Serial.println(http.getString());
  } else {
    Serial.printf("POST failed: %s\n", http.errorToString(httpCode).c_str());
  }

  http.end();
}

void setup() {
  Serial.begin(115200);
  delay(500);

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(FLOW_SWITCH_PIN, INPUT_PULLUP);

  connectWiFi();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  unsigned long now = millis();
  if (now - lastSendTime >= SEND_INTERVAL_MS || lastSendTime == 0) {
    lastSendTime = now;

    float distance = readDistanceCm();
    if (distance < 0) {
      Serial.println("Ultrasonic read failed, skipping this cycle.");
      return;
    }

    float wasteLevel = distanceToWasteLevel(distance);
    const char* waterFlow = readWaterFlow();

    Serial.printf("Distance: %.1f cm | Waste level: %.1f%% | Flow: %s\n",
                  distance, wasteLevel, waterFlow);

    sendReading(distance, wasteLevel, waterFlow);
  }

  delay(200);
}
