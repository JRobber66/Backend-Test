const express = require('express');
const fs = require('fs');
const http = require('http');
const WebSocket = require('ws');
const crypto = require('crypto');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

const MASTER_KEY = "0623";
const ADMIN_USER = "Administrator";
const ADMIN_PASS = "x<3Punky0623x";

const messageLog = [];
const userTokens = new Map(); // token → username

const DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1369437314257780817/u3mVxV-b9Dl-952xMElyOz0dbLP1fX-UFEs9jKHVwR5r-SN4nNkKUIzHSWQHlzfXRYpJ";

// ========== Utility ==========

function logToWebhook(content) {
  const payload = JSON.stringify({ content });
  const https = require('https');
  const url = new URL(DISCORD_WEBHOOK_URL);
  const options = {
    method: "POST",
    hostname: url.hostname,
    path: url.pathname + url.search,
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload)
    }
  };
  const req = https.request(options);
  req.write(payload);
  req.end();
}

function broadcast(messageObj) {
  const formatted = messageObj.deleted
    ? null
    : `<b>${messageObj.sender}</b> [${messageObj.timestamp}]: ${messageObj.content}`;
  if (formatted) {
    wss.clients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(formatted);
      }
    });
  }
}

// ========== Auth ==========

function loadJSON(path) {
  if (!fs.existsSync(path)) return {};
  return JSON.parse(fs.readFileSync(path));
}

function saveJSON(path, data) {
  fs.writeFileSync(path, JSON.stringify(data, null, 2));
}

// ========== Routes ==========

app.post('/register', (req, res) => {
  const { username, password, masterKey } = req.body;
  if (masterKey !== MASTER_KEY) return res.status(403).json({ error: 'Invalid master key' });

  const users = loadJSON('users.json');
  if (users[username]) return res.status(409).json({ error: 'User already exists' });

  users[username] = password;
  saveJSON('users.json', users);
  res.json({ success: true });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const users = loadJSON('users.json');

  if (users[username] !== password) {
    return res.status(403).json({ error: 'Invalid credentials' });
  }

  const token = crypto.randomBytes(24).toString('hex');
  userTokens.set(token, username);
  res.json({ token, displayName: username });
});

app.post('/admin-login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    return res.json({ success: true });
  }
  res.status(403).json({ error: 'Unauthorized' });
});

// Delete message endpoint
app.post('/delete', (req, res) => {
  const { token, id } = req.body;
  const username = userTokens.get(token);
  const msg = messageLog[id];
  if (!msg || msg.sender !== username) {
    return res.status(403).json({ error: "Not allowed" });
  }
  msg.deleted = true;
  res.json({ success: true });
});

// Hourly webhook dump
function hourlyDump() {
  const now = new Date();
  const msToNextHour = ((60 - now.getMinutes()) * 60 - now.getSeconds()) * 1000;
  setTimeout(() => {
    const time = new Date().toLocaleTimeString();
    const dump = messageLog.map(m =>
      m.deleted ? `[${m.timestamp}] ${m.sender}: (deleted by user)` :
      `[${m.timestamp}] ${m.sender}: ${m.content}`
    ).join("\n");

    logToWebhook(`📤 **Hourly Chat Log (${time})**\n\`\`\`\n${dump}\n\`\`\``);

    messageLog.length = 0; // Clear log
    hourlyDump();
  }, msToNextHour);
}

hourlyDump();

// ========== WebSocket Chat ==========

server.on('upgrade', (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', (ws) => {
  ws.on('message', (msg) => {
    const raw = msg.toString();
    const match = raw.match(/^<b>(.+?)<\/b>\s+\[(.+?)\]:\s+(.+)$/);
    if (!match) return;

    const [, sender, timestamp, content] = match;
    const entry = {
      sender,
      timestamp,
      content,
      deleted: false
    };

    const index = messageLog.push(entry) - 1;

    // Forward to clients
    broadcast(entry);

    // Also log to webhook
    logToWebhook(`<b>${sender}</b> [${timestamp}]: ${content}`);
  });
});

// ========== Start Server ==========

server.listen(PORT, () => {
  console.log(`Chat server running on port ${PORT}`);
});
