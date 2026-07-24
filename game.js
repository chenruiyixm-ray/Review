// ====== STORAGE ======
const STORAGE_KEY = 'wenyan_matching_game_v1';

function loadProgress() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) return JSON.parse(data);
  } catch(e) {}
  return { completed: [], currentLevel: 1, stats: {} };
}

function saveProgress(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch(e) {}
}

let progress = loadProgress();

// ====== STATE ======
let currentLevel = null;
let currentLevelData = null;
let leftItems = [];
let rightItems = [];
let selectedLeft = null;
let selectedRight = null;
let matchedCount = 0;
let wrongCount = 0;
let totalPairs = 0;
let isProcessing = false;

// ====== RENDER ======
const app = document.getElementById('app');
const toast = document.getElementById('toast');
const modal = document.getElementById('modal');

function showToast(msg, type = 'success') {
  toast.textContent = msg;
  toast.className = `toast show ${type}`;
  setTimeout(() => { toast.classList.remove('show'); }, 1800);
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function highlightChar(sentence, chars) {
  const charList = chars.split('、').map(c => c.trim()).filter(c => c);
  let result = escapeHtml(sentence);
  for (const ch of charList) {
    const idx = result.indexOf(ch);
    if (idx >= 0) {
      result = result.substring(0, idx) +
        `<span class="highlight">${ch}</span>` +
        result.substring(idx + ch.length);
    }
  }
  return result;
}

// ====== Screen: Start ======
function renderStartScreen() {
  const completedCount = progress.completed.length;
  const pct = Math.round(completedCount / GAME_DATA.length * 100);

  let html = `
    <div class="header">
      <h1>📜 文言实词配对大挑战</h1>
      <p>300个高中必背文言实词 · ${GAME_DATA.length}关逐层突破</p>
    </div>
    <div class="start-screen fade-in">
      <div class="big-icon">🎓</div>
      <h2>准备好了吗？</h2>
      <p>每一关会给出若干文言例句和加点字，你需要将左侧的句子与右侧的正确词义配对。打乱顺序，考验真功夫！</p>
      <p style="color:var(--accent);font-size:13px;margin-bottom:16px;">🔓 所有关卡已解锁，无需按顺序挑战</p>
      <div class="progress-section" style="max-width:400px;margin:0 auto 20px;">
        <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
        <div class="progress-text"><span>已通关 ${completedCount}/${GAME_DATA.length}</span><span>${pct}%</span></div>
      </div>
      <button class="start-btn" onclick="startGame()">开始挑战 🚀</button>
      <div>
        <button class="reset-btn" onclick="resetAll()">🔄 重置全部进度</button>
      </div>
    </div>
  `;
  app.innerHTML = html;
}

// ====== Screen: Level Select (ALL LEVELS UNLOCKED) ======
function renderLevelSelect() {
  const completedCount = progress.completed.length;
  const pct = Math.round(completedCount / GAME_DATA.length * 100);

  let html = `
    <div class="header">
      <h1>📜 选择关卡</h1>
      <p>共 ${GAME_DATA.length} 关 · 已通关 ${completedCount} 关 · 🔓 全部解锁</p>
    </div>
    <div class="progress-section">
      <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
      <div class="progress-text"><span>总进度</span><span>${pct}%</span></div>
    </div>
    <div class="level-grid fade-in">
  `;

  for (const lv of GAME_DATA) {
    const isCompleted = progress.completed.includes(lv.level);
    const isLocked = false; // 🔓 ALL LEVELS UNLOCKED
    let cls = 'level-btn';
    if (isCompleted) cls += ' completed';
    if (isLocked) cls += ' locked';

    html += `<button class="${cls}" onclick="enterLevel(${lv.level})">${lv.level}</button>`;
  }

  html += `</div><div style="text-align:center;margin-top:24px;"><button class="reset-btn" onclick="resetAll()">🔄 重置进度</button></div>`;
  app.innerHTML = html;
}

// ====== Enter Level ======
function enterLevel(levelNum) {
  const lv = GAME_DATA.find(d => d.level === levelNum);
  if (!lv) return;
  currentLevel = levelNum;
  currentLevelData = lv;

  totalPairs = lv.sentences.length;
  leftItems = [];
  rightItems = [];

  lv.sentences.forEach((item, idx) => {
    const [sentence, meaning] = item;
    const leftId = `L${idx}`;
    const rightId = `R${idx}`;
    leftItems.push({
      id: leftId,
      text: sentence,
      answerId: rightId,
      matched: false
    });
    rightItems.push({
      id: rightId,
      text: meaning,
      matchId: leftId,
      matched: false
    });
  });

  leftItems = shuffle(leftItems);
  rightItems = shuffle(rightItems);

  selectedLeft = null;
  selectedRight = null;
  matchedCount = 0;
  wrongCount = 0;
  isProcessing = false;

  renderGameScreen();
}

// ====== Screen: Game ======
function renderGameScreen() {
  const lv = currentLevelData;
  const remaining = totalPairs - matchedCount;

  let html = `
    <div class="game-screen" style="display:block;">
      <div class="game-header">
        <div class="game-header-left">
          <button class="back-btn" onclick="renderLevelSelect()" title="返回选关">←</button>
          <div>
            <div class="level-title">第 ${lv.level} 关</div>
            <div class="level-chars">实词：${lv.character}</div>
          </div>
        </div>
        <div class="game-stats">
          <div class="stat-item">剩余 <span class="stat-value">${remaining}</span></div>
          <div class="stat-item">错误 <span class="stat-value wrong">${wrongCount}</span></div>
        </div>
      </div>

      <div class="match-container">
        <div>
          <div class="match-column-title">📖 例句（点击选择）</div>
          <div class="match-list" id="leftList">
            ${leftItems.map(item => `
              <div class="match-item ${item.matched ? 'matched' : ''} ${selectedLeft === item.id ? 'selected' : ''}"
                   data-id="${item.id}" data-side="left"
                   onclick="selectItem('${item.id}','left')">
                <div class="sentence">${highlightChar(item.text, lv.character)}</div>
              </div>
            `).join('')}
          </div>
        </div>
        <div class="match-arrow">⇄</div>
        <div>
          <div class="match-column-title">📝 词义（点击配对）</div>
          <div class="match-list" id="rightList">
            ${rightItems.map(item => `
              <div class="match-item ${item.matched ? 'matched' : ''} ${selectedRight === item.id ? 'selected' : ''}"
                   data-id="${item.id}" data-side="right"
                   onclick="selectItem('${item.id}','right')">
                <div>${escapeHtml(item.text)}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  `;

  app.innerHTML = html;
}

// ====== Item Selection ======
function selectItem(id, side) {
  if (isProcessing) return;

  if (side === 'left') {
    const item = leftItems.find(i => i.id === id);
    if (!item || item.matched) return;

    // If clicking the already selected item, deselect it
    if (selectedLeft === id) {
      selectedLeft = null;
      renderGameScreen();
      return;
    }

    selectedLeft = id;
  } else {
    const item = rightItems.find(i => i.id === id);
    if (!item || item.matched) return;

    // If clicking the already selected item, deselect it
    if (selectedRight === id) {
      selectedRight = null;
      renderGameScreen();
      return;
    }

    selectedRight = id;
  }

  renderGameScreen();

  if (selectedLeft && selectedRight) {
    checkMatch();
  }
}

// ====== Match Check ======
function checkMatch() {
  isProcessing = true;
  const left = leftItems.find(i => i.id === selectedLeft);
  const right = rightItems.find(i => i.id === selectedRight);

  if (left.answerId === right.id) {
    left.matched = true;
    right.matched = true;
    matchedCount++;
    showToast('✓ 配对正确！', 'success');

    if (!progress.stats[currentLevel]) progress.stats[currentLevel] = { correct: 0, wrong: 0 };
    progress.stats[currentLevel].correct++;

    selectedLeft = null;
    selectedRight = null;
    isProcessing = false;

    if (matchedCount === totalPairs) {
      setTimeout(() => completeLevel(), 600);
    } else {
      renderGameScreen();
    }
  } else {
    wrongCount++;
    if (!progress.stats[currentLevel]) progress.stats[currentLevel] = { correct: 0, wrong: 0 };
    progress.stats[currentLevel].wrong++;

    showToast('✗ 再想想看', 'error');

    const leftEl = document.querySelector(`.match-item[data-id="${left.id}"]`);
    const rightEl = document.querySelector(`.match-item[data-id="${right.id}"]`);
    if (leftEl) leftEl.classList.add('wrong');
    if (rightEl) rightEl.classList.add('wrong');

    setTimeout(() => {
      if (leftEl) leftEl.classList.remove('wrong', 'selected');
      if (rightEl) rightEl.classList.remove('wrong', 'selected');
      selectedLeft = null;
      selectedRight = null;
      isProcessing = false;
      renderGameScreen();
    }, 600);
  }

  saveProgress(progress);
}

// ====== Level Complete ======
function completeLevel() {
  if (!progress.completed.includes(currentLevel)) {
    progress.completed.push(currentLevel);
  }
  saveProgress(progress);

  let stars = 3;
  if (wrongCount >= Math.ceil(totalPairs * 0.3)) stars = 2;
  if (wrongCount >= Math.ceil(totalPairs * 0.5)) stars = 1;

  const starStr = '⭐'.repeat(stars) + '☆'.repeat(3 - stars);
  const isLast = currentLevel === GAME_DATA.length;

  document.getElementById('modalIcon').textContent = isLast ? '🏆' : '🎉';
  document.getElementById('modalTitle').textContent = isLast ? '全部通关！' : `第 ${currentLevel} 关完成！`;
  document.getElementById('modalStars').textContent = starStr;
  document.getElementById('modalDesc').textContent = isLast
    ? `恭喜你完成了全部 ${GAME_DATA.length} 关！错误 ${wrongCount} 次。`
    : `错误 ${wrongCount} 次 · 共 ${totalPairs} 对全部配对成功！`;
  document.getElementById('modalBtn1').textContent = isLast ? '回到首页' : '下一关 ▶';
  document.getElementById('modalBtn1').onclick = () => {
    closeModal();
    if (isLast) {
      renderStartScreen();
    } else {
      enterLevel(currentLevel + 1);
    }
  };
  document.getElementById('modalBtn2').textContent = '返回选关';
  document.getElementById('modalBtn2').onclick = () => {
    closeModal();
    renderLevelSelect();
  };

  showModal();

  if (stars >= 2) spawnConfetti();
}

// ====== Modal ======
function showModal() { modal.classList.add('show'); }
function closeModal() { modal.classList.remove('show'); }

// ====== Confetti ======
function spawnConfetti() {
  const colors = ['#6c5ce7','#00b894','#fdcb6e','#e74c3c','#0984e3','#e84393'];
  for (let i = 0; i < 40; i++) {
    const el = document.createElement('div');
    el.className = 'confetti';
    el.style.left = Math.random() * 100 + 'vw';
    el.style.background = colors[Math.floor(Math.random() * colors.length)];
    el.style.width = (Math.random() * 8 + 5) + 'px';
    el.style.height = (Math.random() * 8 + 5) + 'px';
    el.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    el.style.animationDuration = (Math.random() * 2 + 2) + 's';
    el.style.animationDelay = (Math.random() * 1.5) + 's';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 5000);
  }
}

// ====== Start / Reset ======
function startGame() {
  const maxCompleted = progress.completed.length > 0 ? Math.max(...progress.completed) : 0;
  const target = Math.min(maxCompleted + 1, GAME_DATA.length);
  enterLevel(target);
}

function resetAll() {
  if (confirm('确定要重置全部进度吗？所有通关记录和统计数据将被清除。')) {
    progress = { completed: [], currentLevel: 1, stats: {} };
    saveProgress(progress);
    renderStartScreen();
    showToast('进度已重置', 'success');
  }
}

// ====== INIT ======
renderStartScreen();

// Keyboard support
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (modal.classList.contains('show')) {
      closeModal();
    } else if (currentLevel !== null) {
      renderLevelSelect();
    }
  }
});
