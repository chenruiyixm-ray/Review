// ====== Game Engine ======
// All game state, rendering, match logic, and level flow.
// Depends on: game-data.js (GAME_DATA), user-manager.js (UserManager)

const GameEngine = (function () {
  // ---------- state ----------
  let currentUser = null;       // string: username
  let progress = { completed: [], stats: {}, stars: {} };
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

  // ---------- DOM refs (set in init) ----------
  let app, toast, modal;

  // ---------- helpers ----------
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
          '<span class="highlight">' + ch + '</span>' +
          result.substring(idx + ch.length);
      }
    }
    return result;
  }

  function showToast(msg, type) {
    toast.textContent = msg;
    toast.className = 'toast show ' + (type || 'success');
    setTimeout(() => { toast.classList.remove('show'); }, 1800);
  }

  function $(sel, root) { return (root || document).querySelector(sel); }

  // ---------- progress sync ----------
  function saveProgress() {
    if (currentUser) {
      UserManager.saveProgress(currentUser, progress);
    }
  }

  function loadProgressFor(user) {
    const p = UserManager.getProgress(user);
    progress = { completed: p.completed || [], stats: p.stats || {}, stars: p.stars || {} };
  }

  // ---------- confetti ----------
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

  // ---------- screens ----------
  function renderLogin() {
    const users = UserManager.listUsers();
    let userChips = '';
    if (users.length) {
      userChips = '<div class="user-chip-list">' +
        users.slice(0, 8).map(u =>
          '<div class="user-chip" onclick="GameUI.quickLogin(\'' + u.name.replace(/'/g, "\\'") + '\')">' +
          '👤 ' + u.name + ' <span class="chip-progress">(' + u.completed + '/' + GAME_DATA.length + ')</span></div>'
        ).join('') + '</div>';
    }

    app.innerHTML = `
      <div class="header">
        <h1>📜 文言实词配对大挑战</h1>
        <p>300个高中必背文言实词 · 65关逐层突破</p>
      </div>
      <div class="login-screen fade-in">
        <div class="login-card">
          <div class="login-icon">🎓</div>
          <h2>欢迎回来！</h2>
          <p class="login-subtitle">输入用户名开始游戏<br>无需密码 · 多账号进度独立保存</p>
          <div class="login-input-group">
            <input class="login-input" id="loginInput" placeholder="请输入用户名" maxlength="20" autofocus>
            <button class="login-btn" onclick="GameUI.doLogin()">登录</button>
          </div>
          <div class="login-hint">按 Enter 快速登录 · 新用户会自动创建</div>
          ${userChips}
          <div class="login-footer">
            <button onclick="GameUI.exportData()">💾 导出 userdata</button>
            <button onclick="GameUI.importData()">📂 导入 userdata</button>
          </div>
        </div>
      </div>
      <input type="file" id="fileInput" class="file-input-hidden" accept=".txt,text/plain,*">
    `;

    const input = $('#loginInput');
    input.focus();
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') GameUI.doLogin();
    });
  }

  function renderStart(user) {
    const completedCount = progress.completed.length;
    const pct = Math.round(completedCount / GAME_DATA.length * 100);

    app.innerHTML = `
      <div class="header">
        <h1>📜 文言实词配对大挑战</h1>
        <p>300个高中必背文言实词 · 65关逐层突破</p>
      </div>
      <div class="user-bar fade-in">
        <div class="user-bar-left">
          <div class="user-avatar">👤</div>
          <div>
            <div class="user-name">${escapeHtml(user)}</div>
            <div class="user-level">已通关 ${completedCount}/${GAME_DATA.length}</div>
          </div>
        </div>
        <div class="user-bar-right">
          <button class="user-bar-btn" onclick="GameUI.exportData()">💾 导出</button>
          <button class="user-bar-btn" onclick="GameUI.importData()">📂 导入</button>
          <button class="user-bar-btn danger" onclick="GameUI.logout()">🚪 退出</button>
        </div>
      </div>
      <div class="start-screen fade-in">
        <div class="big-icon">🎓</div>
        <h2>准备好了吗，${escapeHtml(user)}？</h2>
        <p>每一关会给出若干文言例句和加点字，你需要将左侧的句子与右侧的正确词义配对。打乱顺序，考验真功夫！</p>
        <div class="progress-section" style="max-width:400px;margin:0 auto 20px;">
          <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
          <div class="progress-text"><span>已通关 ${completedCount}/${GAME_DATA.length}</span><span>${pct}%</span></div>
        </div>
        <button class="start-btn" onclick="GameUI.startGame()">开始挑战 🚀</button>
        <div>
          <button class="reset-btn" onclick="GameUI.resetAll()">🔄 重置全部进度</button>
        </div>
      </div>
    `;
  }

  function renderLevelSelect() {
    const completedCount = progress.completed.length;
    const pct = Math.round(completedCount / GAME_DATA.length * 100);
    const maxUnlocked = progress.completed.length > 0 ? Math.max(...progress.completed) : 0;
    const nextLevel = maxUnlocked + 1;

    let html = `
      <div class="header">
        <h1>📜 选择关卡</h1>
        <p>共 ${GAME_DATA.length} 关 · 已通关 ${completedCount} 关 · 当前用户：${escapeHtml(currentUser)}</p>
      </div>
      <div class="user-bar">
        <div class="user-bar-left">
          <div class="user-avatar">👤</div>
          <div>
            <div class="user-name">${escapeHtml(currentUser)}</div>
            <div class="user-level">通关 ${completedCount}/${GAME_DATA.length}</div>
          </div>
        </div>
        <div class="user-bar-right">
          <button class="user-bar-btn" onclick="GameUI.exportData()">💾 导出</button>
          <button class="user-bar-btn" onclick="GameUI.importData()">📂 导入</button>
          <button class="user-bar-btn danger" onclick="GameUI.logout()">🚪 退出</button>
        </div>
      </div>
      <div class="progress-section">
        <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
        <div class="progress-text"><span>总进度</span><span>${pct}%</span></div>
      </div>
      <div class="level-grid fade-in">
    `;

    for (const lv of GAME_DATA) {
      const isCompleted = progress.completed.includes(lv.level);
      const isLocked = lv.level > nextLevel;
      const isCurrent = lv.level === nextLevel;
      let cls = 'level-btn';
      if (isCompleted) cls += ' completed';
      if (isLocked) cls += ' locked';
      if (isCurrent) cls += ' current';

      html += `<button class="${cls}" onclick="GameUI.enterLevel(${lv.level})" ${isLocked ? 'disabled' : ''}>${lv.level}</button>`;
    }

    html += `</div><div style="text-align:center;margin-top:24px;"><button class="reset-btn" onclick="GameUI.resetAll()">🔄 重置进度</button></div>`;
    app.innerHTML = html;
  }

  // ---------- game screen ----------
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
      const leftId = 'L' + idx;
      const rightId = 'R' + idx;
      leftItems.push({ id: leftId, text: sentence, answerId: rightId, matched: false });
      rightItems.push({ id: rightId, text: meaning, matchId: leftId, matched: false });
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

  function renderGameScreen() {
    const lv = currentLevelData;
    const remaining = totalPairs - matchedCount;

    let html = `
      <div class="game-screen" style="display:block;">
        <div class="game-header">
          <div class="game-header-left">
            <button class="back-btn" onclick="GameUI.goLevelSelect()" title="返回选关">←</button>
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
            <div class="match-list">
              ${leftItems.map(item => `
                <div class="match-item ${item.matched ? 'matched' : ''} ${selectedLeft === item.id ? 'selected' : ''}"
                     onclick="GameUI.selectItem('${item.id}','left')">
                  <div class="sentence">${highlightChar(item.text, lv.character)}</div>
                </div>
              `).join('')}
            </div>
          </div>
          <div class="match-arrow">⇄</div>
          <div>
            <div class="match-column-title">📝 词义（点击配对）</div>
            <div class="match-list">
              ${rightItems.map(item => `
                <div class="match-item ${item.matched ? 'matched' : ''} ${selectedRight === item.id ? 'selected' : ''}"
                     onclick="GameUI.selectItem('${item.id}','right')">
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

  // ---------- match logic ----------
  function selectItem(id, side) {
    if (isProcessing) return;

    if (side === 'left') {
      const item = leftItems.find(i => i.id === id);
      if (!item || item.matched) return;
      selectedLeft = id;
    } else {
      const item = rightItems.find(i => i.id === id);
      if (!item || item.matched) return;
      selectedRight = id;
    }

    renderGameScreen();

    if (selectedLeft && selectedRight) checkMatch();
  }

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
      saveProgress();

      selectedLeft = null;
      selectedRight = null;
      isProcessing = false;

      if (matchedCount === totalPairs) {
        setTimeout(() => completeLevel(), 500);
      } else {
        renderGameScreen();
      }
    } else {
      wrongCount++;
      if (!progress.stats[currentLevel]) progress.stats[currentLevel] = { correct: 0, wrong: 0 };
      progress.stats[currentLevel].wrong++;
      saveProgress();

      showToast('✗ 再想想看', 'error');

      const leftEl = app.querySelector(`.match-item[onclick*="'${left.id}'"]`);
      const rightEl = app.querySelector(`.match-item[onclick*="'${right.id}'"]`);
      if (leftEl) leftEl.classList.add('wrong');
      if (rightEl) rightEl.classList.add('wrong');

      setTimeout(() => {
        if (leftEl) leftEl.classList.remove('wrong', 'selected');
        if (rightEl) rightEl.classList.remove('wrong', 'selected');
        selectedLeft = null;
        selectedRight = null;
        isProcessing = false;
        renderGameScreen();
      }, 500);
    }
  }

  function completeLevel() {
    if (!progress.completed.includes(currentLevel)) {
      progress.completed.push(currentLevel);
    }
    let stars = 3;
    if (wrongCount >= Math.ceil(totalPairs * 0.3)) stars = 2;
    if (wrongCount >= Math.ceil(totalPairs * 0.5)) stars = 1;
    progress.stars[currentLevel] = stars;
    saveProgress();

    const starStr = '⭐'.repeat(stars) + '☆'.repeat(3 - stars);
    const isLast = currentLevel === GAME_DATA.length;

    $('#modalIcon').textContent = isLast ? '🏆' : '🎉';
    $('#modalTitle').textContent = isLast ? '全部通关！' : `第 ${currentLevel} 关完成！`;
    $('#modalStars').textContent = starStr;
    $('#modalDesc').textContent = isLast
      ? `恭喜你完成了全部 ${GAME_DATA.length} 关！错误 ${wrongCount} 次。`
      : `错误 ${wrongCount} 次 · 共 ${totalPairs} 对全部配对成功！`;
    $('#modalBtn1').textContent = isLast ? '回到首页' : '下一关 ▶';
    $('#modalBtn1').onclick = () => {
      closeModal();
      if (isLast) renderLevelSelect();
      else enterLevel(currentLevel + 1);
    };
    $('#modalBtn2').textContent = '返回选关';
    $('#modalBtn2').onclick = () => { closeModal(); renderLevelSelect(); };

    modal.classList.add('show');
    if (stars >= 2) spawnConfetti();
  }

  function closeModal() { modal.classList.remove('show'); }

  // ---------- public actions (called from UI) ----------
  function doLogin(name) {
    const result = UserManager.login(name);
    if (!result.ok) { showToast(result.msg, 'error'); return false; }
    currentUser = name;
    loadProgressFor(name);
    renderStart(name);
    return true;
  }

  function logout() {
    currentUser = null;
    progress = { completed: [], stats: {}, stars: {} };
    UserManager.logout();
    renderLogin();
  }

  function startGame() {
    const maxCompleted = progress.completed.length > 0 ? Math.max(...progress.completed) : 0;
    const target = Math.min(maxCompleted + 1, GAME_DATA.length);
    enterLevel(target);
  }

  function resetAll() {
    if (confirm('确定要重置当前账号的全部进度吗？')) {
      UserManager.clearProgress(currentUser);
      progress = { completed: [], stats: {}, stars: {} };
      renderStart(currentUser);
      showToast('进度已重置', 'success');
    }
  }

  function exportData() {
    const text = UserManager.exportText();
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'userdata';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('userdata 已导出', 'success');
  }

  function importData() {
    const input = $('#fileInput') || document.createElement('input');
    input.type = 'file';
    input.id = 'fileInput';
    input.className = 'file-input-hidden';
    input.accept = '.txt,text/plain,*';
    document.body.appendChild(input);
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        UserManager.importText(ev.target.result);
        // reload current user progress
        if (currentUser) loadProgressFor(currentUser);
        showToast('userdata 已导入', 'success');
        // re-render current screen
        if (currentUser) renderLevelSelect();
      };
      reader.readAsText(file);
    };
    input.click();
  }

  // ---------- init ----------
  function init() {
    app = document.getElementById('app');
    toast = document.getElementById('toast');
    modal = document.getElementById('modal');
    // wire modal close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (modal.classList.contains('show')) closeModal();
        else if (currentLevel !== null) renderLevelSelect();
      }
    });

    const saved = UserManager.getCurrentUser();
    if (saved && UserManager.getProfile(saved)) {
      currentUser = saved;
      loadProgressFor(saved);
      renderLevelSelect();
    } else {
      renderLogin();
    }
  }

  // public API
  return {
    init,
    // actions
    doLogin, logout, startGame, resetAll,
    enterLevel, selectItem,
    goLevelSelect: renderLevelSelect,
    quickLogin: doLogin,
    exportData, importData
  };
})();
