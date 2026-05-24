/**
 * game.js — 漢字よみかた神経衰弱
 * 機能: 1人プレイ / 2人対戦 / ヒント / コンボボーナス / 効果音
 */

// =============================================
//  効果音 (Web Audio API)
// =============================================
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) audioCtx = new AudioCtx();
  return audioCtx;
}

function playTone(freq, type, duration, vol = 0.3, delay = 0) {
  try {
    const ctx = getAudioCtx();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
    gain.gain.setValueAtTime(vol, ctx.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);
    osc.start(ctx.currentTime + delay);
    osc.stop(ctx.currentTime + delay + duration + 0.05);
  } catch (_) {}
}

const SFX = {
  flip:  () => playTone(440, "sine",   0.08, 0.15),
  match: () => {
    playTone(523, "sine", 0.12, 0.25, 0.00);
    playTone(659, "sine", 0.12, 0.25, 0.12);
    playTone(784, "sine", 0.18, 0.30, 0.24);
  },
  combo: (n) => {
    const notes = [523, 659, 784, 1047, 1319];
    for (let i = 0; i < Math.min(n, 5); i++) {
      playTone(notes[i], "sine", 0.15, 0.25, i * 0.10);
    }
  },
  miss:  () => playTone(220, "sawtooth", 0.18, 0.2),
  clear: () => {
    [523,659,784,1047,1319,1568].forEach((f,i) => playTone(f,"sine",0.3,0.25,i*0.09));
  },
  hint:  () => playTone(880, "sine", 0.15, 0.2),
  turn:  () => {
    playTone(330, "sine", 0.12, 0.2, 0.00);
    playTone(440, "sine", 0.12, 0.2, 0.14);
  },
};

// =============================================
//  状態管理
// =============================================
const state = {
  mode:          "solo",      // "solo" | "vs"
  grade:         1,
  pairCount:     8,
  cards:         [],
  flippedCards:  [],
  isLocked:      false,
  gameStarted:   false,

  // 1人プレイ
  flipCount:     0,
  matchCount:    0,
  combo:         0,
  maxCombo:      0,
  hintLeft:      3,
  timerInterval: null,
  elapsedSeconds:0,

  // 2人対戦
  currentPlayer: 1,          // 1 or 2
  scores:        [0, 0],     // [p1, p2]
  matchCount2P:  0,
  waitingTurn:   false,      // ターン交代待ち
};

// =============================================
//  DOM ショートカット
// =============================================
const $ = id => document.getElementById(id);

// =============================================
//  ユーティリティ
// =============================================
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function formatTime(sec) {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

// =============================================
//  タイマー
// =============================================
function startTimer() {
  clearInterval(state.timerInterval);
  state.elapsedSeconds = 0;
  state.timerInterval = setInterval(() => {
    state.elapsedSeconds++;
    $("timerDisplay").textContent = formatTime(state.elapsedSeconds);
  }, 1000);
}
function stopTimer() { clearInterval(state.timerInterval); }

// =============================================
//  カード生成
// =============================================
function buildCards() {
  const pool     = shuffle(KANJI_DATA[state.grade]);
  const selected = pool.slice(0, state.pairCount);
  const pairs    = [];

  selected.forEach((item, i) => {
    pairs.push({ id: `k-${i}`, pairId: i, type: "kanji",   kanji: item.kanji, reading: item.reading, matched: false, flipped: false });
    pairs.push({ id: `r-${i}`, pairId: i, type: "reading", kanji: item.kanji, reading: item.reading, matched: false, flipped: false });
  });

  return shuffle(pairs);
}

// =============================================
//  レンダリング
// =============================================
function getGridCols(total) {
  if (total <= 12) return 4;
  if (total <= 20) return 5;
  return 6;
}

function renderBoard() {
  const board = $("board");
  const cols  = getGridCols(state.cards.length);
  board.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  board.innerHTML = "";

  state.cards.forEach(card => {
    const el = document.createElement("div");
    el.className = "card";
    el.dataset.id = card.id;
    if (card.flipped || card.matched) el.classList.add("flipped");
    if (card.matched) el.classList.add("matched");

    el.innerHTML = `
      <div class="card-inner">
        <div class="card-front"><span class="card-icon">🀄</span></div>
        <div class="card-back ${card.type}">
          <span class="card-face-text">${card.type === "kanji" ? card.kanji : card.reading}</span>
          <span class="card-face-sub">${card.type === "kanji" ? "漢字" : "よみ"}</span>
        </div>
      </div>`;

    el.addEventListener("click", () => onCardClick(card.id));
    board.appendChild(el);
  });
}

function updateCardEl(cardId) {
  const card = state.cards.find(c => c.id === cardId);
  const el   = document.querySelector(`[data-id="${cardId}"]`);
  if (!el || !card) return;
  el.classList.toggle("flipped", card.flipped || card.matched);
  el.classList.toggle("matched", card.matched);
}

// =============================================
//  ステータス更新
// =============================================
function updateStatus() {
  if (state.mode === "solo") {
    $("flipCount").textContent   = state.flipCount;
    $("matchCount1P").textContent = `${state.matchCount} / ${state.pairCount}`;
    $("comboDisplay").textContent = state.combo;
    $("hintCount").textContent    = state.hintLeft;
  } else {
    // 2人
    $("p1pts").textContent     = `${state.scores[0]} ポイント`;
    $("p2pts").textContent     = `${state.scores[1]} ポイント`;
    $("matchCount2P").textContent = `${state.matchCount2P} / ${state.pairCount}`;
    updateTurnUI();
  }
}

function updateTurnUI() {
  const p = state.currentPlayer;
  $("turnLabel").textContent = `プレイヤー${p} のターン`;
  $("turnArrow").textContent = p === 1 ? "▼" : "▲";

  $("player1Score").classList.toggle("active-player", p === 1);
  $("player2Score").classList.toggle("active-player", p === 2);
}

// =============================================
//  カードクリック
// =============================================
function onCardClick(cardId) {
  if (state.isLocked || !state.gameStarted || state.waitingTurn) return;

  const card = state.cards.find(c => c.id === cardId);
  if (!card || card.matched || card.flipped) return;
  if (state.flippedCards.length >= 2) return;

  SFX.flip();
  card.flipped = true;
  updateCardEl(cardId);
  state.flippedCards.push(card);

  if (state.mode === "solo") {
    state.flipCount++;
    updateStatus();
  }

  if (state.flippedCards.length === 2) {
    state.isLocked = true;
    setTimeout(checkMatch, 900);
  }
}

// =============================================
//  マッチ判定
// =============================================
function checkMatch() {
  const [a, b]  = state.flippedCards;
  const isMatch = a.pairId === b.pairId && a.type !== b.type;

  if (isMatch) {
    a.matched = true;
    b.matched = true;
    updateCardEl(a.id);
    updateCardEl(b.id);
    popEffect(a.id, b.id);
    SFX.match();

    if (state.mode === "solo") {
      state.matchCount++;
      state.combo++;
      if (state.combo > state.maxCombo) state.maxCombo = state.combo;
      updateStatus();
      showCombo(state.combo);

      if (state.matchCount === state.pairCount) {
        setTimeout(showClear1P, 600);
      }
    } else {
      state.scores[state.currentPlayer - 1]++;
      state.matchCount2P++;
      updateStatus();
      showComboVs(state.currentPlayer);

      if (state.matchCount2P === state.pairCount) {
        setTimeout(showClear2P, 600);
      } else {
        // マッチしたら続けてターン
        state.flippedCards = [];
        state.isLocked = false;
        return;
      }
    }
  } else {
    // ミス
    SFX.miss();
    a.flipped = false;
    b.flipped = false;
    updateCardEl(a.id);
    updateCardEl(b.id);
    shakeEffect(a.id, b.id);

    if (state.mode === "solo") {
      state.combo = 0;
      updateStatus();
    } else {
      // ターン交代
      switchTurn();
      state.flippedCards = [];
      state.isLocked = false;
      return;
    }
  }

  state.flippedCards = [];
  state.isLocked = false;
}

// =============================================
//  ターン交代 (2人)
// =============================================
function switchTurn() {
  state.currentPlayer = state.currentPlayer === 1 ? 2 : 1;
  state.waitingTurn   = true;
  SFX.turn();

  const p      = state.currentPlayer;
  const colors = ["🔴", "🔵"];
  $("turnOverlayIcon").textContent  = colors[p - 1];
  $("turnOverlayTitle").textContent = `プレイヤー${p} のターン！`;
  $("turnOverlay").style.display    = "flex";

  updateTurnUI();
}

$("turnOverlay").addEventListener("click", () => {
  $("turnOverlay").style.display = "none";
  state.waitingTurn = false;
});

// =============================================
//  コンボ演出
// =============================================
function showCombo(n) {
  if (n < 2) return;
  SFX.combo(n);
  const banner = $("comboBanner");
  const messages = ["", "", "🔥 コンボ！", "🔥🔥 ダブルコンボ！", "⚡ トリプル！", "💥 すごい！", "🌟 かんぺき！"];
  const msg = n >= messages.length ? `🌟 ${n}連続！` : messages[n];
  banner.textContent = msg;
  banner.className   = "combo-banner show";
  clearTimeout(banner._timeout);
  banner._timeout = setTimeout(() => banner.classList.remove("show"), 1600);
}

function showComboVs(player) {
  const banner = $("comboBanner");
  const icons  = ["🔴", "🔵"];
  banner.textContent = `${icons[player - 1]} ゲット！`;
  banner.className   = "combo-banner show";
  clearTimeout(banner._timeout);
  banner._timeout = setTimeout(() => banner.classList.remove("show"), 1200);
}

// =============================================
//  ヒント機能
// =============================================
function useHint() {
  if (state.hintLeft <= 0 || state.isLocked || !state.gameStarted) return;
  if (state.mode !== "solo") return;

  state.hintLeft--;
  SFX.hint();
  updateStatus();

  // まだマッチしていないペアを1つ選んで一瞬表示
  const unmatched = state.cards.filter(c => !c.matched && !c.flipped);
  if (unmatched.length < 2) return;

  // ランダムにペアを選ぶ
  const shuffled = shuffle(unmatched);
  const first    = shuffled[0];
  const partner  = shuffled.find(c => c.pairId === first.pairId && c.id !== first.id);
  if (!partner) return;

  const ids = [first.id, partner.id];
  ids.forEach(id => {
    const el = document.querySelector(`[data-id="${id}"]`);
    if (el) el.classList.add("hint-show");
  });

  setTimeout(() => {
    ids.forEach(id => {
      const el = document.querySelector(`[data-id="${id}"]`);
      if (el) el.classList.remove("hint-show");
    });
  }, 1200);
}

$("btnHint").addEventListener("click", useHint);

// =============================================
//  エフェクト
// =============================================
function popEffect(...ids) {
  ids.forEach(id => {
    const el = document.querySelector(`[data-id="${id}"]`);
    if (!el) return;
    el.classList.add("pop");
    setTimeout(() => el.classList.remove("pop"), 600);
  });
}

function shakeEffect(...ids) {
  ids.forEach(id => {
    const el = document.querySelector(`[data-id="${id}"]`);
    if (!el) return;
    el.classList.add("shake");
    setTimeout(() => el.classList.remove("shake"), 500);
  });
}

// =============================================
//  クリア表示 — 1人
// =============================================
function calcRating() {
  const ratio = state.pairCount / state.flipCount;
  if (ratio >= 0.85) return { stars: 3, label: "⭐⭐⭐ かんぺき！" };
  if (ratio >= 0.6)  return { stars: 2, label: "⭐⭐ すごい！" };
  return                    { stars: 1, label: "⭐ よくがんばった！" };
}

function showClear1P() {
  stopTimer();
  SFX.clear();
  const { stars, label } = calcRating();

  $("finalFlips").textContent = `${state.flipCount} 回`;
  $("finalTime").textContent  = formatTime(state.elapsedSeconds);
  $("finalCombo").textContent = `${state.maxCombo} 連続`;
  $("finalRating").textContent = label;

  const starEl = $("clearStars");
  starEl.innerHTML = "";
  for (let i = 0; i < stars; i++) {
    const s = document.createElement("span");
    s.className = "star";
    s.textContent = "⭐";
    s.style.animationDelay = `${i * 0.2}s`;
    starEl.appendChild(s);
  }

  $("clearOverlay1P").style.display = "flex";
}

// =============================================
//  クリア表示 — 2人
// =============================================
function showClear2P() {
  SFX.clear();
  const [s1, s2] = state.scores;

  let icon, title;
  if (s1 > s2)       { icon = "🏆"; title = "プレイヤー1 の勝ち！🎉"; }
  else if (s2 > s1)  { icon = "🏆"; title = "プレイヤー2 の勝ち！🎉"; }
  else               { icon = "🤝"; title = "引き分け！すごい！"; }

  $("winnerEmoji").textContent   = icon;
  $("winnerTitle").textContent   = title;
  $("vsP1Score").textContent     = `${s1} ポイント`;
  $("vsP2Score").textContent     = `${s2} ポイント`;

  $("vsP1Result").classList.toggle("winner", s1 >= s2);
  $("vsP2Result").classList.toggle("winner", s2 >= s1);

  $("clearOverlay2P").style.display = "flex";
}

// =============================================
//  ゲーム開始
// =============================================
function startGame(mode) {
  state.mode      = mode;
  state.grade     = parseInt($("gradeSelect").value);
  state.pairCount = parseInt($("pairSelect").value);
  state.cards     = buildCards();

  state.flippedCards   = [];
  state.isLocked       = false;
  state.gameStarted    = true;
  state.waitingTurn    = false;

  // 1人
  state.flipCount      = 0;
  state.matchCount     = 0;
  state.combo          = 0;
  state.maxCombo       = 0;
  state.hintLeft       = 3;
  state.elapsedSeconds = 0;

  // 2人
  state.currentPlayer  = 1;
  state.scores         = [0, 0];
  state.matchCount2P   = 0;

  // UI 切り替え
  $("startScreen").style.display    = "none";
  $("clearOverlay1P").style.display = "none";
  $("clearOverlay2P").style.display = "none";
  $("turnOverlay").style.display    = "none";

  if (mode === "solo") {
    $("statusBar1P").style.display = "flex";
    $("statusBar2P").style.display = "none";
    updateStatus();
    startTimer();
  } else {
    $("statusBar1P").style.display = "none";
    $("statusBar2P").style.display = "flex";
    updateStatus();
  }

  renderBoard();
}

function resetGame() {
  stopTimer();
  startGame(state.mode);
}

function goHome() {
  stopTimer();
  state.gameStarted = false;
  $("startScreen").style.display    = "flex";
  $("clearOverlay1P").style.display = "none";
  $("clearOverlay2P").style.display = "none";
  $("statusBar1P").style.display    = "none";
  $("statusBar2P").style.display    = "none";
  $("board").innerHTML               = "";
}

// =============================================
//  イベント
// =============================================
$("btnSolo").addEventListener("click", () => startGame("solo"));
$("btnVs").addEventListener("click",   () => startGame("vs"));

$("btnHeaderStart").addEventListener("click", () => {
  if (state.gameStarted) resetGame();
  else goHome();
});

$("btnReset1P").addEventListener("click", resetGame);
$("btnReset2P").addEventListener("click", resetGame);

$("btnAgain1P").addEventListener("click", resetGame);
$("btnChange1P").addEventListener("click", goHome);
$("btnAgain2P").addEventListener("click", resetGame);
$("btnChange2P").addEventListener("click", goHome);
