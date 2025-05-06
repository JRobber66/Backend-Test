const express = require('express');
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

// In-memory token store
const validTokens = new Set();

// ✅ Hardcoded user login
const USERS = {
  "admin": "password"
};

// Generate auth token
function generateToken() {
  return crypto.randomBytes(24).toString('hex');
}

// POST /login → returns token if valid
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (USERS[username] && USERS[username] === password) {
    const token = generateToken();
    validTokens.add(token);
    setTimeout(() => validTokens.delete(token), 30 * 60 * 1000); // expires in 30 mins
    res.json({ token });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// Upgrade HTTP to WebSocket with token auth
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

// WebSocket message broadcast
wss.on('connection', (ws) => {
  ws.on('message', (msg) => {
    const text = msg.toString();
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(text);
      }
    });
  });
});

app.get('/health', (req, res) => res.send('OK'));

server.listen(PORT, () => {
  console.log(`Secure chat server running on port ${PORT}`);
});
