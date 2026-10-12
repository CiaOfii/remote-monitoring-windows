const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const WebSocket = require("ws");
require("dotenv").config();

const PORT = Number(process.env.PORT || 8080);
const TOKEN = process.env.MONITOR_TOKEN;
const MOBILE_DIR = path.resolve(__dirname, "../mobile");
const ALLOWED_COMMANDS = new Set(["lock", "shutdown", "cancel_shutdown"]);
const MAX_REQUEST_BODY = 4096;

if (!TOKEN || TOKEN.length < 32) {
  console.error("MONITOR_TOKEN tidak valid. Periksa file .env.");
  process.exit(1);
}

const viewers = new Set();
let agent = null;
let latestRecord = null;
let latestScreenshot = null;
const tickets = new Map();

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}

function sendToViewers(packet) {
  const encoded = JSON.stringify(packet);
  for (const viewer of viewers) {
    if (viewer.readyState === WebSocket.OPEN) {
      try {
        viewer.send(encoded);
      } catch (error) {
        console.warn("Tidak dapat mengirim pembaruan ke viewer:", error.message);
      }
    }
  }
}

function sendCommandResult(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "command_result", data }));
  }
}

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/viewer-ticket") {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > MAX_REQUEST_BODY) {
        sendJson(res, 413, { error: "Permintaan terlalu besar." });
        req.destroy();
      }
    });

    req.on("end", () => {
      if (res.writableEnded) return;
      let input;
      try {
        input = JSON.parse(body || "{}");
      } catch {
        return sendJson(res, 400, { error: "Format permintaan tidak valid." });
      }

      if (!safeEqual(input.token, TOKEN)) {
        return sendJson(res, 401, { error: "Token salah." });
      }

      // Tiket sekali pakai, berlaku 60 detik, untuk autentikasi WebSocket viewer.
      const ticket = crypto.randomBytes(32).toString("hex");
      tickets.set(ticket, Date.now() + 60_000);
      sendJson(res, 200, { ticket });
    });
    return;
  }

  if (req.method === "GET" && req.url === "/api/status") {
    return sendJson(res, 200, {
      agentConnected: Boolean(agent && agent.readyState === WebSocket.OPEN),
      hasData: Boolean(latestRecord),
      hasScreenshot: Boolean(latestScreenshot),
      viewerCount: viewers.size,
    });
  }

  const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;
  const requested = pathname === "/" ? "index.html" : pathname.slice(1);
  const filePath = path.resolve(MOBILE_DIR, requested);

  if (!filePath.startsWith(MOBILE_DIR + path.sep)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      return res.end("File tidak ditemukan. Pastikan mobile/index.html tersedia.");
    }

    const ext = path.extname(filePath).toLowerCase();
    const types = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
    };

    res.writeHead(200, {
      "Content-Type": types[ext] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    });
    res.end(content);
  });
});

// Screenshot berukuran terbatas, tetapi beri ruang untuk payload base64.
const wss = new WebSocket.Server({ noServer: true, maxPayload: 4 * 1024 * 1024 });

server.on("upgrade", (req, socket, head) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  if (requestUrl.pathname !== "/ws") {
    socket.destroy();
    return;
  }

  const role = req.headers["x-monitor-role"];

  // Agent hanya boleh masuk memakai token rahasia yang tepat.
  if (role === "agent") {
    if (!safeEqual(req.headers["x-monitor-token"], TOKEN)) {
      socket.destroy();
      return;
    }

    if (agent && agent.readyState === WebSocket.OPEN) {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, ws => {
      wss.emit("connection", ws, req, "agent");
    });
    return;
  }

  // Browser tidak dapat menetapkan header role sendiri; viewer memakai tiket sekali pakai.
  const ticket = requestUrl.searchParams.get("ticket");
  if (role === "viewer" || ticket) {
    const origin = req.headers.origin;
    if (origin) {
      try {
        const parsedOrigin = new URL(origin);
        const hostMatches = parsedOrigin.host.toLowerCase() === String(req.headers.host || "").toLowerCase();
        if (!hostMatches || !["http:", "https:"].includes(parsedOrigin.protocol)) {
          socket.destroy();
          return;
        }
      } catch {
        socket.destroy();
        return;
      }
    }

    const expiry = ticket && tickets.get(ticket);
    if (!expiry || expiry < Date.now()) {
      if (ticket) tickets.delete(ticket);
      socket.destroy();
      return;
    }

    tickets.delete(ticket);
    wss.handleUpgrade(req, socket, head, ws => {
      wss.emit("connection", ws, req, "viewer");
    });
    return;
  }

  socket.destroy();
});

wss.on("connection", (ws, req, role) => {
  if (role === "agent") {
    agent = ws;
    console.log("Agent laptop terhubung.");
  } else {
    viewers.add(ws);
    console.log("Viewer terhubung.");
    if (latestRecord) ws.send(JSON.stringify({ type: "telemetry", data: latestRecord }));
    if (latestScreenshot) ws.send(JSON.stringify(latestScreenshot));
  }

  ws.on("message", (raw, isBinary) => {
    if (isBinary) return;

    let packet;
    try {
      packet = JSON.parse(raw.toString());
    } catch {
      if (role === "agent") console.warn("Pesan JSON agent tidak valid.");
      return;
    }

    if (role === "viewer") {
      if (!packet || packet.type !== "command" || !ALLOWED_COMMANDS.has(packet.command)) {
        sendCommandResult(ws, {
          success: false,
          message: "Perintah tidak diizinkan.",
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (!agent || agent.readyState !== WebSocket.OPEN) {
        sendCommandResult(ws, {
          command: packet.command,
          success: false,
          message: "Agent laptop sedang offline. Pastikan main.py masih berjalan.",
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const commandId = crypto.randomBytes(8).toString("hex");
      agent.send(JSON.stringify({ type: "command", command: packet.command, commandId }));
      console.log(`Perintah viewer diteruskan ke agent: ${packet.command}`);
      ws.send(JSON.stringify({
        type: "command_status",
        data: {
          command: packet.command,
          commandId,
          message: "Perintah dikirim ke agent laptop; menunggu hasil.",
          timestamp: new Date().toISOString(),
        },
      }));
      return;
    }

    // Pesan dari agent: telemetri, screenshot, atau hasil perintah.
    if (packet && packet.type === "telemetry" && packet.data && typeof packet.data === "object") {
      latestRecord = packet.data;
      sendToViewers(packet);
      return;
    }

    if (packet && packet.type === "screenshot" && packet.data &&
        typeof packet.data.image_data === "string" &&
        packet.data.image_data.startsWith("data:image/jpeg;base64,")) {
      latestScreenshot = packet;
      sendToViewers(packet);
      return;
    }

    if (packet && packet.type === "command_result" && packet.data && typeof packet.data === "object") {
      sendToViewers(packet);
      return;
    }

    // Kompatibilitas dengan agent versi sebelumnya yang mengirim record mentah.
    if (packet && typeof packet === "object" && !Array.isArray(packet) && !packet.type) {
      latestRecord = packet;
      sendToViewers({ type: "telemetry", data: packet });
    }
  });

  ws.on("close", () => {
    if (role === "agent" && agent === ws) {
      agent = null;
      console.log("Agent laptop terputus.");
    }
    if (role === "viewer") viewers.delete(ws);
  });

  ws.on("error", err => console.error("WebSocket error:", err.message));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Dashboard tersedia di http://127.0.0.1:${PORT}`);
  console.log(`WebSocket relay tersedia di ws://127.0.0.1:${PORT}/ws`);
  console.log("Server hanya menerima koneksi lokal; akses HP lewat Tailscale.");
});
