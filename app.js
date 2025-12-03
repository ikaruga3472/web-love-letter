const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { createRoom } = require('./core/engine');
const loveLetter = require('./games/loveletter');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const port = process.env.PORT || 3000;

const rooms = new Map();

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const getRoom = (roomId) => {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, createRoom(loveLetter, roomId));
  }
  return rooms.get(roomId);
};

const broadcastState = (roomId) => {
  const room = rooms.get(roomId);
  if (!room) return;
  const sockets = io.sockets.adapter.rooms.get(roomId);
  if (!sockets) return;
  for (const socketId of sockets) {
    const socket = io.sockets.sockets.get(socketId);
    if (socket) {
      socket.emit('state', room.viewFor(socketId));
    }
  }
};

io.on('connection', (socket) => {
  socket.on('join-room', ({ roomId, name }) => {
    if (!roomId) return;
    const room = getRoom(roomId);
    const joined = room.join(socket.id, name);
    if (joined?.error) {
      socket.emit('error-message', joined.error);
      return;
    }
    socket.join(roomId);
    broadcastState(roomId);
  });

  socket.on('start-game', (roomId) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const result = room.start();
    if (result?.error) {
      socket.emit('error-message', result.error);
      return;
    }
    broadcastState(roomId);
  });

  socket.on('play-card', ({ roomId, cardIndex, targetId, guess }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const result = room.act(socket.id, { cardIndex, targetId, guess });
    if (result?.error) {
      socket.emit('error-message', result.error);
      return;
    }
    broadcastState(roomId);
  });

  socket.on('disconnecting', () => {
    for (const roomId of socket.rooms) {
      if (roomId === socket.id) continue;
      const room = rooms.get(roomId);
      if (!room) continue;
      room.leave(socket.id);
      broadcastState(roomId);
    }
  });
});

server.listen(port, () => {
  console.log(`Love Letter server listening on port ${port}`);
});
