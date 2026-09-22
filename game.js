/* Oẳn Tù Tì v2 — game engine + UI
 *  Bàn cờ 9x9, ký hiệu ô: a1..i9 (a = cột trái, 1 = hàng dưới)
 *  Quân: R (Đấm), P (Lá), S (Kéo)  —  R>S, S>P, P>R
 *  Đi 1 ô theo 8 hướng (như Vua).
 *  Ăn quân: khác loại và mình thắng RPS thì ăn; cùng loại hoặc mình thua RPS thì bị chặn.
 *  Thắng:  ăn sạch 1 loại quân của đối phương  HOẶC  đưa quân vào ô đích:
 *          P1 (đỏ) đích = i9,  P2 (xanh) đích = a1.
 */

const FILES = ['a','b','c','d','e','f','g','h','i'];
const RANKS = ['1','2','3','4','5','6','7','8','9'];
const TYPES = ['R','P','S'];
const TYPE_VI = { R: 'Đấm', P: 'Lá', S: 'Kéo' };
const TYPE_ICON = { R: '✊', P: '✋', S: '✌' };

/** Coordinate helpers.  Internal: board[row][col] with row 0 = rank 1, col 0 = file a. */
function coordName(row, col) { return FILES[col] + RANKS[row]; }

const GOAL = {
  1: { row: 8, col: 8 }, // i9
  2: { row: 0, col: 0 }, // a1
};

function beats(a, b) {
  return (a === 'R' && b === 'S') ||
         (a === 'P' && b === 'R') ||
         (a === 'S' && b === 'P');
}

function initialBoard() {
  const b = Array.from({length: 9}, () => Array(9).fill(null));
  const p1Row = ['R','R','R','P','P','P','S','S','S'];
  const p2Row = ['S','S','S','P','P','P','R','R','R'];
  for (let c = 0; c < 9; c++) {
    b[0][c] = { type: p1Row[c], player: 1 };
    b[8][c] = { type: p2Row[c], player: 2 };
  }
  return b;
}

function cloneBoard(b) {
  return b.map(row => row.map(cell => cell ? { ...cell } : null));
}

/* ------------- Game state (single source of truth) ------------- */

const state = {
  board: initialBoard(),
  turn: 1,
  selected: null,           // {row,col} of selected piece
  validMoves: [],           // [{row,col,capture}]
  winner: null,             // 1|2|null
  winReason: null,          // 'goal' | 'wipeout' | null
  wipedType: null,
  history: [],              // for undo in hotseat
  log: [],                  // ['1. Rd1-e2 x ...'] user-facing
  moveNo: 1,
};

/* ------------- Rules ------------- */

function getValidMovesFor(row, col, boardOverride = null, turnOverride = null) {
  const board = boardOverride || state.board;
  const turn = turnOverride ?? state.turn;
  const piece = board[row][col];
  if (!piece || piece.player !== turn) return [];
  const moves = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = row + dr, nc = col + dc;
      if (nr < 0 || nr > 8 || nc < 0 || nc > 8) continue;
      const t = board[nr][nc];
      if (t === null) {
        moves.push({ row: nr, col: nc, capture: false });
      } else if (t.player !== piece.player && beats(piece.type, t.type)) {
        moves.push({ row: nr, col: nc, capture: true });
      }
    }
  }
  return moves;
}

function countType(player, type, board = state.board) {
  let n = 0;
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++) {
      const p = board[r][c];
      if (p && p.player === player && p.type === type) n++;
    }
  return n;
}

/* Apply a move.  Assumes the move is legal for state.turn.
 * Returns {ok, captured, winReason, wipedType, san}.  Mutates state.
 */
function applyMove(fromR, fromC, toR, toC) {
  const piece = state.board[fromR][fromC];
  if (!piece || piece.player !== state.turn) return { ok: false };
  const legal = getValidMovesFor(fromR, fromC).find(m => m.row === toR && m.col === toC);
  if (!legal) return { ok: false };

  // save undo (hotseat only)
  state.history.push({
    board: cloneBoard(state.board),
    turn: state.turn,
    log: state.log.slice(),
    moveNo: state.moveNo,
  });

  const captured = state.board[toR][toC];
  state.board[toR][toC] = piece;
  state.board[fromR][fromC] = null;

  const san = notation(piece, fromR, fromC, toR, toC, captured);

  // Win: goal square
  const goal = GOAL[piece.player];
  if (toR === goal.row && toC === goal.col) {
    state.winner = piece.player;
    state.winReason = 'goal';
    state.log.push(`${state.moveNo}. ${san} ✦ Chiến thắng bằng đích!`);
    state.moveNo++;
    return { ok: true, captured, winReason: 'goal', san };
  }

  // Win: wiped out one type
  if (captured) {
    const remaining = countType(captured.player, captured.type);
    if (remaining === 0) {
      state.winner = piece.player;
      state.winReason = 'wipeout';
      state.wipedType = captured.type;
      state.log.push(`${state.moveNo}. ${san} ✦ Diệt sạch ${TYPE_VI[captured.type]}!`);
      state.moveNo++;
      return { ok: true, captured, winReason: 'wipeout', wipedType: captured.type, san };
    }
  }

  state.log.push(`${state.moveNo}. ${san}`);
  state.moveNo++;
  state.turn = state.turn === 1 ? 2 : 1;
  return { ok: true, captured, winReason: null, san };
}

function notation(piece, fr, fc, tr, tc, captured) {
  const tag = TYPE_ICON[piece.type];
  const sep = captured ? 'x' : '-';
  const from = coordName(fr, fc);
  const to = coordName(tr, tc);
  return `${tag}${from}${sep}${to}${captured ? '(' + TYPE_ICON[captured.type] + ')' : ''}`;
}

function undo() {
  if (state.history.length === 0) return false;
  const h = state.history.pop();
  state.board = h.board;
  state.turn = h.turn;
  state.log = h.log;
  state.moveNo = h.moveNo;
  state.selected = null;
  state.validMoves = [];
  state.winner = null;
  state.winReason = null;
  state.wipedType = null;
  return true;
}

function newGame() {
  state.board = initialBoard();
  state.turn = 1;
  state.selected = null;
  state.validMoves = [];
  state.winner = null;
  state.winReason = null;
  state.wipedType = null;
  state.history = [];
  state.log = [];
  state.moveNo = 1;
}

/* ------------- Rendering ------------- */

const els = {};
function $(id) { return document.getElementById(id); }

function buildBoardDOM() {
  const board = $('board');
  board.innerHTML = '';
  // render rows top-to-bottom: rank 9 first
  for (let vr = 0; vr < 9; vr++) {
    const row = 8 - vr; // internal row
    for (let col = 0; col < 9; col++) {
      const cell = document.createElement('div');
      cell.className = 'cell ' + ((row + col) % 2 === 0 ? 'dark' : 'light');
      cell.dataset.row = row;
      cell.dataset.col = col;
      const coord = document.createElement('span');
      coord.className = 'coord';
      coord.textContent = coordName(row, col);
      cell.appendChild(coord);
      if (row === 0 && col === 0) { cell.classList.add('goal-p2'); cell.dataset.goal = 'P2 ĐÍCH'; }
      if (row === 8 && col === 8) { cell.classList.add('goal-p1'); cell.dataset.goal = 'P1 ĐÍCH'; }
      cell.addEventListener('click', onCellClick);
      board.appendChild(cell);
    }
  }
  // ranks (top = 9)
  const ranks = $('ranks'); ranks.innerHTML = '';
  for (let vr = 0; vr < 9; vr++) {
    const s = document.createElement('div'); s.textContent = RANKS[8 - vr]; ranks.appendChild(s);
  }
  // files (a..i)
  const files = $('files'); files.innerHTML = '';
  for (let c = 0; c < 9; c++) {
    const s = document.createElement('div'); s.textContent = FILES[c]; files.appendChild(s);
  }
}

function render() {
  // Pieces & highlights
  const cells = $('board').children;
  for (const cell of cells) {
    const r = +cell.dataset.row, c = +cell.dataset.col;
    // clear
    cell.classList.remove('selected', 'move', 'capture');
    const oldPiece = cell.querySelector('.piece');
    if (oldPiece) oldPiece.remove();
    // piece
    const p = state.board[r][c];
    if (p) {
      const el = document.createElement('div');
      el.className = 'piece p' + p.player;
      el.textContent = TYPE_ICON[p.type];
      el.title = TYPE_VI[p.type] + ' — P' + p.player + ' — ' + coordName(r, c);
      cell.appendChild(el);
    }
  }
  // Selection & moves
  if (state.selected) {
    const { row, col } = state.selected;
    cellAt(row, col).classList.add('selected');
    for (const m of state.validMoves) {
      cellAt(m.row, m.col).classList.add(m.capture ? 'capture' : 'move');
    }
  }
  // Turn banner
  const b = $('turnBanner');
  b.classList.remove('p1','p2');
  if (state.winner) {
    b.textContent = 'Kết thúc — Người chơi ' + state.winner + ' thắng!';
  } else {
    b.textContent = 'Lượt: Người chơi ' + state.turn +
      (window._online && window._online.myPlayer === state.turn ? ' (BẠN)' :
       window._online && window._online.myPlayer && window._online.myPlayer !== state.turn ? ' (đối thủ)' : '');
    b.classList.add('p' + state.turn);
  }
  // Counts
  renderCounts(1, $('p1counts'));
  renderCounts(2, $('p2counts'));
  // Log
  const logEl = $('log');
  logEl.innerHTML = '';
  for (const line of state.log) {
    const li = document.createElement('li');
    li.textContent = line;
    if (line.includes('Chiến thắng') || line.includes('Diệt sạch')) li.classList.add('win');
    logEl.appendChild(li);
  }
  logEl.scrollTop = logEl.scrollHeight;
  // Status
  $('status').textContent = state.winner ? '' :
    (state.selected ? `Đang chọn ${coordName(state.selected.row, state.selected.col)}` : '');
}

function renderCounts(player, container) {
  container.innerHTML = '';
  for (const t of TYPES) {
    const n = countType(player, t);
    const el = document.createElement('div');
    el.className = 'cnt' + (n === 0 ? ' dead' : '');
    el.innerHTML = `<span class="mini p${player}">${TYPE_ICON[t]}</span> ${TYPE_VI[t]}: <b>${n}</b>`;
    container.appendChild(el);
  }
}

function cellAt(row, col) {
  return $('board').querySelector(`.cell[data-row="${row}"][data-col="${col}"]`);
}

/* ------------- Interaction ------------- */

function onCellClick(e) {
  if (state.winner) return;

  // Online: enforce turn ownership
  if (window._online && window._online.active) {
    if (window._online.myPlayer !== state.turn) return;
  }

  const cell = e.currentTarget;
  const r = +cell.dataset.row, c = +cell.dataset.col;
  const piece = state.board[r][c];

  // If clicked on my own piece → select
  if (piece && piece.player === state.turn) {
    state.selected = { row: r, col: c };
    state.validMoves = getValidMovesFor(r, c);
    render();
    return;
  }

  // If a piece is selected and clicked target is a valid move → move
  if (state.selected) {
    const legal = state.validMoves.find(m => m.row === r && m.col === c);
    if (legal) {
      const from = { r: state.selected.row, c: state.selected.col };
      const result = applyMove(from.r, from.c, r, c);
      if (result.ok) {
        state.selected = null;
        state.validMoves = [];
        render();
        // notify online layer
        if (window._online && window._online.active && window._online.broadcastMove) {
          window._online.broadcastMove({ fromR: from.r, fromC: from.c, toR: r, toC: c });
        }
        if (state.winner) showWinModal();
      }
      return;
    }
  }

  // Otherwise deselect
  state.selected = null;
  state.validMoves = [];
  render();
}

function showWinModal() {
  const p = state.winner;
  $('winTitle').textContent = `Người chơi ${p} thắng!`;
  $('winDesc').textContent =
    state.winReason === 'goal'
      ? `Đưa quân vào ô đích ${coordName(GOAL[p].row, GOAL[p].col)}.`
      : `Đã ăn sạch quân ${TYPE_VI[state.wipedType]} của đối phương.`;
  $('winModal').classList.remove('hidden');
}

/* ------------- Public API for multiplayer.js ------------- */

window.OTT = {
  state,
  applyMove,
  getValidMovesFor,
  newGame,
  render,
  cloneBoard,
  serialize() {
    return {
      board: cloneBoard(state.board),
      turn: state.turn,
      winner: state.winner,
      winReason: state.winReason,
      wipedType: state.wipedType,
      log: state.log.slice(),
      moveNo: state.moveNo,
    };
  },
  loadFrom(snap) {
    state.board = snap.board.map(row => row.map(c => c ? { ...c } : null));
    state.turn = snap.turn;
    state.winner = snap.winner ?? null;
    state.winReason = snap.winReason ?? null;
    state.wipedType = snap.wipedType ?? null;
    state.log = snap.log ? snap.log.slice() : [];
    state.moveNo = snap.moveNo ?? (state.log.length + 1);
    state.selected = null;
    state.validMoves = [];
    render();
    if (state.winner) showWinModal();
  },
};

/* ------------- Boot ------------- */

document.addEventListener('DOMContentLoaded', () => {
  buildBoardDOM();
  render();

  $('btnNew').addEventListener('click', () => {
    newGame();
    render();
    $('winModal').classList.add('hidden');
    if (window._online && window._online.active && window._online.broadcastNew) {
      window._online.broadcastNew();
    }
  });
  $('btnUndo').addEventListener('click', () => {
    if (window._online && window._online.active) return; // no undo online
    if (undo()) render();
  });
  $('btnWinNew').addEventListener('click', () => {
    $('winModal').classList.add('hidden');
    newGame(); render();
    if (window._online && window._online.active && window._online.broadcastNew) {
      window._online.broadcastNew();
    }
  });
  $('btnNetClose').addEventListener('click', () => {
    $('netModal').classList.add('hidden');
  });

  document.querySelectorAll('input[name="mode"]').forEach(r => {
    r.addEventListener('change', (e) => {
      if (e.target.value === 'online') {
        window.startOnline && window.startOnline();
      } else {
        window.stopOnline && window.stopOnline();
      }
    });
  });
});
