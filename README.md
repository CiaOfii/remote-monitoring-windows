
# Remote Monitoring for Windows

A personal remote monitoring dashboard for a Windows laptop, built with Python, Node.js, WebSocket, and a private Tailscale network.

## Features

- Monitor CPU usage, RAM usage, battery level, and charger status.
- Display the currently active application and window title.
- Show recent active-window changes in the dashboard.
- View screenshots from the monitored laptop.
- Lock Windows remotely with confirmation.
- Schedule shutdown with confirmation and a cancellation option.
- Run the server and agent automatically after Windows login using Task Scheduler.

## Architecture

The system consists of three main components:

- **Agent:** Python process that collects system telemetry, detects the active window, and captures screenshots.
- **Relay Server:** Node.js server that authenticates connections and forwards telemetry and control requests.
- **Dashboard:** Web interface for viewing monitoring data and requesting supported control actions.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for details.

## Requirements

- Windows laptop
- Python and pip
- Node.js and npm
- Git
- Tailscale for private remote access

## Installation

### 1. Clone the repository

```powershell
git clone YOUR_GITHUB_REPOSITORY_URL
cd remote-monitoring
```

Replace the URL with your repository URL.

### 2. Install Node.js dependencies

```powershell
cd server
npm ci
Copy-Item .env.example .env
```

Edit `server/.env` and set a unique, random `MONITOR_TOKEN` of at least 32 characters. Never use the example placeholder as a production token.

### 3. Install Python dependencies

From the project root:

```powershell
cd ..\agent
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
cd ..
```

### 4. Start the relay server

In a terminal:

```powershell
cd server
npm start
```

### 5. Start the agent

In a separate terminal from the project root:

```powershell
.\agent\.venv\Scripts\python.exe .\agent\main.py
```

### 6. Open the dashboard

On the laptop, open:

http://127.0.0.1:8080

For remote access, configure Tailscale and use a private connection. Do not expose the relay server directly to the public internet.

## Automatic startup

The repository includes PowerShell launcher scripts for the server and agent. These can be registered with Windows Task Scheduler to start after user login.

Review the scripts and adjust local executable paths when setting up another computer.

## Security and privacy

- Never commit `.env`, tokens, screenshots, logs, or local virtual environments.
- Keep access restricted to trusted devices on a private network.
- Screenshots may contain sensitive personal information.
- Remote control should only be used on devices you own or are authorized to manage.
- Review [docs/SECURITY.md](docs/SECURITY.md) before enabling remote access.

## Current limitations

- The agent requires an active Windows user session to capture the interactive desktop reliably.
- Real-time monitoring stops when the laptop is shut down or unavailable.
- This project is a personal project and has not been independently security-audited.

## License

No license has been assigned yet. All rights are reserved by default until a license is added.
