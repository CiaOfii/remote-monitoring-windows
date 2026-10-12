import asyncio
import base64
import ctypes
import io
import json
import subprocess
import time
from datetime import datetime
from pathlib import Path

import mss
import psutil
import win32gui
import win32process
import websockets
from PIL import Image

# Relay Server berjalan di laptop yang sama.
SERVER_URL = "ws://127.0.0.1:8080/ws"
BASE_DIR = Path(__file__).resolve().parent
ENV_FILE = BASE_DIR.parent / "server" / ".env"
SCREENSHOT_INTERVAL = 3.0
SCREENSHOT_MAX_WIDTH = 800


def get_token():
    """Baca token autentikasi tanpa menampilkannya ke terminal."""
    if not ENV_FILE.exists():
        raise FileNotFoundError(
            "File server/.env tidak ditemukan. Pastikan folder server ada."
        )

    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line.startswith("MONITOR_TOKEN="):
            token = line.split("=", 1)[1].strip().strip('"').strip("'")
            if len(token) >= 32:
                return token

    raise ValueError("MONITOR_TOKEN tidak ditemukan atau tidak valid.")


def get_active_window():
    """Ambil proses dan judul jendela yang sedang berada di depan."""
    hwnd = win32gui.GetForegroundWindow()
    title = win32gui.GetWindowText(hwnd) if hwnd else ""
    process_name = "unknown"

    if hwnd:
        try:
            _, pid = win32process.GetWindowThreadProcessId(hwnd)
            process_name = psutil.Process(pid).name()
        except (psutil.Error, OSError):
            pass

    return {"title": title[:300], "process": process_name}


def get_system_status():
    battery = psutil.sensors_battery()
    return {
        "cpu_percent": psutil.cpu_percent(interval=None),
        "ram_percent": psutil.virtual_memory().percent,
        "battery_percent": battery.percent if battery else None,
        "plugged_in": battery.power_plugged if battery else None,
    }


def capture_screen():
    """Ambil screenshot lalu perkecil agar pengiriman ke HP lebih ringan."""
    with mss.mss() as sct:
        monitor = sct.monitors[1]
        shot = sct.grab(monitor)

    image = Image.frombytes("RGB", shot.size, shot.rgb)
    if image.width > SCREENSHOT_MAX_WIDTH:
        new_height = max(1, int(image.height * SCREENSHOT_MAX_WIDTH / image.width))
        image = image.resize((SCREENSHOT_MAX_WIDTH, new_height), Image.Resampling.LANCZOS)
    return image


def make_screenshot_packet():
    """Buat pesan screenshot JPEG base64; bukan hanya nama file."""
    image = capture_screen()
    # Simpan salinan lokal seperti pada versi sebelumnya.
    image.save(BASE_DIR / "preview.jpg", format="JPEG", quality=48, optimize=True)

    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=48, optimize=True)
    image_data = base64.b64encode(buffer.getvalue()).decode("ascii")

    return {
        "type": "screenshot",
        "data": {
            "timestamp": datetime.now().isoformat(timespec="seconds"),
            "image_data": "data:image/jpeg;base64," + image_data,
            "screen_size": list(image.size),
        },
    }


def run_command(command):
    """Eksekusi hanya perintah kendali yang diizinkan, bukan shell bebas."""
    if command == "lock":
        try:
            success = bool(ctypes.windll.user32.LockWorkStation())
            if success:
                return True, "Perintah Lock Windows telah dijalankan."
            return False, "Windows menolak perintah Lock Workstation."
        except Exception as exc:
            return False, f"Gagal mengunci Windows: {exc}"

    if command == "shutdown":
        try:
            subprocess.run(
                [
                    "shutdown.exe", "/s", "/t", "30",
                    "/c", "Shutdown dijadwalkan dari Remote Monitoring.",
                ],
                check=True,
                capture_output=True,
                text=True,
                timeout=10,
            )
            return True, "Shutdown dijadwalkan 30 detik lagi. Kamu masih bisa membatalkannya dari HP."
        except (subprocess.SubprocessError, OSError) as exc:
            return False, f"Gagal menjadwalkan shutdown: {exc}"

    if command == "cancel_shutdown":
        try:
            subprocess.run(
                ["shutdown.exe", "/a"],
                check=True,
                capture_output=True,
                text=True,
                timeout=10,
            )
            return True, "Jadwal shutdown berhasil dibatalkan."
        except subprocess.CalledProcessError:
            return False, "Tidak ada shutdown tertunda, atau Windows tidak dapat membatalkannya."
        except (subprocess.SubprocessError, OSError) as exc:
            return False, f"Gagal membatalkan shutdown: {exc}"

    return False, "Perintah tidak diizinkan."


async def send_telemetry(websocket):
    """Kirim metrik tiap detik dan screenshot sekitar setiap 3 detik."""
    psutil.cpu_percent(interval=None)
    last_screenshot = 0.0

    while True:
        started = time.monotonic()
        record = {
            "timestamp": datetime.now().isoformat(timespec="seconds"),
            "window": get_active_window(),
            "system": get_system_status(),
            "screenshot": "preview.jpg",
        }
        await websocket.send(json.dumps({"type": "telemetry", "data": record}, ensure_ascii=False))

        now = time.monotonic()
        if now - last_screenshot >= SCREENSHOT_INTERVAL:
            try:
                packet = make_screenshot_packet()
                await websocket.send(json.dumps(packet, ensure_ascii=False))
            except Exception as exc:
                print(f"[SCREENSHOT GAGAL] {type(exc).__name__}: {exc}")
            last_screenshot = time.monotonic()

        elapsed = time.monotonic() - started
        await asyncio.sleep(max(0.0, 1.0 - elapsed))


async def receive_commands(websocket):
    """Terima daftar perintah terbatas dari Relay Server."""
    async for raw in websocket:
        try:
            message = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            continue

        if not isinstance(message, dict) or message.get("type") != "command":
            continue

        command = message.get("command")
        command_id = message.get("commandId")
        if command not in {"lock", "shutdown", "cancel_shutdown"}:
            success, result_text = False, "Perintah tidak diizinkan."
        else:
            print(f"[PERINTAH DITERIMA] {command}")
            # Perintah OS bersifat sinkron; jalankan di thread agar loop WebSocket tetap responsif.
            success, result_text = await asyncio.to_thread(run_command, command)

        result = {
            "type": "command_result",
            "data": {
                "command": command,
                "commandId": command_id,
                "success": success,
                "message": result_text,
                "timestamp": datetime.now().isoformat(timespec="seconds"),
            },
        }
        try:
            await websocket.send(json.dumps(result, ensure_ascii=False))
        except websockets.ConnectionClosed:
            return


async def send_monitoring_data():
    token = get_token()
    headers = {"x-monitor-token": token, "x-monitor-role": "agent"}

    print("=" * 58)
    print(" REMOTE MONITORING - LAPTOP AGENT")
    print("=" * 58)
    print("Relay:", SERVER_URL)
    print("Mode: telemetri, riwayat aplikasi, screenshot, kendali terbatas")
    print("Screenshot dikirim tiap sekitar 3 detik; file lokal: agent/preview.jpg")
    print("Perintah yang diterima: lock, shutdown (jeda 30 detik), cancel_shutdown")
    print("Tekan Ctrl+C untuk berhenti.\n")

    while True:
        try:
            async with websockets.connect(
                SERVER_URL,
                additional_headers=headers,
                open_timeout=5,
                max_size=4 * 1024 * 1024,
                ping_interval=20,
                ping_timeout=20,
            ) as websocket:
                print("[TERHUBUNG] Agent tersambung ke Relay Server.")
                telemetry_task = asyncio.create_task(send_telemetry(websocket))
                command_task = asyncio.create_task(receive_commands(websocket))
                done, pending = await asyncio.wait(
                    {telemetry_task, command_task},
                    return_when=asyncio.FIRST_COMPLETED,
                )
                for task in pending:
                    task.cancel()
                await asyncio.gather(*pending, return_exceptions=True)
                for task in done:
                    exception = task.exception()
                    if exception:
                        raise exception
        except asyncio.CancelledError:
            raise
        except Exception as error:
            print(f"[KONEKSI TERPUTUS] {type(error).__name__}: {error}")
            print("Mencoba tersambung kembali dalam 3 detik...")
            await asyncio.sleep(3)


def main():
    try:
        asyncio.run(send_monitoring_data())
    except KeyboardInterrupt:
        print("\nMonitoring dihentikan oleh pengguna.")


if __name__ == "__main__":
    main()
