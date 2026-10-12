
# Security and Privacy

## Authentication

The server uses a configured MONITOR_TOKEN to authenticate the agent and issue one-time tickets to dashboard viewers.

Use a unique, random token with at least 32 characters. Never publish the real token or commit the server/.env file.

## Network exposure

Keep remote access limited to trusted devices on a private network. Do not use Tailscale Funnel or publicly expose the relay server without a separate security review.

## Screenshot privacy

Screenshots can contain private messages, documents, account information, and other sensitive content. Only enable monitoring on devices you own or have explicit permission to manage.

Avoid sharing screenshots, logs, or recordings from the monitoring session in public repositories.

## Remote control

The supported control actions can lock Windows or schedule a shutdown. Confirm the intended action before using it. The shutdown cancellation option only works while the shutdown is still pending.

Do not treat a browser confirmation dialog as the sole security boundary. Restrict network access and protect authentication credentials.

## Repository hygiene

Never commit:

- server/.env
- Personal access tokens or passwords
- Python virtual environments
- node_modules
- Runtime logs and captured screenshots
- Private device addresses or personal connection details

Review the staged files before every commit.
