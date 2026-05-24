/**
 * game.js
 * 漢字よみかた神経衰弱 ゲームロジック
 */

// ========== 状態管理 ==========
const state = {
  grade: 1,
  pairCount: 8,
  cards: [],          // { id, type:'kanji'|'reading', kanji, reading, matched, flipped }
  flippedCards: [],   // 現在めくっている最大2枚
  matchCount: 0,
  flipCount: 0,
  timerInterval: null,
  elapsedSeconds: 0,
  isLocked: false,    // アニメーション中はクリック禁止
  gameStarted: false,
};

// ========== DOM 参照 ==========
const dom = {
  board:        () => document.getElementById("board"),
  startScreen:  () => document.getElementById("startScreen"),
  statusBar:    () => document.getElementById("statusBar"),
  flipCount:    () => document.getElementById("flipCount"),
  matchCount:   () => document.getElementById("matchCount"),
  timerDisplay: () => document.getElementById("timerDisplay"),
  gradeSelect:  () => document.getElementById("gradeSelect"),
  pairSelect:   () => document.getElementById("pairSelect"),
  clearOverlay: () => document.getElementById("clearOverlay"),
  finalFlips:   () => document.getElementById("finalFlips"),
  finalTime:    () => document.getElementById("finalTime"),
  finalRating:  () => document.getElementById("finalRating"),
  clearStars:   () => document.getElementById("clearStars"),
};

// ========== ユーティリティ ==========
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ========== タイマー ==========
function startTimer() {
  clearInterval(state.timerInterval);
  state.elapsedSeconds = 0;
  state.timerInterval = setInterval(() => {
    state.elapsedSeconds++;
    dom.timerDisplay().textContent = formatTime(state.elapsedSeconds);
  }, 1000);
}

function stopTimer() {
  clearInterval(state.timerInterval);
}

// ========== カード生成 ==========
function buildCards() {
  const pool = shuffle(KANJI_DATA[state.grade]);
  const selected = pool.slice(0, state.pairCount);

  const pairs = [];
  selected.forEach((item, i) => {
    pairs.push({
      id:      `k-${i}`,
      pairId:  i,
      type:    "kanji",
      kanji:   item.kanji,
      reading: item.reading,
      matched: false,
      flipped: false,
    });
    pairs.push({
      id:      `r-${i}`,
      pairId:  i,
      type:    "reading",
      kanji:   item.kanji,
      reading: item.reading,
      matched: false,
      flipped: false,
    });
  });

  return shuffle(pairs);
}

// ========== レンダリング ==========
function getGridCols(total) {
  if (total <= 12)  return 4;
  if (total <= 16)  return 4;
  if (total <= 20)  return 5;
  return 6;
}

function renderBoard() {
  const board = dom.board();
  const total = state.cards.length;
  const cols = getGridCols(total);
  board.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  board.innerHTML = "";

  state.cards.forEach((card) => {
    const el = document.createElement("div");
    el.className = "card";
    el.dataset.id = card.id;

    if (card.flipped || card.matched) el.classList.add("flipped");
    if (card.matched) el.classList.add("matched");

    el.innerHTML = `
      <div class="card-inner">
        <div class="card-front">
          <span class="card-icon">🀄</span>
        </div>
        <div class="card-back ${card.type}">
          <span class="card-face-text">${card.type === "kanji" ? card.kanji : card.reading}</span>
          <span class="card-face-sub">${card.type === "kanji" ? "漢字" : "よみ"}</span>
        </div>
      </div>
    `;

    el.addEventListener("click", () => onCardClick(card.id));
    board.appendChild(el);
  });
}

function updateCard(cardId) {
  const card = state.cards.find(c => c.id === cardId);
  const el = document.querySelector(`[data-id="${cardId}"]`);
  if (!el || !card) return;

  if (card.flipped || card.matched) el.classList.add("flipped");
  else el.classList.remove("flipped");

  if (card.matched) el.classList.add("matched");
}

function updateStatus() {
  dom.flipCount().textContent  = state.flipCount;
  dom.matchCount().textContent = `${state.matchCount} / ${state.pairCount}`;
}

// ========== ゲームロジック ==========
function onCardClick(cardId) {
  if (state.isLocked) return;
  if (!state.gameStarted) return;

  const card = state.cards.find(c => c.id === cardId);
  if (!card || card.matched || card.flipped) return;
  if (state.flippedCards.length >= 2) return;

  // フリップ
  card.flipped = true;
  updateCard(cardId);

  state.flippedCards.push(card);
  state.flipCount++;
  updateStatus();

  if (state.flippedCards.length === 2) {
    state.isLocked = true;
    checkMatch();
  }
}

function checkMatch() {
  const [a, b] = state.flippedCards;
  const isMatch = a.pairId === b.pairId && a.type !== b.type;

  setTimeout(() => {
    if (isMatch) {
      a.matched = true;
      b.matched = true;
      updateCard(a.id);
      updateCard(b.id);
      showMatchEffect(a.id, b.id);
      state.matchCount++;
      updateStatus();

      if (state.matchCount === state.pairCount) {
        setTimeout(showClear, 600);
      }
    } else {
      a.flipped = false;
      b.flipped = false;
      updateCard(a.id);
      updateCard(b.id);
      showMissEffect(a.id, b.id);
    }

    state.flippedCards = [];
    state.isLocked = false;
  }, 900);
}

function showMatchEffect(idA, idB) {
  [idA, idB].forEach(id => {
    const el = document.querySelector(`[data-id="${id}"]`);
    if (el) {
      el.classList.add("pop");
      setTimeout(() => el.classList.remove("pop"), 600);
    }
  });
}

function showMissEffect(idA, idB) {
  [idA, idB].forEach(id => {
    const el = document.querySelector(`[data-id="${id}"]`);
    if (el) {
      el.classList.add("shake");
      setTimeout(() => el.classList.remove("shake"), 500);
    }
  });
}

// ========== クリア ==========
function calcRating() {
  const ideal = state.pairCount;          // 完璧ならペア数と同じ回数
  const ratio = ideal / state.flipCount;  // 1.0 = 完璧
  if (ratio >= 0.85) return { stars: 3, label: "⭐⭐⭐ かんぺき！" };
  if (ratio >= 0.6)  return { stars: 2, label: "⭐⭐ すごい！" };
  return                      { stars: 1, label: "⭐ よくがんばった！" };
}

function showClear() {
  stopTimer();
  const { stars, label } = calcRating();

  dom.finalFlips().textContent  = `${state.flipCount} 回`;
  dom.finalTime().textContent   = formatTime(state.elapsedSeconds);
  dom.finalRating().textContent = label;

  const starEl = dom.clearStars();
  starEl.innerHTML = "";
  for (let i = 0; i < stars; i++) {
    const s = document.createElement("span");
    s.className = "star";
    s.textContent = "⭐";
    s.style.animationDelay = `${i * 0.2}s`;
    starEl.appendChild(s);
  }

  dom.clearOverlay().style.display = "flex";
}

// ========== ゲーム開始・リセット ==========
function startGame() {
  state.grade     = parseInt(dom.gradeSelect().value);
  state.pairCount = parseInt(dom.pairSelect().value);
  state.cards     = buildCards();
  state.flippedCards = [];
  state.matchCount   = 0;
  state.flipCount    = 0;
  state.isLocked     = false;
  state.gameStarted  = true;

  dom.startScreen().style.display  = "none";
  dom.clearOverlay().style.display = "none";
  dom.statusBar().style.display    = "flex";

  updateStatus();
  renderBoard();
  startTimer();
}

function resetGame() {
  stopTimer();
  startGame();
}

// ========== イベント ==========
document.getElementById("btnStart").addEventListener("click", startGame);
document.getElementById("btnStartBig").addEventListener("click", startGame);
document.getElementById("btnReset").addEventListener("click", resetGame);
document.getElementById("btnAgain").addEventListener("click", resetGame);
document.getElementById("btnChange").addEventListener("click", () => {
  dom.clearOverlay().style.display = "none";
  dom.startScreen().style.display  = "flex";
  stopTimer();
  state.gameStarted = false;
});
