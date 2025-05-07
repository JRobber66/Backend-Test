const express = require('express');
const fs = require('fs');
const http = require('http');
const WebSocket = require('ws');
const crypto = require('crypto');
const cors = require('cors');
const bodyParser = require('body-parser');
const https = require('https');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

// === Config ===
const MASTER_KEY   = "0623";
const ADMIN_USER   = "Administrator";
const ADMIN_PASS   = "x<3Punky0623x";
const MESSAGES_FILE = "messages.json";
const BANS_FILE     = "bans.json";

// === In-memory state ===
let messageLog = loadJSON(MESSAGES_FILE) || [];
let bans       = new Set(loadJSON(BANS_FILE) || []);
const userTokens  = new Map(); // token → { username, displayName, ip }
const adminTokens = new Set();

// === Helpers ===
function loadJSON(path) {
  if (!fs.existsSync(path)) return null;
  try { return JSON.parse(fs.readFileSync(path)); }
  catch { return null; }
}
function saveJSON(path, data) {
  fs.writeFileSync(path, JSON.stringify(data, null, 2));
}
function saveMessages() {
  saveJSON(MESSAGES_FILE, messageLog);
}
function saveBans() {
  saveJSON(BANS_FILE, [...bans]);
}
function broadcast(obj) {
  const json = JSON.stringify(obj);
  wss.clients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) ws.send(json);
  });
}
function logToWebhook(content) {
  const payload = JSON.stringify({ content });
  const url = new URL("https://discord.com/api/webhooks/1369437314257780817/u3mVxV-b9Dl-952xMElyOz0dbLP1fX-UFEs9jKHVwR5r-SN4nNkKUIzHSWQHlzfXRYpJ");
  const opts = {
    method: "POST",
    hostname: url.hostname,
    path:     url.pathname + url.search,
    headers: {
      "Content-Type":   "application/json",
      "Content-Length": Buffer.byteLength(payload)
    }
  };
  const req = https.request(opts, res => res.on('data',()=>{}));
  req.on('error', err => console.error("Webhook error:", err));
  req.write(payload);
  req.end();
}

// === HTTP Routes ===

// Register with chosen displayName
app.post('/register', (req, res) => {
  const { username, password, displayName, masterKey } = req.body;
  if (masterKey !== MASTER_KEY) return res.status(403).json({ error: 'Invalid master key' });

  const users = loadJSON('users.json') || {};
  if (users[username]) return res.status(409).json({ error: 'User already exists' });

  users[username] = { password, displayName };
  saveJSON('users.json', users);
  res.json({ success: true });
});

// Login (blocks banned IP|username)
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  const users = loadJSON('users.json') || {};
  const u = users[username];
  if (!u || u.password !== password) return res.status(403).json({ error: 'Invalid credentials' });

  const banKey = `${ip}|${username}`;
  if (bans.has(banKey)) return res.status(403).json({ error: 'You are banned' });

  const token = crypto.randomBytes(24).toString('hex');
  userTokens.set(token, { username, displayName: u.displayName, ip });
  res.json({ token, displayName: u.displayName });
});

// Admin login
app.post('/admin-login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    const token = crypto.randomBytes(24).toString('hex');
    adminTokens.add(token);
    userTokens.set(token, { username, displayName: username, ip: 'admin' });
    return res.json({ token, displayName: username });
  }
  res.status(403).json({ error: 'Unauthorized' });
});

// Rebind token after reload
app.post('/bind-token', (req, res) => {
  const { token, username, displayName } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  userTokens.set(token, { username, displayName, ip });
  res.json({ success: true });
});

// Delete message (user or admin)
app.post('/delete', (req, res) => {
  const { token, id } = req.body;
  const u = userTokens.get(token);
  const isAdmin = adminTokens.has(token);
  const msg = messageLog[id];
  if (!msg || (msg.sender !== u.displayName && !isAdmin)) {
    return res.status(403).json({ error: "Not allowed" });
  }
  msg.deleted = true;
  saveMessages();
  broadcast({ type: "delete", id });
  res.json({ success: true });
});

// Admin-state for dashboard
app.post('/admin-state', (req, res) => {
  const token = req.body.token;
  if (!adminTokens.has(token)) return res.status(403).json({ error: "Forbidden" });

  const users = [...userTokens.values()].map(u => ({
    username:    u.username,
    displayName: u.displayName,
    ip:          u.ip
  }));
  res.json({ users, bans: [...bans] });
});

// Admin-log for dashboard
app.post('/admin-log', (req, res) => {
  const token = req.body.token;
  if (!adminTokens.has(token)) return res.status(403).json({ error: "Forbidden" });

  try {
    const log = fs.readFileSync(MESSAGES_FILE, "utf8");
    res.json({ log });
  } catch {
    res.json({ log: "(unable to load messages.json)" });
  }
});

// === WebSocket Handling ===
server.on('upgrade', (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, ws => {
    ws.ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', (ws) => {
  // Send existing history
  messageLog.forEach((entry, id) => {
    const html = `<b>${entry.sender}</b> [${entry.timestamp}]: ${entry.deleted ? "[Deleted Message]" : entry.content}`;
    broadcastPayload(ws, entry.deleted ? "delete" : "message", id, html);
  });

  ws.on('message', (msg) => {
    const raw = msg.toString();

    // Admin/User commands start with "/"
    if (raw.startsWith("/")) {
      const [cmd, arg] = raw.trim().split(" ");
      // /clear
      if (cmd === "/clear") {
        messageLog.forEach(m => m.deleted = true);
        saveMessages();
        broadcast({ type: "clear" });
      }
      // /help
      else if (cmd === "/help") {
        ws.send(JSON.stringify({
          type: "system",
          content: "Commands: /clear /ban <name> /unban <name> /help"
        }));
      }
      // /ban <displayName>
      else if (cmd === "/ban" && arg) {
        const u = [...userTokens.values()].find(u => u.displayName === arg);
        if (u && u.username !== ADMIN_USER) {
          bans.add(`${u.ip}|${u.username}`);
          saveBans();
          broadcast({ type: "system", content: `${arg} has been banned.` });
        }
      }
      // /unban <displayName>
      else if (cmd === "/unban" && arg) {
        [...bans].forEach(key => {
          if (key.endsWith(`|${arg}`)) bans.delete(key);
        });
        saveBans();
        broadcast({ type: "system", content: `${arg} has been unbanned.` });
      }
      return;
    }

    // Regular chat message
    const match = raw.match(/^<b>(.+?)<\/b> \[(.+?)\]: (.+)$/);
    if (!match) return;
    const [, sender, timestamp, content] = match;
    const entry = { sender, timestamp, content, deleted: false };
    const id = messageLog.push(entry) - 1;
    saveMessages();

    broadcast({ type: "message", id, html: `<b>${sender}</b> [${timestamp}]: ${content}` });
    logToWebhook(`<b>${sender}</b> [${timestamp}]: ${content}`);
  });
});

// Helper to send a specific payload to a single socket
function broadcastPayload(ws, type, id, html) {
  ws.send(JSON.stringify({ type, id, html }));
}

server.listen(PORT, () => {
  console.log(`Chat server running on port ${PORT}`);
});
