const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// Optional health check route
app.get('/health', (req, res) => res.send('OK'));

// WebSocket handling
wss.on('connection', (ws) => {
  ws.on('message', (message) => {
    // Ensure message is always a string (handles Blob/buffer)
    const text = message.toString();

    // Broadcast to all connected clients
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(text);
      }
    });
  });
});

server.listen(PORT, () => {
  console.log(`Chat server running on port ${PORT}`);
});
