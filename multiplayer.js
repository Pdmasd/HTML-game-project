/* multiplayer.js — Lớp mạng dùng Socket.IO
 *
 *  Người chơi 1: bấm "Tạo phòng mới" -> nhận mã 5 ký tự.
 *  Người chơi 2: nhập mã vào ô -> "Vào phòng".
 *  Server (server.js) giữ danh sách phòng và relay nước đi giữa 2 client.
 *
 *  Hợp đồng với game.js không đổi:
 *    - window._online.active         : boolean, true khi đang chơi online
 *    - window._online.myPlayer       : 1 hoặc 2
 *    - window._online.broadcastMove  : gửi 1 nước đi cho đối thủ
 *    - window._online.broadcastNew   : báo ván mới
 */

window._online = { active: false, myPlayer: null };

let socket = null;
let currentCode = null;

/* ------------- Public entry points ------------- */

async function startOnline() {
  openNetModal();
  const info = document.getElementById('netInfo');
  const extras = document.getElementById('netExtras');

  if (!window.io) {
    info.innerHTML =
      'Không tải được thư viện <code>socket.io</code>.<br>' +
      'Hãy chạy server ở thư mục dự án: <code>npm install &amp;&amp; npm start</code>, ' +
      'rồi mở <code>http://localhost:3000</code>.';
    extras.innerHTML = '';
    return;
  }

  info.textContent = 'Đang kết nối tới máy chủ...';
  extras.innerHTML = '';

  if (!socket) {
    socket = io();
    bindSocketEvents();
    installBroadcast();
  }

  if (socket.connected) {
    showLobby();
  } else {
    socket.once('connect', showLobby);
  }
}

function stopOnline() {
  window._online.active = false;
  window._online.myPlayer = null;
  currentCode = null;
  if (socket) {
    socket.emit('leaveRoom');
    socket.disconnect();
    socket = null;
  }
  document.getElementById('netModal').classList.add('hidden');
  OTT.render();
}

window.startOnline = startOnline;
window.stopOnline  = stopOnline;

/* ------------- UI: modal & lobby ------------- */

function openNetModal() {
  document.getElementById('netModal').classList.remove('hidden');
}

function showLobby() {
  const info = document.getElementById('netInfo');
  const extras = document.getElementById('netExtras');
  info.innerHTML = 'Đã kết nối máy chủ. <b>Tạo phòng mới</b> hoặc nhập <b>mã phòng</b> để tham gia.';
  extras.innerHTML = `
    <div class="lobby">
      <button id="btnCreateRoom" class="net-btn primary">Tạo phòng mới</button>
      <div class="or-sep">— hoặc —</div>
      <div class="join-row">
        <input id="joinCodeInput" type="text" maxlength="5"
               autocomplete="off" spellcheck="false"
               placeholder="Nhập mã (VD: A2K7X)" />
        <button id="btnJoinRoom" class="net-btn">Vào phòng</button>
      </div>
      <div id="joinError" class="join-error"></div>
    </div>
  `;
  document.getElementById('btnCreateRoom').addEventListener('click', createRoom);
  document.getElementById('btnJoinRoom').addEventListener('click', joinRoom);
  const input = document.getElementById('joinCodeInput');
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom(); });
  input.addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });
  input.focus();
}

function showRoomHeader(code, playerNum, extraHtml = '') {
  document.getElementById('netInfo').innerHTML =
    `Đang ở phòng <b>${escapeHtml(code)}</b>. Bạn là <b>Người chơi ${playerNum}</b>.`;
  document.getElementById('netExtras').innerHTML = `
    <div class="room-code-box">
      <div class="room-code-label">Mã phòng</div>
      <div class="room-code">${escapeHtml(code)}</div>
      <button id="btnCopyCode" class="net-btn tiny">Sao chép</button>
    </div>
    ${extraHtml}
  `;
  const btn = document.getElementById('btnCopyCode');
  if (btn) btn.addEventListener('click', () => {
    navigator.clipboard?.writeText(code);
    btn.textContent = 'Đã chép ✓';
    setTimeout(() => (btn.textContent = 'Sao chép'), 1500);
  });
}

function createRoom() {
  document.getElementById('netInfo').textContent = 'Đang tạo phòng...';
  socket.emit('createRoom');
}

function joinRoom() {
  const input = document.getElementById('joinCodeInput');
  const code = (input.value || '').trim().toUpperCase();
  const err = document.getElementById('joinError');
  if (!code) { err.textContent = 'Vui lòng nhập mã phòng.'; return; }
  err.textContent = '';
  socket.emit('joinRoom', code);
}

/* ------------- Socket event handlers ------------- */

function bindSocketEvents() {
  socket.on('connect_error', (e) => {
    document.getElementById('netInfo').innerHTML =
      'Không kết nối được máy chủ Socket.IO (' + escapeHtml(e.message) + ').';
  });

  socket.on('disconnect', () => {
    if (window._online.active) appendNetLog('Mất kết nối tới máy chủ.');
  });

  socket.on('roomCreated', ({ code, playerNum }) => {
    currentCode = code;
    window._online.active = true;
    window._online.myPlayer = playerNum;
    showRoomHeader(code, playerNum, `
      <div class="share-box">Chia sẻ mã trên cho bạn của bạn để họ vào cùng phòng.</div>
      <div class="waiting" id="waitingMsg">⏳ Đang chờ đối thủ vào phòng...</div>
    `);
    OTT.newGame();
    OTT.render();
  });

  socket.on('roomJoined', ({ code, playerNum, state }) => {
    currentCode = code;
    window._online.active = true;
    window._online.myPlayer = playerNum;
    showRoomHeader(code, playerNum, `<div class="waiting">✔ Đã vào phòng — bắt đầu chơi!</div>`);
    if (state) OTT.loadFrom(state);
    else { OTT.newGame(); OTT.render(); }
  });

  socket.on('opponentJoined', () => {
    const w = document.getElementById('waitingMsg');
    if (w) w.textContent = '✔ Đối thủ đã vào — bắt đầu!';
    // Chủ phòng gửi ảnh state hiện tại để đảm bảo đồng bộ
    socket.emit('syncState', OTT.serialize());
  });

  socket.on('opponentMove', (m) => {
    OTT.applyMove(m.fromR, m.fromC, m.toR, m.toC);
    OTT.render();
    if (OTT.state.winner) {
      document.getElementById('winModal').classList.remove('hidden');
    }
  });

  socket.on('opponentNewGame', () => {
    OTT.newGame();
    OTT.render();
    document.getElementById('winModal').classList.add('hidden');
    appendNetLog('Đối thủ đã bắt đầu ván mới.');
  });

  socket.on('state', (state) => {
    if (state) OTT.loadFrom(state);
  });

  socket.on('opponentLeft', () => {
    appendNetLog('Đối thủ đã rời phòng.');
    const w = document.getElementById('waitingMsg');
    if (w) w.textContent = '⏳ Đối thủ đã rời — chờ người khác...';
  });

  socket.on('roomError', (msg) => {
    const err = document.getElementById('joinError');
    if (err) err.textContent = msg;
    else document.getElementById('netInfo').textContent = msg;
  });
}

function installBroadcast() {
  window._online.broadcastMove = (m) => {
    if (socket && socket.connected) socket.emit('move', m);
  };
  window._online.broadcastNew = () => {
    if (socket && socket.connected) {
      socket.emit('newGame');
      // Gửi kèm state mới để late-join sau đó nhận đúng ván
      socket.emit('syncState', OTT.serialize());
    }
  };
}

/* ------------- Helpers ------------- */

function appendNetLog(text) {
  const extras = document.getElementById('netExtras');
  if (!extras) return;
  const d = document.createElement('div');
  d.textContent = text;
  d.className = 'net-log-line';
  extras.appendChild(d);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
