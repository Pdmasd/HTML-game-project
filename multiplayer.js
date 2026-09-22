/* multiplayer.js
 *
 *  Trực tuyến qua PlayroomKit (https://joinplayroom.com/).
 *  Load động từ CDN khi người dùng bật "Trực tuyến".  Không dùng server tự dựng —
 *  PlayroomKit lo phần signalling & sync trạng thái phòng.
 *
 *  Cách phân vai:
 *    Người vào phòng đầu tiên = Người chơi 1 (đỏ), người thứ hai = Người chơi 2 (xanh).
 *    Host (P1) là "authority" duy nhất viết vào state 'game'.
 *    Người chơi ở lượt sẽ tính nước cục bộ rồi gửi qua RPC 'move' cho tất cả.
 *
 *  Nếu import PlayroomKit thất bại (mạng chặn, ngoại tuyến...) ta fallback về
 *  BroadcastChannel để 2 tab trên cùng máy vẫn chơi được — phục vụ dev/test.
 */

const PLAYROOM_CDN = 'https://cdn.jsdelivr.net/npm/playroomkit@0.0.63/multiplayer.js';

window._online = { active: false, myPlayer: null };

let PR = null;                // PlayroomKit module (nếu load được)
let bc  = null;               // BroadcastChannel fallback
let assignedPlayers = new Map(); // playerId -> playerNumber (host tự quản)

async function startOnline() {
  const modal = document.getElementById('netModal');
  const info  = document.getElementById('netInfo');
  const extras = document.getElementById('netExtras');
  modal.classList.remove('hidden');
  info.textContent = 'Đang tải PlayroomKit từ CDN...';
  extras.innerHTML = '';

  try {
    PR = await import(PLAYROOM_CDN);
  } catch (err) {
    info.innerHTML =
      'Không tải được PlayroomKit (' + escapeHtml(err.message) + ').<br>' +
      'Chuyển sang chế độ <b>2 tab trên cùng máy</b> (BroadcastChannel) để bạn vẫn thử được.';
    startBroadcastFallback();
    return;
  }

  info.textContent = 'Đang mở lobby của PlayroomKit — chờ người thứ hai vào phòng...';
  extras.innerHTML =
    '<div class="share-box">Chia sẻ URL trên thanh địa chỉ (do PlayroomKit thêm ?r=...) ' +
    'cho bạn của bạn để họ vào cùng phòng.</div>';

  try {
    await PR.insertCoin({
      gameId: 'ottv2-vn',
      maxPlayersPerRoom: 2,
      matchmaking: true,
      skipLobby: false,
    });
  } catch (err) {
    info.textContent = 'PlayroomKit báo lỗi: ' + err.message;
    return;
  }

  window._online.active = true;

  // Khi có người vào — host phân vai
  PR.onPlayerJoin((playerState) => {
    if (PR.isHost()) {
      // Host gán số thứ tự dựa trên số người đã có
      const already = [...assignedPlayers.values()];
      const next = already.includes(1) ? 2 : 1;
      assignedPlayers.set(playerState.id, next);
      playerState.setState('num', next, true);

      // Nếu đã đủ 2 người: gửi state game hiện tại
      if (assignedPlayers.size >= 2) {
        PR.setState('game', window.OTT.serialize(), true);
      }
    }

    playerState.onQuit(() => {
      if (PR.isHost()) assignedPlayers.delete(playerState.id);
      appendNetLog(`Người chơi rời phòng: ${playerState.id.slice(0,6)}`);
    });
  });

  // Lấy số của mình khi host gán
  const me = PR.myPlayer();
  const pollMyNum = setInterval(() => {
    const n = me.getState('num');
    if (n) {
      clearInterval(pollMyNum);
      window._online.myPlayer = n;
      info.innerHTML = `Bạn là <b>Người chơi ${n}</b>.  Sẵn sàng — chúc vui!`;
      OTT.render();
    }
  }, 200);

  // Đồng bộ state game khi có thay đổi
  PR.onPlayerJoin && setInterval(() => {
    const g = PR.getState('game');
    if (g && g.__v !== window._online.lastV) {
      window._online.lastV = g.__v;
      OTT.loadFrom(g);
    }
  }, 150);

  // Nhận nước đi từ đối thủ qua RPC
  PR.RPC.register('move', async (data, caller) => {
    // caller.id === người gửi; ta áp dụng nước đi cục bộ
    const { fromR, fromC, toR, toC, byPlayer } = data;
    if (byPlayer !== OTT.state.turn) return; // out of order
    if (window._online.myPlayer === byPlayer) return; // đã áp dụng cục bộ rồi
    OTT.applyMove(fromR, fromC, toR, toC);
    OTT.render();
  });
  PR.RPC.register('new', async () => {
    OTT.newGame();
    OTT.render();
    document.getElementById('winModal').classList.add('hidden');
  });

  // Expose broadcast functions cho game.js
  window._online.broadcastMove = (m) => {
    PR.RPC.call('move', { ...m, byPlayer: window._online.myPlayer }, PR.RPC.Mode.OTHERS);
    // Host cũng cập nhật state để player mới vào giữa chừng vẫn thấy
    if (PR.isHost()) {
      const s = OTT.serialize();
      s.__v = (window._online.lastV || 0) + 1;
      window._online.lastV = s.__v;
      PR.setState('game', s, true);
    }
  };
  window._online.broadcastNew = () => {
    PR.RPC.call('new', {}, PR.RPC.Mode.OTHERS);
    if (PR.isHost()) {
      const s = OTT.serialize();
      s.__v = (window._online.lastV || 0) + 1;
      window._online.lastV = s.__v;
      PR.setState('game', s, true);
    }
  };
}

function stopOnline() {
  window._online.active = false;
  window._online.myPlayer = null;
  window._online.broadcastMove = null;
  window._online.broadcastNew = null;
  if (bc) { bc.close(); bc = null; }
  document.getElementById('netModal').classList.add('hidden');
  OTT.render();
  // PlayroomKit không cung cấp API leaveRoom clean — cần reload để hoàn toàn ngắt.
  // Ta chỉ tắt cờ, các callback sẽ no-op.
}

/* -------------- BroadcastChannel fallback (2 tab cùng máy) -------------- */

function startBroadcastFallback() {
  bc = new BroadcastChannel('ottv2-local');
  const myId = Math.random().toString(36).slice(2, 8);
  let myNum = null;
  const peers = new Set();

  bc.postMessage({ t: 'hello', id: myId });

  bc.onmessage = (ev) => {
    const m = ev.data;
    if (m.t === 'hello') {
      peers.add(m.id);
      bc.postMessage({ t: 'hi', id: myId, to: m.id });
      assignNumbers();
    } else if (m.t === 'hi' && m.to === myId) {
      peers.add(m.id);
      assignNumbers();
    } else if (m.t === 'assign' && m.to === myId) {
      myNum = m.num;
      window._online.myPlayer = myNum;
      document.getElementById('netInfo').innerHTML =
        `Bạn là <b>Người chơi ${myNum}</b> (2-tab local). Mở tab khác cùng URL để thử.`;
      OTT.render();
    } else if (m.t === 'state') {
      OTT.loadFrom(m.state);
    } else if (m.t === 'move' && m.byPlayer !== myNum) {
      OTT.applyMove(m.fromR, m.fromC, m.toR, m.toC);
      OTT.render();
    } else if (m.t === 'new') {
      OTT.newGame(); OTT.render();
      document.getElementById('winModal').classList.add('hidden');
    }
  };

  // First tab picks 1, second picks 2
  function assignNumbers() {
    if (myNum) return;
    if (peers.size === 0) {
      myNum = 1;
      window._online.myPlayer = 1;
      document.getElementById('netInfo').innerHTML =
        `Bạn là <b>Người chơi 1</b>. Mở tab thứ hai (cùng URL) để chơi.`;
      OTT.render();
    } else {
      // Nếu đã có ai khác thì mình là 2, và bảo họ họ là 1
      const other = [...peers][0];
      myNum = 2;
      window._online.myPlayer = 2;
      bc.postMessage({ t: 'assign', to: other, num: 1 });
      bc.postMessage({ t: 'state', state: OTT.serialize() });
      document.getElementById('netInfo').innerHTML =
        `Bạn là <b>Người chơi 2</b> (2-tab local).`;
      OTT.render();
    }
  }

  window._online.active = true;
  window._online.broadcastMove = (m) => {
    bc.postMessage({ t: 'move', ...m, byPlayer: myNum });
    bc.postMessage({ t: 'state', state: OTT.serialize() });
  };
  window._online.broadcastNew = () => {
    bc.postMessage({ t: 'new' });
    bc.postMessage({ t: 'state', state: OTT.serialize() });
  };
}

function appendNetLog(text) {
  const extras = document.getElementById('netExtras');
  if (!extras) return;
  const d = document.createElement('div');
  d.textContent = text;
  d.style.color = 'var(--muted)';
  d.style.fontSize = '12px';
  extras.appendChild(d);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

window.startOnline = startOnline;
window.stopOnline  = stopOnline;
