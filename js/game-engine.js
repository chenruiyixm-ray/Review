/**
 * game-engine.js
 * 文言实词配对游戏引擎
 * 依赖: game-data.js (GAME_DATA), user-manager.js (UserManager)
 */

(function (global) {
  'use strict';

  // ===== DOM 引用 =====

  const loginScreen = document.getElementById('loginScreen');
  const app = document.getElementById('app');
  const usernameInput = document.getElementById('usernameInput');
  const loginBtn = document.getElementById('loginBtn');
  const loginError = document.getElementById('loginError');
  const quickUsersEl = document.getElementById('quickUsers');

  const toast = document.getElementById('toast');
  const modal = document.getElementById('modal');
  const modalIcon = document.getElementById('modalIcon');
  const modalTitle = document.getElementById('modalTitle');
  const modalStars = document.getElementById('modalStars');
  const modalDesc = document.getElementById('modalDesc');
  const modalBtn1 = document.getElementById('modalBtn1');
  const modalBtn2 = document.getElementById('modalBtn2');

  // ===== 游戏状态 =====

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

  // ===== 工具函数 =====

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
    const charList = (chars || '').split('、').map(c => c.trim()).filter(c => c);
    let result = escapeHtml(sentence);
    for (const ch of charList) {
      const idx = result.indexOf(ch);
      if (idx >= 0) {
        result = result.substring(0, idx)
          + '<span class="highlight">' + ch + '</span>'
          + result.substring(idx + ch.length);
      }
    }
    return result;
  }

  function showToast(msg, type) {
    toast.textContent = msg;
    toast.className = 'toast show ' + (type || 'success');
    setTimeout(function () { toast.classList.remove('show'); }, 1800);
  }

  // ===== 登录流程 =====

  function attemptLogin(name) {
    const result = UserManager.login(name);
    if (!result.success) {
      loginError.textContent = result.message;
      return;
    }
    loginError.textContent = '';
    showApp();
  }

  function showLogin() {
    loginScreen.classList.remove('hidden');
    app.classList.add('hidden');
    app.innerHTML = '';
    usernameInput.value = '';
    usernameInput.focus();
    renderQuickUsers();
  }

  function renderQuickUsers() {
    const recent = UserManager.getRecentUsers();
    if (recent.length === 0) {
      quickUsersEl.innerHTML = '';
      return;
    }
    quickUsersEl.innerHTML = recent.map(function (name) {
      return '<span class="quick-user" data-name="' + escapeHtml(name) + '">' + escapeHtml(name) + '</span>';
    }).join('');
    // 事件委托
    quickUsersEl.querySelectorAll('.quick-user').forEach(function (el) {
      el.addEventListener('click', function () {
        attemptLogin(el.getAttribute('data-name'));
      });
    });
  }

  function showApp() {
    loginScreen.classList.add('hidden');
    app.classList.remove('hidden');
    renderStartScreen();
  }

  // ===== 登录页事件绑定 =====

  loginBtn.addEventListener('click', function () {
    attemptLogin(usernameInput.value);
  });

  usernameInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      attemptLogin(usernameInput.value);
    }
  });

  usernameInput.addEventListener('input', function () {
    if (loginError.textContent) loginError.textContent = '';
  });

  // ===== 开始页 =====

  function renderStartScreen() {
    const progress = UserManager.getProgress();
    const completedCount = (progress.completed || []).length;
    const pct = Math.round(completedCount / GAME_DATA.length * 100);
    const username = UserManager.getCurrentUser() || '';

    app.innerHTML = `
      <div class="header">
        <h1>📜 文言实词配对大挑战</h1>
        <p>300个高中必背文言实词 · 65关逐层突破</p>
      </div>
      <div class="user-bar" style="justify-content:center;margin-bottom:16px;">
        <span class="username-tag">👤 ${escapeHtml(username)}</span>
        <button class="logout-btn" id="logoutBtn" title="退出登录">🚪</button>
      </div>
      <div class="start-screen fade-in">
        <div class="big-icon">🎓</div>
        <h2>准备好了吗？</h2>
        <p>每一关会给出若干文言例句和加点字，你需要将左侧的句子与右侧的正确词义配对。打乱顺序，考验真功夫！</p>
        <div class="progress-section" style="max-width:400px;margin:0 auto 20px;">
          <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
          <div class="progress-text"><span>已通关 ${completedCount}/${GAME_DATA.length}</span><span>${pct}%</span></div>
        </div>
        <button class="start-btn" id="startBtn">开始挑战 🚀</button>
        <div><button class="reset-btn" id="resetBtn">🔄 重置我的进度</button></div>
      </div>
    `;

    document.getElementById('startBtn').addEventListener('click', startGame);
    document.getElementById('resetBtn').addEventListener('click', function () {
      if (confirm('确定要重置当前账号的全部进度吗？所有通关记录和统计数据将被清除。')) {
        UserManager.resetCurrentUserProgress();
        renderStartScreen();
        showToast('进度已重置', 'success');
      }
    });
    document.getElementById('logoutBtn').addEventListener('click', function () {
      UserManager.logout();
      showLogin();
    });
  }

  // ===== 选关页 =====

  function renderLevelSelect() {
    const progress = UserManager.getProgress();
    const completed = progress.completed || [];
    const completedCount = completed.length;
    const pct = Math.round(completedCount / GAME_DATA.length * 100);
    const maxUnlocked = completed.length > 0 ? Math.max.apply(null, completed) : 0;
    const nextLevel = maxUnlocked + 1;
    const username = UserManager.getCurrentUser() || '';

    let html = `
      <div class="header">
        <h1>📜 选择关卡</h1>
        <p>共 ${GAME_DATA.length} 关 · 已通关 ${completedCount} 关</p>
      </div>
      <div class="user-bar" style="justify-content:center;margin-bottom:12px;">
        <span class="username-tag">👤 ${escapeHtml(username)}</span>
        <button class="logout-btn" id="logoutBtn2" title="退出登录">🚪</button>
      </div>
      <div class="progress-section">
        <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
        <div class="progress-text"><span>总进度</span><span>${pct}%</span></div>
      </div>
      <div class="level-grid fade-in">
    `;

    for (const lv of GAME_DATA) {
      const isCompleted = completed.indexOf(lv.level) !== -1;
      const isLocked = lv.level > nextLevel;
      const isCurrent = lv.level === nextLevel;
      let cls = 'level-btn';
      if (isCompleted) cls += ' completed';
      if (isLocked) cls += ' locked';
      if (isCurrent) cls += ' current';
      html += `<button class="${cls}" data-level="${lv.level}" ${isLocked ? 'disabled' : ''}>${lv.level}</button>`;
    }

    html += `</div><div style="text-align:center;margin-top:24px;"><button class="reset-btn" id="resetBtn2">🔄 重置我的进度</button></div>`;
    app.innerHTML = html;

    app.querySelectorAll('.level-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.disabled) return;
        enterLevel(parseInt(btn.getAttribute('data-level'), 10));
      });
    });

    document.getElementById('resetBtn2').addEventListener('click', function () {
      if (confirm('确定要重置当前账号的全部进度吗？')) {
        UserManager.resetCurrentUserProgress();
        renderLevelSelect();
        showToast('进度已重置', 'success');
      }
    });
    document.getElementById('logoutBtn2').addEventListener('click', function () {
      UserManager.logout();
      showLogin();
    });
  }

  // ===== 进入关卡 =====

  function enterLevel(levelNum) {
    const lv = GAME_DATA.find(function (d) { return d.level === levelNum; });
    if (!lv) return;
    currentLevel = levelNum;
    currentLevelData = lv;
    totalPairs = lv.sentences.length;

    leftItems = [];
    rightItems = [];
    lv.sentences.forEach(function (item, idx) {
      const leftId = 'L' + idx;
      const rightId = 'R' + idx;
      leftItems.push({ id: leftId, text: item[0], answerId: rightId, matched: false });
      rightItems.push({ id: rightId, text: item[1], matchId: leftId, matched: false });
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

  // ===== 游戏页渲染 =====

  function renderGameScreen() {
    const lv = currentLevelData;
    const remaining = totalPairs - matchedCount;
    const username = UserManager.getCurrentUser() || '';

    let html = `
      <div class="game-screen" style="display:block;">
        <div class="game-header">
          <div class="game-header-left">
            <button class="back-btn" id="backBtn" title="返回选关">←</button>
            <div>
              <div class="level-title">第 ${lv.level} 关</div>
              <div class="level-chars">实词：${escapeHtml(lv.character)}</div>
            </div>
          </div>
          <div class="user-bar">
            <span class="username-tag">👤 ${escapeHtml(username)}</span>
            <button class="logout-btn" id="logoutBtn3" title="退出登录">🚪</button>
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
    `;

    leftItems.forEach(function (item) {
      let cls = 'match-item';
      if (item.matched) cls += ' matched';
      if (selectedLeft === item.id) cls += ' selected';
      html += `<div class="${cls}" data-id="${item.id}" data-side="left">
        <div class="sentence">${highlightChar(item.text, lv.character)}</div>
      </div>`;
    });

    html += `</div></div><div class="match-arrow">⇄</div><div>
      <div class="match-column-title">📝 词义（点击配对）</div>
      <div class="match-list">`;

    rightItems.forEach(function (item) {
      let cls = 'match-item';
      if (item.matched) cls += ' matched';
      if (selectedRight === item.id) cls += ' selected';
      html += `<div class="${cls}" data-id="${item.id}" data-side="right">
        <div>${escapeHtml(item.text)}</div>
      </div>`;
    });

    html += `</div></div></div></div>`;
    app.innerHTML = html;

    // 绑定事件
    app.querySelectorAll('.match-item').forEach(function (el) {
      el.addEventListener('click', function () {
        const id = el.getAttribute('data-id');
        const side = el.getAttribute('data-side');
        selectItem(id, side);
      });
    });

    document.getElementById('backBtn').addEventListener('click', renderLevelSelect);
    const logoutBtn3 = document.getElementById('logoutBtn3');
    if (logoutBtn3) {
      logoutBtn3.addEventListener('click', function () {
        UserManager.logout();
        showLogin();
      });
    }
  }

  // ===== 选择逻辑 =====

  function selectItem(id, side) {
    if (isProcessing) return;

    if (side === 'left') {
      const item = leftItems.find(function (i) { return i.id === id; });
      if (!item || item.matched) return;
      selectedLeft = id;
    } else {
      const item = rightItems.find(function (i) { return i.id === id; });
      if (!item || item.matched) return;
      selectedRight = id;
    }

    renderGameScreen();

    if (selectedLeft && selectedRight) {
      checkMatch();
    }
  }

  function checkMatch() {
    isProcessing = true;
    const left = leftItems.find(function (i) { return i.id === selectedLeft; });
    const right = rightItems.find(function (i) { return i.id === selectedRight; });

    if (left.answerId === right.id) {
      // 正确
      left.matched = true;
      right.matched = true;
      matchedCount++;
      showToast('✓ 配对正确！', 'success');

      const progress = UserManager.getProgress();
      if (!progress.stats[currentLevel]) progress.stats[currentLevel] = { correct: 0, wrong: 0 };
      progress.stats[currentLevel].correct++;
      UserManager.saveProgress(progress);

      selectedLeft = null;
      selectedRight = null;
      isProcessing = false;

      if (matchedCount === totalPairs) {
        setTimeout(completeLevel, 600);
      } else {
        renderGameScreen();
      }
    } else {
      // 错误
      wrongCount++;
      const progress = UserManager.getProgress();
      if (!progress.stats[currentLevel]) progress.stats[currentLevel] = { correct: 0, wrong: 0 };
      progress.stats[currentLevel].wrong++;
      UserManager.saveProgress(progress);

      showToast('✗ 再想想看', 'error');

      const leftEl = app.querySelector('.match-item[data-id="' + left.id + '"]');
      const rightEl = app.querySelector('.match-item[data-id="' + right.id + '"]');
      if (leftEl) leftEl.classList.add('wrong');
      if (rightEl) rightEl.classList.add('wrong');

      setTimeout(function () {
        if (leftEl) leftEl.classList.remove('wrong', 'selected');
        if (rightEl) rightEl.classList.remove('wrong', 'selected');
        selectedLeft = null;
        selectedRight = null;
        isProcessing = false;
        renderGameScreen();
      }, 600);
    }
  }

  // ===== 关卡完成 =====

  function completeLevel() {
    const stars = UserManager.markLevelCompleted(currentLevel, wrongCount, totalPairs);
    const isLast = currentLevel === GAME_DATA.length;
    const starStr = '⭐'.repeat(stars) + '☆'.repeat(3 - stars);

    modalIcon.textContent = isLast ? '🏆' : '🎉';
    modalTitle.textContent = isLast ? '全部通关！' : `第 ${currentLevel} 关完成！`;
    modalStars.textContent = starStr;
    modalDesc.textContent = isLast
      ? `恭喜你完成了全部 ${GAME_DATA.length} 关！错误 ${wrongCount} 次。`
      : `错误 ${wrongCount} 次 · 共 ${totalPairs} 对全部配对成功！`;
    modalBtn1.textContent = isLast ? '回到首页' : '下一关 ▶';
    modalBtn1.onclick = function () {
      closeModal();
      if (isLast) {
        renderStartScreen();
      } else {
        enterLevel(currentLevel + 1);
      }
    };
    modalBtn2.textContent = '返回选关';
    modalBtn2.onclick = function () {
      closeModal();
      renderLevelSelect();
    };

    showModal();
    if (stars >= 2) spawnConfetti();
  }

  // ===== Modal / Confetti =====

  function showModal() { modal.classList.add('show'); }
  function closeModal() { modal.classList.remove('show'); }

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
      setTimeout(function () { el.remove(); }, 5000);
    }
  }

  // ===== 开始游戏 =====

  function startGame() {
    const progress = UserManager.getProgress();
    const completed = progress.completed || [];
    const maxCompleted = completed.length > 0 ? Math.max.apply(null, completed) : 0;
    const target = Math.min(maxCompleted + 1, GAME_DATA.length);
    enterLevel(target);
  }

  // ===== 键盘支持 =====

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (modal.classList.contains('show')) {
        closeModal();
      } else if (currentLevel !== null) {
        renderLevelSelect();
      }
    }
  });

  // ===== 初始化 =====

  showLogin();

})(window);
