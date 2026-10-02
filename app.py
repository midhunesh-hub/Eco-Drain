"""
EcoDrain — Smart Drainage Monitoring System
Flask backend: pages + REST API + SQLite storage.

Run with:  python app.py
Then open: http://127.0.0.1:5000
"""

from flask import Flask, render_template, request, jsonify
import sqlite3
import random
from datetime import datetime, timedelta

app = Flask(__name__)
DATABASE = "ecodrain.db"


# ============================================================
# DATABASE HELPERS
# ============================================================

def get_db():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS drains (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            drain_id TEXT UNIQUE,
            location TEXT,
            latitude REAL,
            longitude REAL,
            waste_level REAL DEFAULT 0,
            water_flow TEXT DEFAULT 'NORMAL',
            health_score INTEGER DEFAULT 100,
            status TEXT DEFAULT 'NORMAL',
            last_cleaned TEXT
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS sensor_readings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            drain_id TEXT,
            distance REAL,
            waste_level REAL,
            water_flow TEXT,
            timestamp TEXT
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            drain_id TEXT,
            alert_type TEXT,
            message TEXT,
            waste_level REAL,
            status TEXT DEFAULT 'ACTIVE',
            created_at TEXT,
            resolved_at TEXT
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS maintenance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            drain_id TEXT,
            before_level REAL,
            after_level REAL,
            assigned_to TEXT,
            status TEXT,
            cleaning_date TEXT,
            remarks TEXT
        )
    """)

    conn.commit()

    # Seed demo data only the first time the database is created,
    # so the dashboard/map/alerts pages already look "alive" for a demo.
    count = cur.execute("SELECT COUNT(*) FROM drains").fetchone()[0]

    if count == 0:
        demo_drains = [
            ("ED-001", "Town Hall Road, Simmakkal",   9.9195, 78.1193, 28, "NORMAL"),
            ("ED-002", "Anna Nagar Main Road",        9.9401, 78.1279, 68, "NORMAL"),
            ("ED-003", "Villapuram Bus Stand Road",   9.9078, 78.1547, 91, "LOW"),
            ("ED-004", "K.K. Nagar School Road",      9.9333, 78.1064, 12, "NORMAL"),
            ("ED-005", "Goripalayam Temple Street",   9.9280, 78.1219, 54, "NORMAL"),
        ]

        for drain_id, location, lat, lon, level, flow in demo_drains:
            status = get_status(level)
            health = calculate_health(level, flow)

            cur.execute("""
                INSERT INTO drains
                (drain_id, location, latitude, longitude,
                 waste_level, water_flow, health_score, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (drain_id, location, lat, lon, level, flow, health, status))

            # Seed a rising 24-hour trend so the charts have something
            # meaningful to show before any real / simulated reading arrives.
            base_level = max(3, level - 35)
            for hours_ago in range(24, -1, -2):
                ts = (datetime.now() - timedelta(hours=hours_ago)).strftime("%Y-%m-%d %H:%M:%S")
                progress = (24 - hours_ago) / 24
                sim_level = base_level + (level - base_level) * progress + random.uniform(-2, 2)
                sim_level = round(max(0, min(100, sim_level)), 1)
                sim_distance = round(20 - (sim_level / 100 * 15), 1)

                cur.execute("""
                    INSERT INTO sensor_readings
                    (drain_id, distance, waste_level, water_flow, timestamp)
                    VALUES (?, ?, ?, ?, ?)
                """, (drain_id, sim_distance, sim_level, flow, ts))

            if level > 75:
                alert_type = "IMMEDIATE" if level > 90 else "CRITICAL"
                cur.execute("""
                    INSERT INTO alerts (drain_id, alert_type, message, waste_level, status, created_at)
                    VALUES (?, ?, ?, ?, 'ACTIVE', ?)
                """, (drain_id, alert_type, f"Waste level reached {level}%", level,
                      datetime.now().strftime("%Y-%m-%d %H:%M:%S")))

        conn.commit()

    conn.close()


# ============================================================
# SMART LOGIC
# ============================================================

def get_status(waste_level):
    if waste_level <= 50:
        return "NORMAL"
    elif waste_level <= 75:
        return "WARNING"
    elif waste_level <= 90:
        return "CRITICAL"
    else:
        return "IMMEDIATE ACTION"


def calculate_health(waste_level, water_flow):
    score = 100 - int(waste_level * 0.6)
    if water_flow == "LOW":
        score -= 15
    elif water_flow == "BLOCKED":
        score -= 30
    return max(0, min(100, score))


# ============================================================
# PAGE ROUTES
# ============================================================

@app.route("/")
def index():
    return render_template("index.html", active="home")


@app.route("/dashboard")
def dashboard():
    return render_template("dashboard.html", active="dashboard")


@app.route("/map")
def map_page():
    return render_template("map.html", active="map")


@app.route("/alerts")
def alerts_page():
    return render_template("alerts.html", active="alerts")


@app.route("/analytics")
def analytics_page():
    return render_template("analytics.html", active="analytics")


@app.route("/maintenance")
def maintenance_page():
    return render_template("maintenance.html", active="maintenance")


# ============================================================
# DRAIN APIs
# ============================================================

@app.route("/api/drains")
def api_get_drains():
    conn = get_db()
    drains = conn.execute("SELECT * FROM drains ORDER BY drain_id").fetchall()
    conn.close()
    return jsonify([dict(row) for row in drains])


@app.route("/api/drains/<drain_id>")
def api_get_drain(drain_id):
    conn = get_db()
    drain = conn.execute("SELECT * FROM drains WHERE drain_id = ?", (drain_id,)).fetchone()
    conn.close()
    if not drain:
        return jsonify({"error": "Drain not found"}), 404
    return jsonify(dict(drain))


@app.route("/api/drains/<drain_id>/history")
def api_get_history(drain_id):
    conn = get_db()
    rows = conn.execute("""
        SELECT waste_level, water_flow, timestamp FROM sensor_readings
        WHERE drain_id = ? ORDER BY timestamp ASC
    """, (drain_id,)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/drains/<drain_id>/prediction")
def api_prediction(drain_id):
    conn = get_db()
    rows = conn.execute("""
        SELECT waste_level, timestamp FROM sensor_readings
        WHERE drain_id = ? ORDER BY timestamp ASC
    """, (drain_id,)).fetchall()
    conn.close()

    if len(rows) < 2:
        return jsonify({"available": False, "message": "Not enough data yet"})

    first, last = rows[0], rows[-1]
    t1 = datetime.strptime(first["timestamp"], "%Y-%m-%d %H:%M:%S")
    t2 = datetime.strptime(last["timestamp"], "%Y-%m-%d %H:%M:%S")
    hours = max((t2 - t1).total_seconds() / 3600, 0.1)

    rate_per_hour = (last["waste_level"] - first["waste_level"]) / hours
    current = last["waste_level"]

    if rate_per_hour <= 0:
        return jsonify({
            "available": True,
            "current_level": current,
            "rate_per_day": round(rate_per_hour * 24, 2),
            "hours_to_critical": None,
            "recommendation": "Stable — no cleaning needed yet."
        })

    hours_to_90 = max((90 - current) / rate_per_hour, 0)

    return jsonify({
        "available": True,
        "current_level": current,
        "rate_per_day": round(rate_per_hour * 24, 2),
        "hours_to_critical": round(hours_to_90, 1),
        "recommendation": "Schedule cleaning soon." if hours_to_90 < 48 else "Monitor normally."
    })


# ============================================================
# SENSOR INGEST — shared by the real ESP32 endpoint and the
# in-browser "Live Demo Simulator" on the dashboard.
# ============================================================

def ingest_reading(drain_id, distance, waste_level, water_flow):
    status = get_status(waste_level)
    health_score = calculate_health(waste_level, water_flow)
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    conn = get_db()

    exists = conn.execute("SELECT 1 FROM drains WHERE drain_id = ?", (drain_id,)).fetchone()
    if not exists:
        conn.close()
        return {"error": f"Unknown drain_id '{drain_id}'"}, 404

    conn.execute("""
        UPDATE drains SET waste_level = ?, water_flow = ?, health_score = ?, status = ?
        WHERE drain_id = ?
    """, (waste_level, water_flow, health_score, status, drain_id))

    conn.execute("""
        INSERT INTO sensor_readings (drain_id, distance, waste_level, water_flow, timestamp)
        VALUES (?, ?, ?, ?, ?)
    """, (drain_id, distance, waste_level, water_flow, now))

    # Only raise a NEW alert if there isn't already an active one of the
    # same severity — the original design re-inserted an alert on every
    # single reading above 75%, which would spam the Alerts page.
    if waste_level > 75:
        alert_type = "IMMEDIATE" if waste_level > 90 else "CRITICAL"
        already_active = conn.execute("""
            SELECT id FROM alerts WHERE drain_id = ? AND status = 'ACTIVE' AND alert_type = ?
        """, (drain_id, alert_type)).fetchone()

        if not already_active:
            conn.execute("""
                INSERT INTO alerts (drain_id, alert_type, message, waste_level, status, created_at)
                VALUES (?, ?, ?, ?, 'ACTIVE', ?)
            """, (drain_id, alert_type, f"Waste level reached {waste_level}%", waste_level, now))
    else:
        # Waste level dropped back down (e.g. after cleaning) — auto-resolve.
        conn.execute("""
            UPDATE alerts SET status = 'RESOLVED', resolved_at = ?
            WHERE drain_id = ? AND status = 'ACTIVE'
        """, (now, drain_id))

    conn.commit()
    conn.close()

    return {
        "success": True,
        "drain_id": drain_id,
        "waste_level": waste_level,
        "status": status,
        "health_score": health_score
    }, 200


@app.route("/api/sensor-data", methods=["POST"])
def api_sensor_data():
    """Real ESP32 devices POST here."""
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "No JSON data received"}), 400

    drain_id = data.get("drain_id")
    if not drain_id:
        return jsonify({"error": "drain_id is required"}), 400

    try:
        distance = float(data.get("distance", 0))
        waste_level = float(data.get("waste_level", 0))
    except (TypeError, ValueError):
        return jsonify({"error": "distance and waste_level must be numbers"}), 400

    waste_level = max(0, min(100, waste_level))
    water_flow = data.get("water_flow", "NORMAL")
    if water_flow not in ("NORMAL", "LOW", "BLOCKED"):
        water_flow = "NORMAL"

    result, code = ingest_reading(drain_id, distance, waste_level, water_flow)
    return jsonify(result), code


@app.route("/api/simulate", methods=["POST"])
def api_simulate():
    """
    The Dashboard's 'Live Demo Simulator' calls this so you can show the
    full pipeline (reading -> status -> alert -> map -> analytics) working
    live on stage even before the ESP32 hardware is wired up.
    """
    data = request.get_json(silent=True) or {}
    drain_id = data.get("drain_id", "ED-001")

    try:
        waste_level = max(0, min(100, float(data.get("waste_level", 50))))
    except (TypeError, ValueError):
        return jsonify({"error": "waste_level must be a number"}), 400

    water_flow = data.get("water_flow", "NORMAL")
    distance = round(20 - (waste_level / 100 * 15), 1)

    result, code = ingest_reading(drain_id, distance, waste_level, water_flow)
    return jsonify(result), code


# ============================================================
# ALERTS
# ============================================================

@app.route("/api/alerts")
def api_get_alerts():
    conn = get_db()
    alerts = conn.execute("SELECT * FROM alerts ORDER BY id DESC").fetchall()
    conn.close()
    return jsonify([dict(row) for row in alerts])


@app.route("/api/alerts/<int:alert_id>/resolve", methods=["POST"])
def api_resolve_alert(alert_id):
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn = get_db()
    conn.execute("UPDATE alerts SET status = 'RESOLVED', resolved_at = ? WHERE id = ?", (now, alert_id))
    conn.commit()
    conn.close()
    return jsonify({"success": True})


# ============================================================
# ANALYTICS
# ============================================================

@app.route("/api/analytics")
def api_analytics():
    conn = get_db()

    total_drains = conn.execute("SELECT COUNT(*) FROM drains").fetchone()[0]
    critical = conn.execute("SELECT COUNT(*) FROM drains WHERE waste_level > 75").fetchone()[0]
    avg_waste = conn.execute("SELECT AVG(waste_level) FROM drains").fetchone()[0]
    avg_health = conn.execute("SELECT AVG(health_score) FROM drains").fetchone()[0]
    total_alerts = conn.execute("SELECT COUNT(*) FROM alerts").fetchone()[0]
    active_alerts = conn.execute("SELECT COUNT(*) FROM alerts WHERE status='ACTIVE'").fetchone()[0]
    total_maintenance = conn.execute("SELECT COUNT(*) FROM maintenance").fetchone()[0]

    conn.close()

    return jsonify({
        "total_drains": total_drains,
        "critical_drains": critical,
        "average_waste": round(avg_waste or 0, 1),
        "average_health": round(avg_health or 0, 1),
        "total_alerts": total_alerts,
        "active_alerts": active_alerts,
        "total_maintenance": total_maintenance
    })


# ============================================================
# MAINTENANCE
# ============================================================

@app.route("/api/maintenance", methods=["GET", "POST"])
def api_maintenance():
    if request.method == "GET":
        conn = get_db()
        rows = conn.execute("SELECT * FROM maintenance ORDER BY id DESC").fetchall()
        conn.close()
        return jsonify([dict(r) for r in rows])

    data = request.get_json(silent=True) or {}
    drain_id = data.get("drain_id")
    before_level = data.get("before_level")
    after_level = data.get("after_level")
    assigned_to = data.get("assigned_to") or "Maintenance Team"
    remarks = data.get("remarks", "")

    if not drain_id or before_level is None or after_level is None:
        return jsonify({"error": "drain_id, before_level and after_level are required"}), 400

    try:
        before_level_f = float(before_level)
        after_level_f = float(after_level)
    except (TypeError, ValueError):
        return jsonify({"error": "before_level and after_level must be numbers"}), 400

    date = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn = get_db()

    exists = conn.execute("SELECT 1 FROM drains WHERE drain_id = ?", (drain_id,)).fetchone()
    if not exists:
        conn.close()
        return jsonify({"error": f"Unknown drain_id '{drain_id}'"}), 404

    conn.execute("""
        INSERT INTO maintenance (drain_id, before_level, after_level, assigned_to, status, cleaning_date, remarks)
        VALUES (?, ?, ?, ?, 'COMPLETED', ?, ?)
    """, (drain_id, before_level_f, after_level_f, assigned_to, date, remarks))

    status = get_status(after_level_f)
    health = calculate_health(after_level_f, "NORMAL")

    conn.execute("""
        UPDATE drains SET waste_level = ?, status = ?, health_score = ?, water_flow = 'NORMAL', last_cleaned = ?
        WHERE drain_id = ?
    """, (after_level_f, status, health, date, drain_id))

    conn.execute("""
        UPDATE alerts SET status = 'RESOLVED', resolved_at = ?
        WHERE drain_id = ? AND status = 'ACTIVE'
    """, (date, drain_id))

    conn.execute("""
        INSERT INTO sensor_readings (drain_id, distance, waste_level, water_flow, timestamp)
        VALUES (?, ?, ?, 'NORMAL', ?)
    """, (drain_id, round(20 - (after_level_f / 100 * 15), 1), after_level_f, date))

    conn.commit()
    conn.close()

    return jsonify({"success": True, "message": f"Maintenance recorded for {drain_id}."})


# ============================================================
# RUN
# ============================================================

if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=5000, debug=True)
