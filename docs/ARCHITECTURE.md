
# Architecture

## Components

### Python Agent

The agent collects system telemetry and active-window information, captures screenshots, and communicates with the relay server over WebSocket.

### Node.js Relay Server

The server provides the dashboard, issues one-time viewer tickets, authenticates the agent, and forwards telemetry and supported control requests.

### Web Dashboard

The dashboard presents monitoring data, CPU/RAM charts, active-window history, screenshots, and supported control actions.

## Data flow

1. The agent collects system data.
2. The agent sends telemetry to the relay server over a local WebSocket connection.
3. The relay server forwards telemetry to authenticated viewers.
4. The dashboard displays the received data.
5. Supported control requests travel through the relay server to the agent.

## Networking

The relay server is bound to the loopback interface by default. Tailscale can provide private remote access without intentionally publishing the service to the public internet.

Keep the agent, server, and Tailscale configuration running for remote monitoring to work.
