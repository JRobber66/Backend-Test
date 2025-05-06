
const express = require('express');
const fs = require('fs');
const http = require('http');
const WebSocket = require('ws');
const crypto = require('crypto');
const cors = require('cors');
const bodyParser = require('body-parser');
<<<<<<< HEAD
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

=======
const https = require('https');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });
>>>>>>> fb8771ea604eaed35ca3fd6d0e5d7484bf1f794b
const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(bodyParser.json());

<<<<<<< HEAD
const MASTER_KEY = "0623";
const ADMIN_USER = "Administrator";
const ADMIN_PASS = "x<3Punky0623x";

let logBuffer = [];

function log(message) {
  const time = new Date().toISOString();
  const entry = `[${time}] ${message}`;
  logBuffer.push(entry);
  fs.appendFileSync('logs.json', JSON.stringify(entry) + ",\n");
}

function loadJSON(path) {
  if (!fs.existsSync(path)) return {};
  return JSON.parse(fs.readFileSync(path));
}

function saveJSON(path, data) {
  fs.writeFileSync(path, JSON.stringify(data, null, 2));
}

app.post('/register', (req, res) => {
  const { username, password, masterKey, ip } = req.body;
  if (masterKey !== MASTER_KEY) return res.status(403).json({ error: 'Invalid master key' });

  const users = loadJSON('users.json');
  const ips = loadJSON('ips.json');

  if (users[username]) return res.status(409).json({ error: 'User already exists' });

  users[username] = password;
  ips[ip] = username;

  saveJSON('users.json', users);
  saveJSON('ips.json', ips);
  log(`Registered user '${username}' from IP ${ip}`);
  res.json({ success: true });
});

app.post('/login', (req, res) => {
  const { username, password, ip } = req.body;
  const users = loadJSON('users.json');
  const ips = loadJSON('ips.json');

  if (users[username] !== password || ips[ip] !== username) {
    log(`Failed login from IP ${ip} using username '${username}'`);
    return res.status(403).json({ error: 'Invalid credentials or IP' });
  }

  const token = crypto.randomBytes(24).toString('hex');
  res.json({ token, displayName: username });
  log(`User '${username}' logged in from IP ${ip}`);
});

app.post('/admin-login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    log(`Admin '${username}' logged in`);
    return res.json({ success: true });
  }
  log(`Failed admin login with username '${username}'`);
  res.status(403).json({ error: 'Unauthorized' });
});

app.get('/logs', (req, res) => {
  const logs = fs.readFileSync('logs.json', 'utf8');
  res.type('text').send(`[\n${logs}\n]`);
});

server.on('upgrade', (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', (ws) => {
  ws.on('message', (msg) => {
    const text = msg.toString();
=======
app.use(cors());
app.use(bodyParser.json());

// Hardcoded users
const USERS = {
  "admin": "password"
};

// Auth token store
const validTokens = new Set();

// Webhook URL
const DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1369437314257780817/u3mVxV-b9Dl-952xMElyOz0dbLP1fX-UFEs9jKHVwR5r-SN4nNkKUIzHSWQHlzfXRYpJ";

// In-memory log buffer
let logBuffer = [];

// Send logs to Discord
function flushLogBuffer() {
  if (logBuffer.length === 0) return;

  const message = "📜 **Server Log Dump**\n```\n" + logBuffer.join('\n') + "\n```";
  logBuffer = [];
  postToDiscord(message);
}

// Post to Discord
function postToDiscord(content) {
  const payload = JSON.stringify({ content });
  const url = new URL(DISCORD_WEBHOOK_URL);

  const options = {
    hostname: url.hostname,
    path: url.pathname + url.search,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  const req = https.request(options, (res) => {
    res.on('data', () => {}); // no-op
  });

  req.on('error', (err) => {
    console.error('Discord webhook error:', err.message);
  });

  req.write(payload);
  req.end();
}

// Log helper
function logEvent(message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}`;
  console.log(line);
  logBuffer.push(line);
}

// Flush logs every 5 minutes
setInterval(flushLogBuffer, 5 * 60 * 1000);

// Log all HTTP access
app.use((req, res, next) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  logEvent(`IP ${ip} accessed server via ${req.method} ${req.originalUrl}`);
  next();
});

// Login with logging
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  if (USERS[username] && USERS[username] === password) {
    const token = crypto.randomBytes(24).toString('hex');
    validTokens.add(token);
    setTimeout(() => validTokens.delete(token), 30 * 60 * 1000);
    logEvent(`IP ${ip} successfully logged in as '${username}'`);
    return res.json({ token });
  }

  logEvent(`IP ${ip} failed login with username '${username}' and password '${password}'`);
  res.status(401).json({ error: 'Invalid credentials' });
});

// Upgrade HTTP to WebSocket with auth
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get('token');

  if (!token || !validTokens.has(token)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

// WebSocket message handling
wss.on('connection', (ws) => {
  ws.on('message', (msg) => {
    const text = msg.toString();

    // Manual log dump trigger
    if (text.includes("@webhook .getlog")) {
      flushLogBuffer();
      return;
    }

    // Otherwise, broadcast normally
>>>>>>> fb8771ea604eaed35ca3fd6d0e5d7484bf1f794b
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(text);
      }
    });
  });
});

<<<<<<< HEAD
server.listen(PORT, () => console.log(`Server running on ${PORT}`));
=======
// Health route
app.get('/health', (req, res) => res.send('OK'));

server.listen(PORT, () => {
  console.log(`Chat server running on port ${PORT}`);
});
>>>>>>> fb8771ea604eaed35ca3fd6d0e5d7484bf1f794b
