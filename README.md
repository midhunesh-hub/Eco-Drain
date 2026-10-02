# 🌱 EcoDrain — Smart Drainage Monitoring System

A full-stack IoT-ready web app for the EcoDrain project: Flask + SQLite backend,
a live dashboard, drain map, alerts, analytics and maintenance workflow — plus a
built-in **Live Demo Simulator** so you can show the whole pipeline working on
stage even before your ESP32 hardware is wired up.

## 1. Run it (VS Code / terminal)

```bash
cd ecodrain_webapp

python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

pip install -r requirements.txt
python app.py
```

Open **http://127.0.0.1:5000** in your browser. `ecodrain.db` (SQLite) is created
automatically on first run, pre-seeded with 5 demo drains at different waste
levels so every page already looks "alive."

To start completely fresh, just delete `ecodrain.db` and run `python app.py` again.

## 2. Pages

| Route | What it shows |
|---|---|
| `/` | Landing page with live stat strip |
| `/dashboard` | Gauge, live bar chart, drain list, recent alerts, **Live Demo Simulator** |
| `/map` | Leaflet map, color-coded markers per drain status |
| `/alerts` | Filterable alert feed with Resolve action |
| `/analytics` | Network KPIs, per-drain history chart, simple predictive-maintenance estimate |
| `/maintenance` | Priority queue + cleaning log form + history table |

## 3. Live demo without hardware

On `/dashboard`, use **🎮 Live Demo Simulator**: pick a drain, drag the waste-level
slider, hit **Send Reading**. It calls the same `/api/sensor-data`-style pipeline
your ESP32 will use, so you can demonstrate the full story —
`reading → status change → alert → map color → analytics` — live, on stage,
with just a mouse.

## 4. Connecting the real ESP32

Point your ESP32 sketch's `POST` requests at:

```
http://YOUR_COMPUTER_IP:5000/api/sensor-data
```

with a JSON body:

```json
{ "drain_id": "ED-001", "distance": 8.2, "waste_level": 80, "water_flow": "NORMAL" }
```

Find `YOUR_COMPUTER_IP` with `ipconfig` (Windows) or `ifconfig`/`ip a` (macOS/Linux),
and make sure your ESP32 and laptop are on the **same Wi-Fi network**.

Remember: an HC-SR04's ECHO pin outputs 5V — use a voltage divider before wiring
it into an ESP32 GPIO (which expects 3.3V).

**Ready-to-flash firmware:** see `arduino/esp32_drain_sensor/esp32_drain_sensor.ino`
and `arduino/README.md` for the full wiring diagram, calibration steps, and
setup instructions — just fill in your WiFi credentials, computer's IP, and
drain ID, then upload.

## 5. Project structure

```
ecodrain_webapp/
├── app.py                  ← Flask backend + REST API + SQLite
├── requirements.txt
├── templates/
│   ├── _nav.html           ← shared navbar (included on every page)
│   ├── index.html
│   ├── dashboard.html
│   ├── map.html
│   ├── alerts.html
│   ├── analytics.html
│   └── maintenance.html
└── static/
    ├── css/style.css       ← full design system (colors, cards, gauge, forms...)
    └── js/
        ├── main.js         ← shared: mobile nav toggle, status helpers
        ├── dashboard.js
        ├── map.js
        ├── alerts.js
        ├── analytics.js
        └── maintenance.js
```

## 6. Fixes made to the original draft

- Every reading above 75% no longer inserts a **new** alert row — it only creates
  one if there isn't already an active alert of the same severity, so the Alerts
  page doesn't get spammed by a live sensor.
- Waste levels dropping back under 75% now **auto-resolve** the active alert.
- `waste_level` sent to `/api/sensor-data` is now clamped to 0–100 and validated
  as numeric before use (bad ESP32 payloads no longer 500-error the server).
- `/api/maintenance` now also accepts `GET` (used by the history table) in
  addition to `POST`.
- Added `/api/drains/<id>/history` and `/api/drains/<id>/prediction` so
  Analytics has real per-drain trend + predictive-maintenance data instead of
  only current snapshots.
- Added `/api/simulate` — the Live Demo Simulator's endpoint — so you're not
  dependent on the ESP32 being present to demonstrate the system end-to-end.
- Demo data is now seeded with 5 drains at varied levels (including one already
  in "IMMEDIATE ACTION") plus 24 hours of synthetic history, so the dashboard,
  map and analytics pages look complete the moment you open them.

## 7. Where to go next (Version 2 ideas)

- Admin login before `/maintenance` and `/api/maintenance`
- Browser push notifications on new CRITICAL/IMMEDIATE alerts
- Swap SQLite for MySQL (the queries are plain SQL, so this is a small change)
- Rainfall/weather API integration to estimate flood risk, not just trap fill level
