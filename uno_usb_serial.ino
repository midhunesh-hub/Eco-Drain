/*
  EcoDrain — Arduino Uno Sensor Node (USB / no WiFi)
  ---------------------------------------------------
  For a plain Arduino (Uno, Nano, Mega, etc.) with no WiFi or Ethernet
  hardware. The Arduino reads the HC-SR04 ultrasonic sensor and an
  optional float switch, then prints one line of sensor data over USB
  Serial every SEND_INTERVAL_MS.

  A small Python script running on the same computer (see
  ../uno_usb_serial/serial_bridge.py) reads that USB serial port,
  parses the line, and forwards it to the Flask backend's
  POST /api/sensor-data endpoint — so no backend changes and no WiFi
  hardware are needed.

  Hardware
  --------
  - Arduino Uno (or compatible)
  - HC-SR04 ultrasonic sensor
  - Float switch (optional — leave FLOW_SWITCH_PIN unconnected and it
    will just always report NORMAL)

  Wiring (Arduino Uno logic is 5V, same as HC-SR04 — NO voltage
  divider needed here, unlike the ESP32 version)
  -----------------------------------------------------------------
  HC-SR04         Arduino Uno
  -------         -----------
  VCC     ---->   5V
  GND     ---->   GND
  TRIG    ---->   Digital Pin 9
  ECHO    ---->   Digital Pin 10

  Float switch    Arduino Uno
  ------------    -----------
  Signal  ---->   Digital Pin 7
  GND     ---->   GND

  Setup
  -----
  1. Set DRAIN_ID below to match a drain already in the backend
     (ED-001 .. ED-005), or one you create.
  2. Calibrate EMPTY_DISTANCE_CM / FULL_DISTANCE_CM for your mounting
     (same idea as the ESP32 version — see arduino/README.md).
  3. Upload this sketch, then CLOSE the Arduino IDE's Serial Monitor
     (it locks the port — the Python bridge script needs it free).
  4. Run the bridge script: see arduino/uno_usb_serial/README.md
*/

// ------------------------------------------------------------------
// EDIT THESE FOR YOUR SETUP
// ------------------------------------------------------------------
const char* DRAIN_ID = "ED-001";   // must match a drain_id in the backend

// Calibration: measure with a tape once the sensor is mounted.
const float EMPTY_DISTANCE_CM = 20.0;  // reading when drain is empty (0%)
const float FULL_DISTANCE_CM  = 2.0;   // reading when drain is full (100%)

const unsigned long SEND_INTERVAL_MS = 5000; // one line every 5s

// ------------------------------------------------------------------
// PIN CONFIG
// ------------------------------------------------------------------
const int TRIG_PIN        = 9;
const int ECHO_PIN        = 10;
const int FLOW_SWITCH_PIN = 7;

unsigned long lastSendTime = 0;

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

    long duration = pulseIn(ECHO_PIN, HIGH, 30000UL);
    if (duration > 0) {
      samples[valid++] = duration * 0.0343 / 2.0;
    }
    delay(30);
  }

  if (valid == 0) return -1;

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
  float level = (EMPTY_DISTANCE_CM - distanceCm) / (EMPTY_DISTANCE_CM - FULL_DISTANCE_CM) * 100.0;
  if (level < 0) level = 0;
  if (level > 100) level = 100;
  return level;
}

const char* readWaterFlow() {
  bool triggered = (digitalRead(FLOW_SWITCH_PIN) == LOW);
  return triggered ? "LOW" : "NORMAL";
}

void setup() {
  Serial.begin(9600);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(FLOW_SWITCH_PIN, INPUT_PULLUP);
  delay(500);
  Serial.println("EcoDrain Uno node ready.");
}

void loop() {
  unsigned long now = millis();
  if (now - lastSendTime >= SEND_INTERVAL_MS || lastSendTime == 0) {
    lastSendTime = now;

    float distance = readDistanceCm();
    if (distance < 0) {
      // sensor read failed this cycle, skip the line
      return;
    }

    float wasteLevel = distanceToWasteLevel(distance);
    const char* waterFlow = readWaterFlow();

    // One CSV line per reading, easy for the Python bridge to parse:
    // DRAIN:ED-001,DIST:12.34,LEVEL:56.78,FLOW:NORMAL
    Serial.print("DRAIN:");
    Serial.print(DRAIN_ID);
    Serial.print(",DIST:");
    Serial.print(distance, 2);
    Serial.print(",LEVEL:");
    Serial.print(wasteLevel, 2);
    Serial.print(",FLOW:");
    Serial.println(waterFlow);
  }
}
