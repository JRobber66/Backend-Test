const express = require('express');
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
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(text);
      }
    });
  });
});

// Health route
app.get('/health', (req, res) => res.send('OK'));

server.listen(PORT, () => {
  console.log(`Chat server running on port ${PORT}`);
});
