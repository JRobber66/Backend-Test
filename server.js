require('dotenv').config();
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ['https://YOUR_GITHUB_USERNAME.github.io'],
    credentials: true
  }
});

// — Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// — Schemas
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  password: String
});
const messageSchema = new mongoose.Schema({
  channel: String,
  author: String,
  content: String,
  timestamp: Date
});
const User = mongoose.model('User', userSchema);
const Message = mongoose.model('Message', messageSchema);

// — Middleware
app.use(cors({
  origin: ['https://YOUR_GITHUB_USERNAME.github.io'],
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

function auth(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.sendStatus(401);
  jwt.verify(token, process.env.JWT_SECRET, (e, u) => {
    if (e) return res.sendStatus(403);
    req.user = u;
    next();
  });
}

// — Auth Routes
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Required' });
  const hash = await bcrypt.hash(password, 10);
  try {
    await User.create({ username, password: hash });
    res.sendStatus(201);
  } catch {
    res.status(409).json({ error: 'Username taken' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const u = await User.findOne({ username });
  if (!u || !(await bcrypt.compare(password, u.password))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ username }, process.env.JWT_SECRET, { expiresIn: '1d' });
  res.cookie('token', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'none'
  });
  res.json({ username });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('token');
  res.sendStatus(204);
});

app.get('/api/user', auth, (req, res) => {
  res.json({ username: req.user.username });
});

// — Message History
app.get('/api/messages/:channel', auth, async (req, res) => {
  const msgs = await Message
    .find({ channel: req.params.channel })
    .sort('timestamp')
    .limit(100);
  res.json(msgs);
});

// — Socket.io Auth
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Auth error'));
  jwt.verify(token, process.env.JWT_SECRET, (e, u) => {
    if (e) return next(new Error('Auth error'));
    socket.user = u;
    next();
  });
});

io.on('connection', socket => {
  // join default
  socket.join('general');
  socket.emit('joined', 'general');

  socket.on('join', channel => {
    socket.leaveAll();
    socket.join(channel);
    socket.emit('joined', channel);
  });

  socket.on('message', async ({channel,content}) => {
    const msg = await Message.create({
      channel,
      author: socket.user.username,
      content,
      timestamp: new Date()
    });
    io.to(channel).emit('message', msg);
  });

  socket.on('typing', channel => {
    socket.to(channel).emit('typing', socket.user.username);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server on port ${PORT}`));
