/* server.js — Socket.IO server cho Oẳn Tù Tì v2
 *
 *  Chạy:   npm install  &&  npm start
 *  Mở:     http://localhost:3000
 *
 *  Người chơi 1 tạo phòng -> nhận mã (5 ký tự).
 *  Người chơi 2 nhập mã đó để vào cùng phòng.
 *  Server chỉ relay nước đi giữa 2 người và giữ ảnh state gần nhất để đồng bộ khi vào giữa chừng.
 */

const path = require('path');
const http = require('http');
const os   = require('os');
const express = require('express');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(__dirname));

/** rooms: code -> { players: [{ id, num }], state } */
const rooms = new Map();

function genCode() {
  // bỏ 0/O/1/I để tránh nhầm
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 5; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

io.on('connection', (socket) => {
  let currentRoom = null;

  socket.on('createRoom', () => {
    let code;
    do { code = genCode(); } while (rooms.has(code));
    rooms.set(code, { players: [{ id: socket.id, num: 1 }], state: null });
    socket.join(code);
    currentRoom = code;
    socket.emit('roomCreated', { code, playerNum: 1 });
    console.log(`[room] tạo ${code} bởi ${socket.id}`);
  });

  socket.on('joinRoom', (raw) => {
    const code = String(raw || '').trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) {
      return socket.emit('roomError', 'Không tìm thấy phòng có mã "' + code + '".');
    }
    if (room.players.length >= 2) {
      return socket.emit('roomError', 'Phòng đã đủ 2 người chơi.');
    }
    room.players.push({ id: socket.id, num: 2 });
    socket.join(code);
    currentRoom = code;
    socket.emit('roomJoined', { code, playerNum: 2, state: room.state });
    socket.to(code).emit('opponentJoined');
    console.log(`[room] ${socket.id} vào ${code} (đủ ${room.players.length}/2)`);
  });

  socket.on('move', (m) => {
    if (!currentRoom) return;
    socket.to(currentRoom).emit('opponentMove', m);
  });

  socket.on('newGame', () => {
    if (!currentRoom) return;
    const r = rooms.get(currentRoom);
    if (r) r.state = null;
    socket.to(currentRoom).emit('opponentNewGame');
  });

  socket.on('syncState', (state) => {
    if (!currentRoom) return;
    const r = rooms.get(currentRoom);
    if (r) r.state = state;
    socket.to(currentRoom).emit('state', state);
  });

  socket.on('leaveRoom', () => leave());

  socket.on('disconnect', leave);

  function leave() {
    if (!currentRoom) return;
    const r = rooms.get(currentRoom);
    if (r) {
      r.players = r.players.filter(p => p.id !== socket.id);
      socket.to(currentRoom).emit('opponentLeft');
      if (r.players.length === 0) {
        rooms.delete(currentRoom);
        console.log(`[room] dọn ${currentRoom}`);
      }
    }
    socket.leave(currentRoom);
    currentRoom = null;
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  OTTv2 server đang chạy — mở các địa chỉ dưới đây:');
  console.log('    http://localhost:' + PORT + '                (máy đang chạy server)');
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const ni of nets[name] || []) {
      if (ni.family === 'IPv4' && !ni.internal) {
        console.log('    http://' + ni.address + ':' + PORT + '    (chia sẻ cho máy khác trong cùng mạng LAN/Wi-Fi)');
      }
    }
  }
  console.log('');
  console.log('  Máy khác trong LAN không mở được? Kiểm tra Firewall của Windows cho port ' + PORT + '.');
  console.log('  Khác mạng (khác Wi-Fi)? Dùng ngrok/cloudflared để tạo tunnel public, hoặc deploy lên Render.');
  console.log('');
});
