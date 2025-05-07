require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

const MASTER_KEY = process.env.MASTER_KEY;
const JWT_SECRET = process.env.JWT_SECRET;
const USERS_FILE = 'users.json';
const FILES_FILE = 'files.json';
const UPLOAD_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]');
if (!fs.existsSync(FILES_FILE)) fs.writeFileSync(FILES_FILE, '[]');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

// Unlock endpoint
app.post('/api/unlock', (req, res) => {
  if (req.body.key === MASTER_KEY) return res.json({ success: true });
  res.status(401).json({ message: 'Invalid Master Key' });
});

// Register
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  const users = JSON.parse(fs.readFileSync(USERS_FILE));
  if (users.find(u => u.username === username)) return res.status(400).json({ message: 'Username taken' });
  const hash = await bcrypt.hash(password, 10);
  users.push({ username, password: hash });
  fs.writeFileSync(USERS_FILE, JSON.stringify(users));
  res.json({ success: true });
});

// Login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const users = JSON.parse(fs.readFileSync(USERS_FILE));
  const user = users.find(u => u.username === username);
  if (!user) return res.status(400).json({ message: 'Invalid credentials' });
  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(400).json({ message: 'Invalid credentials' });
  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '2h' });
  res.json({ token });
});

// Auth middleware
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ message: 'Unauthorized' });
  const token = header.split(' ')[1];
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: 'Invalid token' });
  }
}

// File upload setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname))
});
const upload = multer({ storage });

// Upload endpoint
app.post('/api/upload', auth, upload.single('file'), (req, res) => {
  const files = JSON.parse(fs.readFileSync(FILES_FILE));
  const record = {
    id: uuidv4(),
    filename: req.file.originalname,
    storedName: req.file.filename,
    sender: req.user.username,
    recipient: req.body.recipient
  };
  files.push(record);
  fs.writeFileSync(FILES_FILE, JSON.stringify(files));
  res.json({ success: true });
});

// List files
app.get('/api/files', auth, (req, res) => {
  const files = JSON.parse(fs.readFileSync(FILES_FILE));
  const userFiles = files.filter(f => f.recipient === req.user.username);
  res.json(userFiles);
});

// Download
app.get('/api/download/:id', auth, (req, res) => {
  const files = JSON.parse(fs.readFileSync(FILES_FILE));
  const file = files.find(f => f.id === req.params.id && f.recipient === req.user.username);
  if (!file) return res.status(404).json({ message: 'Not found' });
  res.download(path.join(UPLOAD_DIR, file.storedName), file.filename);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));