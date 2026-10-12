# REMOTE MONITORING — PANDUAN INSTALASI WINDOWS

## 1. DESKRIPSI

Remote Monitoring adalah proyek pemantauan laptop Windows menggunakan Python, Node.js, WebSocket, dan dashboard web.

Fitur utama:
- Monitoring penggunaan CPU, RAM, baterai, dan status pengisian daya.
- Menampilkan proses serta judul jendela yang sedang aktif.
- Riwayat perpindahan aplikasi aktif selama dashboard terbuka.
- Melihat screenshot layar laptop dari dashboard.
- Mengunci Windows dari jarak jauh.
- Menjadwalkan shutdown dengan konfirmasi dan opsi pembatalan.

Gunakan sistem hanya pada perangkat milik sendiri atau perangkat yang pemiliknya memberikan izin.

## 2. PERSYARATAN

- Windows 10/11 dengan sesi pengguna yang aktif.
- Python dan pip.
- Node.js dan npm.
- Tailscale untuk akses jarak jauh melalui jaringan privat.
- Koneksi jaringan antara agent, server, dan perangkat viewer.

## 3. STRUKTUR PROYEK

- `agent/main.py` — mengambil telemetri, informasi jendela aktif, dan screenshot.
- `agent/requirements.txt` — dependensi Python.
- `server/index.js` — relay server, autentikasi, dan pengiriman data.
- `server/package.json` — konfigurasi serta dependensi Node.js.
- `server/.env.example` — contoh konfigurasi tanpa token asli.
- `mobile/index.html` — dashboard web.
- `start-server.ps1` — skrip peluncur server.
- `start-agent.ps1` — skrip peluncur agent.
- `docs/` — dokumentasi arsitektur dan keamanan.

## 4. INSTALASI PERTAMA

### A. Instal dependensi server

Buka PowerShell di folder proyek:

    cd server
    npm ci

Salin file contoh konfigurasi:

    Copy-Item .env.example .env

Buka `server/.env` dan isi `MONITOR_TOKEN` dengan token acak milik sendiri yang memenuhi validasi server. Jangan menggunakan nilai placeholder dari file contoh.

Jangan membagikan file `.env` atau memasukkannya ke repository Git.

### B. Instal dependensi agent

Kembali ke root proyek:

    cd ..
    py -m venv agent\.venv
    .\agent\.venv\Scripts\python.exe -m pip install -r agent\requirements.txt

Jika virtual environment sudah tersedia, bagian pembuatan virtual environment tidak perlu diulang.

## 5. MENJALANKAN SECARA MANUAL

### Terminal 1 — Relay Server

    cd server
    npm start

### Terminal 2 — Agent

Dari root proyek:

    .\agent\.venv\Scripts\python.exe .\agent\main.py

Biarkan kedua proses tetap berjalan selama monitoring digunakan.

### Membuka dashboard

Pada laptop yang sama, buka:

    http://127.0.0.1:8080

Tekan tombol Hubungkan dan masukkan token yang telah dikonfigurasi.

## 6. AKSES DARI HP

1. Pasang Tailscale pada laptop dan HP.
2. Hubungkan keduanya ke jaringan privat Tailscale yang sesuai.
3. Pastikan Relay Server dan Agent sedang berjalan.
4. Gunakan alamat privat yang telah dikonfigurasi untuk akses dashboard.
5. Tekan Hubungkan dan masukkan token yang benar.

Gunakan placeholder alamat dalam dokumentasi publik, bukan alamat IP privat laptop milik pengembang.

Jangan mengaktifkan Tailscale Funnel atau membuka server langsung ke internet publik tanpa peninjauan keamanan tambahan.

## 7. MENJALANKAN SECARA OTOMATIS

Proyek dapat dikonfigurasi menggunakan Windows Task Scheduler agar server dan agent berjalan setelah pengguna login ke Windows.

Nama tugas yang digunakan pada konfigurasi pengembang:
- `RemoteMonitoring-Server`
- `RemoteMonitoring-Agent`

Skrip peluncur perlu disesuaikan jika proyek dipasang di lokasi berbeda. Untuk melihat layar interaktif dan mengambil screenshot, agent memerlukan sesi pengguna Windows yang sesuai.

Untuk menghentikan seluruh monitoring, hentikan tugas otomatis dan proses peluncur serta proses turunannya dengan prosedur penghentian yang sesuai. Menonaktifkan tugas saja belum tentu menghentikan proses yang sudah berjalan.

## 8. KEAMANAN DAN PRIVASI

- Jangan mengunggah `server/.env`, token, password, atau kredensial.
- Jangan mengunggah folder `.venv`, `node_modules`, log, atau screenshot pribadi.
- Screenshot dapat berisi dokumen dan informasi sensitif.
- Batasi akses dashboard ke perangkat tepercaya pada jaringan privat.
- Gunakan fitur kendali jarak jauh hanya pada perangkat yang dimiliki atau yang penggunaannya telah diizinkan.
- Konfirmasi tindakan sebelum mengunci atau mematikan laptop.

## 9. BATASAN

- Laptop harus menyala dan terhubung ke jaringan agar monitoring dapat berjalan.
- Agent membutuhkan sesi Windows pengguna yang sesuai untuk membaca jendela aktif dan menangkap layar.
- Riwayat aplikasi yang hanya disimpan di halaman dashboard dapat hilang ketika halaman dimuat ulang.
- Fitur dan prosedur startup otomatis perlu diuji pada setiap lingkungan Windows baru.