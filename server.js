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

const MASTER_KEY = "0623";
const ADMIN_USER = "Administrator";
const ADMIN_PASS = "x<3Punky0623x";

const MESSAGES_FILE = "messages.json";
const DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1369437314257780817/u3mVxV-b9Dl-952xMElyOz0dbLP1fX-UFEs9jKHVwR5r-SN4nNkKUIzHSWQHlzfXRYpJ";

let messageLog = loadMessages();
const userTokens = new Map();

function loadMessages() {
  try {
    if (!fs.existsSync(MESSAGES_FILE)) return [];
    return JSON.parse(fs.readFileSync(MESSAGES_FILE));
  } catch {
    return [];
  }
}

function saveMessages() {
  fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messageLog, null, 2));
}

function logToWebhook(content) {
  const payload = JSON.stringify({ content });
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
  const req = https.request(options, res => res.on('data', () => {}));
  req.on('error', err => console.error("Webhook error:", err));
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

function loadJSON(path) {
  if (!fs.existsSync(path)) return {};
  return JSON.parse(fs.readFileSync(path));
}

function saveJSON(path, data) {
  fs.writeFileSync(path, JSON.stringify(data, null, 2));
}

// === Auth Routes ===
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

app.post('/delete', (req, res) => {
  const { token, id } = req.body;
  const username = userTokens.get(token);
  const msg = messageLog[id];
  if (!msg || msg.sender !== username) {
    return res.status(403).json({ error: "Not allowed" });
  }
  msg.deleted = true;
  saveMessages();
  res.json({ success: true });
});

// === Hourly webhook dump ===
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

    messageLog.length = 0;
    saveMessages();
    hourlyDump();
  }, msToNextHour);
}
hourlyDump();

// === WebSocket Setup ===
server.on('upgrade', (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', (ws) => {
  // send current messages to the new user
  messageLog.forEach(entry => {
    if (!entry.deleted) {
      ws.send(`<b>${entry.sender}</b> [${entry.timestamp}]: ${entry.content}`);
    }
  });

  ws.on('message', (msg) => {
    const raw = msg.toString();
    if (raw.includes("[SYSTEM]")) return;

    const match = raw.match(/^<b>(.+?)<\/b> \[(.+?)\]: (.+)$/);
    if (!match) {
      console.warn("Failed to parse message:", raw);
      return;
    }

    const [, sender, timestamp, content] = match;
    const entry = {
      sender,
      timestamp,
      content,
      deleted: false
    };

    const index = messageLog.push(entry) - 1;
    saveMessages();
    broadcast(entry);
    logToWebhook(`<b>${sender}</b> [${timestamp}]: ${content}`);
  });
});

server.listen(PORT, () => {
  console.log(`Chat server running on port ${PORT}`);
});
