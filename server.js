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

// === CONFIG ===
const MASTER_KEY = "0623";
const ADMIN_USER = "Administrator";
const ADMIN_PASS = "x<3Punky0623x";

// === LOGGING ===
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

// === ROUTES ===

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
    log(`Admin '${username}' logged
