"""
EcoDrain — Arduino Uno Serial Bridge
-------------------------------------
Reads CSV lines printed by uno_usb_serial.ino over the USB serial port
(e.g. "DRAIN:ED-001,DIST:12.34,LEVEL:56.78,FLOW:NORMAL") and forwards
each reading to the Flask backend's POST /api/sensor-data endpoint.

Run this on the SAME computer that:
  1. Has app.py running (the Flask backend), and
  2. Has the Arduino plugged in over USB.

Usage
-----
    pip install pyserial requests
    python serial_bridge.py --port COM3                 (Windows)
    python serial_bridge.py --port /dev/ttyUSB0          (Linux)
    python serial_bridge.py --port /dev/cu.usbmodem14101 (macOS)

Run `python serial_bridge.py --list-ports` if you're not sure which
port your Arduino is on.

IMPORTANT: close the Arduino IDE's Serial Monitor before running this
script — only one program can hold the serial port open at a time.
"""

import argparse
import re
import sys
import time

import requests
import serial
import serial.tools.list_ports

LINE_PATTERN = re.compile(
    r"DRAIN:(?P<drain_id>[\w-]+),DIST:(?P<distance>[\d.]+),"
    r"LEVEL:(?P<waste_level>[\d.]+),FLOW:(?P<water_flow>\w+)"
)


def list_ports():
    ports = list(serial.tools.list_ports.comports())
    if not ports:
        print("No serial ports found.")
        return
    print("Available serial ports:")
    for p in ports:
        print(f"  {p.device}  —  {p.description}")


def parse_line(line: str):
    match = LINE_PATTERN.search(line)
    if not match:
        return None
    return {
        "drain_id": match.group("drain_id"),
        "distance": float(match.group("distance")),
        "waste_level": float(match.group("waste_level")),
        "water_flow": match.group("water_flow"),
    }


def run_bridge(port: str, baud: int, server_url: str):
    print(f"Opening {port} at {baud} baud...")
    ser = serial.Serial(port, baud, timeout=2)
    time.sleep(2)  # let the Arduino reset after the serial connection opens

    print(f"Forwarding readings to {server_url}")
    print("Press Ctrl+C to stop.\n")

    while True:
        try:
            raw = ser.readline().decode("utf-8", errors="ignore").strip()
            if not raw:
                continue

            print(f"Arduino: {raw}")

            reading = parse_line(raw)
            if reading is None:
                # probably a startup/debug message, not a data line
                continue

            try:
                resp = requests.post(server_url, json=reading, timeout=5)
                print(f"  -> POST {resp.status_code}: {resp.text.strip()}")
            except requests.exceptions.RequestException as exc:
                print(f"  -> Failed to reach backend: {exc}")

        except KeyboardInterrupt:
            print("\nStopping bridge.")
            break
        except serial.SerialException as exc:
            print(f"Serial error: {exc}")
            break


def main():
    parser = argparse.ArgumentParser(description="EcoDrain Arduino serial bridge")
    parser.add_argument("--port", help="Serial port, e.g. COM3 or /dev/ttyUSB0")
    parser.add_argument("--baud", type=int, default=9600, help="Baud rate (must match the sketch, default 9600)")
    parser.add_argument(
        "--server",
        default="http://127.0.0.1:5000/api/sensor-data",
        help="Backend URL (default: http://127.0.0.1:5000/api/sensor-data)",
    )
    parser.add_argument("--list-ports", action="store_true", help="List available serial ports and exit")
    args = parser.parse_args()

    if args.list_ports:
        list_ports()
        return

    if not args.port:
        print("Error: --port is required (or use --list-ports to find it).")
        sys.exit(1)

    run_bridge(args.port, args.baud, args.server)


if __name__ == "__main__":
    main()
