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
const BANS_FILE = "bans.json";

let messageLog = loadMessages();
let bans = loadJSON(BANS_FILE); // persistent ban map
const userTokens = new Map(); // token → { username, displayName, ip }
const adminTokens = new Set();

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

function saveBans() {
  fs.writeFileSync(BANS_FILE, JSON.stringify([...bans], null, 2));
}

function loadJSON(path) {
  if (!fs.existsSync(path)) return new Set();
  return new Set(JSON.parse(fs.readFileSync(path)));
}

function broadcast(data) {
  const json = JSON.stringify(data);
  wss.clients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(json);
    }
  });
}

app.post('/register', (req, res) => {
  const { username, password, displayName, masterKey } = req.body;
  if (masterKey !== MASTER_KEY) return res.status(403).json({ error: 'Invalid master key' });

  const users = loadJSON('users.json');
  if (users[username]) return res.status(409).json({ error: 'User already exists' });

  users[username] = { password, displayName };
  saveJSON('users.json', users);
  res.json({ success: true });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  const users = loadJSON('users.json');
  const entry = users[username];
  if (!entry || entry.password !== password) return res.status(403).json({ error: 'Invalid credentials' });

  const banKey = `${ip}|${username}`;
  if (bans.has(banKey)) return res.status(403).json({ error: 'You are banned' });

  const token = crypto.randomBytes(24).toString('hex');
  userTokens.set(token, { username, displayName: entry.displayName, ip });
  res.json({ token, displayName: entry.displayName });
});

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

app.post('/bind-token', (req, res) => {
  const { token, username, displayName } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  userTokens.set(token, { username, displayName, ip });
  res.json({ success: true });
});

app.post('/delete', (req, res) => {
  const { token, id } = req.body;
  const user = userTokens.get(token);
  const isAdmin = adminTokens.has(token);
  const msg = messageLog[id];
  if (!msg || (msg.sender !== user.displayName && !isAdmin)) {
    return res.status(403).json({ error: "Not allowed" });
  }

  msg.deleted = true;
  saveMessages();
  broadcast({ type: "delete", id });
  res.json({ success: true });
});

function loadJSON(path) {
  if (!fs.existsSync(path)) return {};
  return JSON.parse(fs.readFileSync(path));
}

function saveJSON(path, data) {
  fs.writeFileSync(path, JSON.stringify(data, null, 2));
}

server.on('upgrade', (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    ws.ip = ip;
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', (ws) => {
  messageLog.forEach((entry, id) => {
    const payload = {
      type: entry.deleted ? "delete" : "message",
      id,
      html: `<b>${entry.sender}</b> [${entry.timestamp}]: ${entry.deleted ? "[Deleted Message]" : entry.content}`
    };
    ws.send(JSON.stringify(payload));
  });

  ws.on('message', (msg) => {
    let raw = msg.toString();

    if (raw.startsWith("/")) {
      const parts = raw.trim().split(" ");
      const command = parts[0];
      const arg = parts[1];

      if (command === "/clear") {
        messageLog.forEach(m => m.deleted = true);
        saveMessages();
        broadcast({ type: "clear" });
        return;
      }

      if (command === "/help") {
        ws.send(JSON.stringify({ type: "system", content: "Commands: /clear /ban <name> /unban <name> /help" }));
        return;
      }

      if (command === "/ban" && arg) {
        const victim = [...userTokens.values()].find(u => u.displayName === arg);
        if (victim && victim.username !== ADMIN_USER) {
          bans.add(`${victim.ip}|${victim.username}`);
          saveBans();
          broadcast({ type: "system", content: `${arg} has been banned.` });
        }
        return;
      }

      if (command === "/unban" && arg) {
        const entries = [...bans];
        entries.forEach(entry => {
          if (entry.endsWith(`|${arg}`)) bans.delete(entry);
        });
        saveBans();
        broadcast({ type: "system", content: `${arg} has been unbanned.` });
        return;
      }

      return;
    }

    const match = raw.match(/^<b>(.+?)<\/b> \[(.+?)\]: (.+)$/);
    if (!match) return;
    const [, sender, timestamp, content] = match;

    const entry = { sender, timestamp, content, deleted: false };
    const id = messageLog.push(entry) - 1;
    saveMessages();

    broadcast({ type: "message", id, html: `<b>${sender}</b> [${timestamp}]: ${content}` });
  });
});

server.listen(PORT, () => {
  console.log(`Chat server running on port ${PORT}`);
});
