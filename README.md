# EcoDrain — Arduino Uno (USB, no WiFi)

Your Arduino has no WiFi, so it can't POST to the backend directly like the
ESP32 does. Instead:

```
HC-SR04 sensor -> Arduino Uno -> USB cable -> serial_bridge.py -> Flask backend
```

The Arduino just prints one line of text per reading over USB serial. A
small Python script on your computer reads that text and forwards it to
the same `/api/sensor-data` endpoint the ESP32 uses — so the backend logic
is identical either way.

## 1. Wire it up

Arduino Uno logic is 5V, same as the HC-SR04, so **no voltage divider is
needed here** (unlike the ESP32 version).

```
HC-SR04                Arduino Uno
-------                -----------
VCC       ---------->  5V
GND       ---------->  GND
TRIG      ---------->  Digital Pin 9
ECHO      ---------->  Digital Pin 10

Float switch            Arduino Uno
------------            -----------
Signal    ---------->   Digital Pin 7   (optional)
GND       ---------->   GND
```

No float switch? Leave pin 7 unconnected — flow will just always report
`NORMAL`.

## 2. Upload the sketch

Open `uno_usb_serial.ino` in the Arduino IDE. Edit near the top:

```cpp
const char* DRAIN_ID = "ED-001";       // must match a drain already in the backend
const float EMPTY_DISTANCE_CM = 20.0;  // calibrate for your mounting
const float FULL_DISTANCE_CM  = 2.0;
```

Select `Tools > Board > Arduino Uno` (or whichever board you have) and the
correct `Tools > Port`, then Upload.

**After uploading, close the Serial Monitor window if it's open** — only
one program can read the serial port at a time, and the bridge script
needs it.

## 3. Install and run the bridge script

In a terminal, on the same computer running `app.py`:

```bash
cd arduino/uno_usb_serial
pip install -r requirements.txt

# find your Arduino's port if you don't already know it:
python serial_bridge.py --list-ports

# then run the bridge (replace COM3 / /dev/ttyUSB0 with your actual port):
python serial_bridge.py --port COM3
```

You should see it print each line the Arduino sends, followed by
`-> POST 200: {...}` confirming the backend accepted it. Leave this
terminal running — it needs to stay open the whole time you want the
sensor feeding the dashboard.

## 4. Check the dashboard

With `python app.py` running in one terminal and `serial_bridge.py`
running in another, open `/dashboard` or `/map` in your browser. The
matching drain (`ED-001` by default) should update every 5 seconds
without touching the Live Demo Simulator.

## Troubleshooting

- **"could not open port" / "Access is denied"** — the Arduino IDE's
  Serial Monitor (or another program) is holding the port open. Close it
  and try again.
- **Bridge runs but no `POST` lines appear** — the Arduino is printing
  something that doesn't match the expected `DRAIN:...,DIST:...,LEVEL:...,FLOW:...`
  format. Check the raw `Arduino: ...` lines being printed for typos or
  garbled serial output (usually a baud rate mismatch — both the sketch
  and `--baud` must be 9600).
- **`POST` shows a 404** — `DRAIN_ID` in the sketch doesn't match an
  existing drain (`ED-001`..`ED-005` by default, case-sensitive).
- **Garbled/random characters** — baud rate mismatch, or a loose USB
  connection. Double-check `Serial.begin(9600)` in the sketch matches
  `--baud 9600` on the bridge script.
