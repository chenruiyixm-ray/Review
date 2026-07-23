/**
 * game-engine.js
 * 文言实词配对游戏引擎
 * 依赖: game-data.js (GAME_DATA), user-manager.js (UserManager)
 */

(function (global) {
  'use strict';

  // ===== DOM 引用 =====
  var loginScreen = document.getElementById('loginScreen');
  var app = document.getElementById('app');
  var usernameInput = document.getElementById('usernameInput');
  var loginBtn = document.getElementById('loginBtn');
  var loginError = document.getElementById('loginError');
  var quickUsersEl = document.getElementById('quickUsers');

  var toast = document.getElementById('toast');
  var modal = document.getElementById('modal');
  var modalIcon = document.getElementById('modalIcon');
  var modalTitle = document.getElementById('modalTitle');
  var modalStars = document.getElementById('modalStars');
  var modalDesc = document.getElementById('modalDesc');
  var modalBtn1 = document.getElementById('modalBtn1');
  var modalBtn2 = document.getElementById('modalBtn2');

  // ===== 游戏状态 =====
  var currentLevel = null;
  var currentLevelData = null;
  var leftItems = [];
  var rightItems = [];
  var selectedLeft = null;
  var selectedRight = null;
  var matchedCount = 0;
  var wrongCount = 0;
  var totalPairs = 0;
  var isProcessing = false;

  // ===== 工具函数 =====
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      a[i] = a[j]; a[j] = arr[i]; arr[i] = a[i]; // safe swap
    }
    // correct shuffle:
    for (var k = a.length - 1; k > 0; k--) {
      var r = Math.floor(Math.random() * (k + 1));
      var tmp = a[k]; a[k] = a[r]; a[r] = tmp;
    }
    return a;
  }

  function escapeHtml(s) {
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function highlightChar(sentence, chars) {
    var charList = (chars || '').split('、').map(function (c) { return c.trim(); }).filter(Boolean);
    var result = escapeHtml(sentence);
    for (var i = 0; i < charList.length; i++) {
      var ch = charList[i];
      var idx = result.indexOf(ch);
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

  // ===== 同步状态指示 =====
  function setSyncStatus(text) {
    var el = document.getElementById('syncStatus');
    if (!el) {
      el = document.createElement('div');
      el.id = 'syncStatus';
      el.className = 'sync-status';
      document.body.appendChild(el);
    }
    el.textContent = text;
  }

  // ===== 登录流程 =====
  function attemptLogin(name) {
    var result = UserManager.login(name);
    if (!result.success) {
      loginError.textContent = result.message;
      // 震动输入框
      usernameInput.style.borderColor = 'var(--danger)';
      usernameInput.style.animation = 'shake .4s ease';
      setTimeout(function () { usernameInput.style.animation = ''; }, 400);
      return;
    }
    loginError.textContent = '';
    usernameInput.style.borderColor = '';
    showToast('欢迎回来，' + name + '！', 'success');
    showApp();
  }

  function showLogin() {
    loginScreen.classList.remove('hidden');
    app.classList.add('hidden');
    app.innerHTML = '';
    usernameInput.value = '';
    usernameInput.focus();
    renderQuickUsers();
    setSyncStatus('');
  }

  function renderQuickUsers() {
    var recent = UserManager.getRecentUsers();
    if (recent.length === 0) {
      quickUsersEl.innerHTML = '';
      return;
    }
    quickUsersEl.innerHTML = recent.map(function (name) {
      return '<span class="quick-user" data-name="' + escapeHtml(name) + '">' + escapeHtml(name) + '</span>';
    }).join('');
    [].forEach.call(quickUsersEl.querySelectorAll('.quick-user'), function (el) {
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

  // ===== 登录页事件（元素可能不存在于测试环境，需判空） =====
  if (loginBtn) loginBtn.addEventListener('click', function () { attemptLogin(usernameInput.value); });
  if (usernameInput) {
    usernameInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); attemptLogin(usernameInput.value); }
    });
    usernameInput.addEventListener('input', function () {
      if (loginError && loginError.textContent) { loginError.textContent = ''; }
      usernameInput.style.borderColor = '';
    });
  }

  // ===== 开始页 =====
  function renderStartScreen() {
    var progress = UserManager.getProgress();
    var completedCount = (progress.completed || []).length;
    var pct = Math.round(completedCount / GAME_DATA.length * 100);
    var username = UserManager.getCurrentUser() || '';

    app.innerHTML =
      '<div class="header"><h1>📜 文言实词配对大挑战</h1>' +
      '<p>300个高中必背文言实词 · 65关逐层突破</p></div>' +
      '<div class="user-bar" style="justify-content:center;margin-bottom:16px;">' +
        '<span class="username-tag">👤 ' + escapeHtml(username) + '</span>' +
        '<button class="logout-btn" id="logoutBtn" title="退出登录">🚪</button>' +
      '</div>' +
      '<div class="start-screen fade-in">' +
        '<div class="big-icon">🎓</div>' +
        '<h2>准备好了吗？</h2>' +
        '<p>每一关会给出若干文言例句和加点字，你需要将左侧的句子与右侧的正确词义配对。打乱顺序，考验真功夫！</p>' +
        '<div class="progress-section" style="max-width:400px;margin:0 auto 20px;">' +
          '<div class="progress-bar-bg"><div class="progress-bar-fill" style="width:' + pct + '%"></div></div>' +
          '<div class="progress-text"><span>已通关 ' + completedCount + '/' + GAME_DATA.length + '</span><span>' + pct + '%</span></div>' +
        '</div>' +
        '<button class="start-btn" id="startBtn">开始挑战 🚀</button>' +
        '<div><button class="reset-btn" id="resetBtn">🔄 重置我的进度</button></div>' +
      '</div>';

    document.getElementById('startBtn').addEventListener('click', startGame);
    document.getElementById('resetBtn').addEventListener('click', function () {
      if (confirm('确定要重置当前账号的全部进度吗？')) {
        UserManager.resetCurrentUserProgress();
        renderStartScreen();
        showToast('进度已重置', 'success');
      }
    });
    document.getElementById('logoutBtn').addEventListener('click', function () {
      UserManager.logout(); showLogin();
    });
  }

  // ===== 选关页 =====
  function renderLevelSelect() {
    var progress = UserManager.getProgress();
    var completed = progress.completed || [];
    var completedCount = completed.length;
    var pct = Math.round(completedCount / GAME_DATA.length * 100);
    var maxUnlocked = completed.length > 0 ? Math.max.apply(null, completed) : 0;
    var nextLevel = maxUnlocked + 1;
    var username = UserManager.getCurrentUser() || '';

    var html =
      '<div class="header"><h1>📜 选择关卡</h1>' +
      '<p>共 ' + GAME_DATA.length + ' 关 · 已通关 ' + completedCount + ' 关</p></div>' +
      '<div class="user-bar" style="justify-content:center;margin-bottom:12px;">' +
        '<span class="username-tag">👤 ' + escapeHtml(username) + '</span>' +
        '<button class="logout-btn" id="logoutBtn2" title="退出登录">🚪</button>' +
      '</div>' +
      '<div class="progress-section">' +
        '<div class="progress-bar-bg"><div class="progress-bar-fill" style="width:' + pct + '%"></div></div>' +
        '<div class="progress-text"><span>总进度</span><span>' + pct + '%</span></div>' +
      '</div>' +
      '<div class="level-grid fade-in">';

    for (var i = 0; i < GAME_DATA.length; i++) {
      var lv = GAME_DATA[i];
      var isCompleted = completed.indexOf(lv.level) !== -1;
      var isLocked = lv.level > nextLevel;
      var isCurrent = lv.level === nextLevel;
      var cls = 'level-btn';
      if (isCompleted) cls += ' completed';
      if (isLocked) cls += ' locked';
      if (isCurrent) cls += ' current';
      html += '<button class="' + cls + '" data-level="' + lv.level + '"' + (isLocked ? ' disabled' : '') + '>' + lv.level + '</button>';
    }

    html += '</div><div style="text-align:center;margin-top:24px;"><button class="reset-btn" id="resetBtn2">🔄 重置我的进度</button></div>';
    app.innerHTML = html;

    [].forEach.call(app.querySelectorAll('.level-btn'), function (btn) {
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
      UserManager.logout(); showLogin();
    });
  }

  // ===== 进入关卡 =====
  function enterLevel(levelNum) {
    var lv = null;
    for (var i = 0; i < GAME_DATA.length; i++) {
      if (GAME_DATA[i].level === levelNum) { lv = GAME_DATA[i]; break; }
    }
    if (!lv) return;
    currentLevel = levelNum;
    currentLevelData = lv;
    totalPairs = lv.sentences.length;

    leftItems = []; rightItems = [];
    for (var idx = 0; idx < lv.sentences.length; idx++) {
      var item = lv.sentences[idx];
      var leftId = 'L' + idx, rightId = 'R' + idx;
      leftItems.push({ id: leftId, text: item[0], answerId: rightId, matched: false });
      rightItems.push({ id: rightId, text: item[1], matchId: leftId, matched: false });
    }
    leftItems = shuffle(leftItems);
    rightItems = shuffle(rightItems);
    selectedLeft = null; selectedRight = null;
    matchedCount = 0; wrongCount = 0; isProcessing = false;

    renderGameScreen();
  }

  // ===== 游戏页 =====
  function renderGameScreen() {
    var lv = currentLevelData;
    var remaining = totalPairs - matchedCount;
    var username = UserManager.getCurrentUser() || '';

    var html =
      '<div class="game-screen" style="display:block;">' +
        '<div class="game-header">' +
          '<div class="game-header-left">' +
            '<button class="back-btn" id="backBtn" title="返回选关">←</button>' +
            '<div><div class="level-title">第 ' + lv.level + ' 关</div>' +
            '<div class="level-chars">实词：' + escapeHtml(lv.character) + '</div></div>' +
          '</div>' +
          '<div class="user-bar">' +
            '<span class="username-tag">👤 ' + escapeHtml(username) + '</span>' +
            '<button class="logout-btn" id="logoutBtn3" title="退出登录">🚪</button>' +
          '</div>' +
          '<div class="game-stats">' +
            '<div class="stat-item">剩余 <span class="stat-value">' + remaining + '</span></div>' +
            '<div class="stat-item">错误 <span class="stat-value wrong">' + wrongCount + '</span></div>' +
          '</div>' +
        '</div>' +
        '<div class="match-container">' +
          '<div><div class="match-column-title">📖 例句（点击选择）</div><div class="match-list">';

    for (var a = 0; a < leftItems.length; a++) {
      var li = leftItems[a];
      var cls = 'match-item' + (li.matched ? ' matched' : '') + (selectedLeft === li.id ? ' selected' : '');
      html += '<div class="' + cls + '" data-id="' + li.id + '" data-side="left"><div class="sentence">' + highlightChar(li.text, lv.character) + '</div></div>';
    }

    html += '</div></div><div class="match-arrow">⇄</div><div><div class="match-column-title">📝 词义（点击配对）</div><div class="match-list">';

    for (var b = 0; b < rightItems.length; b++) {
      var ri = rightItems[b];
      var cls2 = 'match-item' + (ri.matched ? ' matched' : '') + (selectedRight === ri.id ? ' selected' : '');
      html += '<div class="' + cls2 + '" data-id="' + ri.id + '" data-side="right"><div>' + escapeHtml(ri.text) + '</div></div>';
    }

    html += '</div></div></div></div>';
    app.innerHTML = html;

    [].forEach.call(app.querySelectorAll('.match-item'), function (el) {
      el.addEventListener('click', function () {
        selectItem(el.getAttribute('data-id'), el.getAttribute('data-side'));
      });
    });
    document.getElementById('backBtn').addEventListener('click', renderLevelSelect);
    var lb3 = document.getElementById('logoutBtn3');
    if (lb3) lb3.addEventListener('click', function () { UserManager.logout(); showLogin(); });
  }

  // ===== 选择 & 配对 =====
  function selectItem(id, side) {
    if (isProcessing) return;
    if (side === 'left') {
      var l = null;
      for (var i = 0; i < leftItems.length; i++) if (leftItems[i].id === id) { l = leftItems[i]; break; }
      if (!l || l.matched) return;
      selectedLeft = id;
    } else {
      var r = null;
      for (var j = 0; j < rightItems.length; j++) if (rightItems[j].id === id) { r = rightItems[j]; break; }
      if (!r || r.matched) return;
      selectedRight = id;
    }
    renderGameScreen();
    if (selectedLeft && selectedRight) checkMatch();
  }

  function checkMatch() {
    isProcessing = true;
    var left = null, right = null;
    for (var i = 0; i < leftItems.length; i++) if (leftItems[i].id === selectedLeft) { left = leftItems[i]; break; }
    for (var j = 0; j < rightItems.length; j++) if (rightItems[j].id === selectedRight) { right = rightItems[j]; break; }

    if (left.answerId === right.id) {
      left.matched = true; right.matched = true; matchedCount++;
      showToast('✓ 配对正确！', 'success');

      var prog = UserManager.getProgress();
      if (!prog.stats[currentLevel]) prog.stats[currentLevel] = { correct: 0, wrong: 0 };
      prog.stats[currentLevel].correct++;
      UserManager.saveProgress(prog);

      selectedLeft = null; selectedRight = null; isProcessing = false;
      if (matchedCount === totalPairs) setTimeout(completeLevel, 600);
      else renderGameScreen();
    } else {
      wrongCount++;
      var prog2 = UserManager.getProgress();
      if (!prog2.stats[currentLevel]) prog2.stats[currentLevel] = { correct: 0, wrong: 0 };
      prog2.stats[currentLevel].wrong++;
      UserManager.saveProgress(prog2);
      showToast('✗ 再想想看', 'error');

      var leftEl = app.querySelector('.match-item[data-id="' + left.id + '"]');
      var rightEl = app.querySelector('.match-item[data-id="' + right.id + '"]');
      if (leftEl) leftEl.classList.add('wrong');
      if (rightEl) rightEl.classList.add('wrong');
      setTimeout(function () {
        if (leftEl) leftEl.classList.remove('wrong', 'selected');
        if (rightEl) rightEl.classList.remove('wrong', 'selected');
        selectedLeft = null; selectedRight = null; isProcessing = false;
        renderGameScreen();
      }, 600);
    }
  }

  // ===== 关卡完成 =====
  function completeLevel() {
    var stars = UserManager.markLevelCompleted(currentLevel, wrongCount, totalPairs);
    var isLast = currentLevel === GAME_DATA.length;
    var starStr = '⭐'.repeat(stars) + '☆'.repeat(3 - stars);

    modalIcon.textContent = isLast ? '🏆' : '🎉';
    modalTitle.textContent = isLast ? '全部通关！' : '第 ' + currentLevel + ' 关完成！';
    modalStars.textContent = starStr;
    modalDesc.textContent = isLast
      ? '恭喜你完成了全部 ' + GAME_DATA.length + ' 关！错误 ' + wrongCount + ' 次。'
      : '错误 ' + wrongCount + ' 次 · 共 ' + totalPairs + ' 对全部配对成功！';
    modalBtn1.textContent = isLast ? '回到首页' : '下一关 ▶';
    modalBtn1.onclick = function () {
      closeModal();
      if (isLast) renderStartScreen(); else enterLevel(currentLevel + 1);
    };
    modalBtn2.textContent = '返回选关';
    modalBtn2.onclick = function () { closeModal(); renderLevelSelect(); };

    showModal();
    if (stars >= 2) spawnConfetti();
  }

  // ===== Modal / Confetti =====
  function showModal() { modal.classList.add('show'); }
  function closeModal() { modal.classList.remove('show'); }

  function spawnConfetti() {
    var colors = ['#6c5ce7','#00b894','#fdcb6e','#e74c3c','#0984e3','#e84393'];
    for (var i = 0; i < 40; i++) {
      var el = document.createElement('div');
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
    var prog = UserManager.getProgress();
    var completed = prog.completed || [];
    var maxCompleted = completed.length > 0 ? Math.max.apply(null, completed) : 0;
    enterLevel(Math.min(maxCompleted + 1, GAME_DATA.length));
  }

  // ===== 键盘 =====
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (modal.classList.contains('show')) closeModal();
      else if (currentLevel !== null) renderLevelSelect();
    }
  });

  // ===== 初始化 =====
  // 仅当关键 DOM 元素存在时才启动（避免被非浏览器环境加载时报错）
  if (loginScreen && app && usernameInput && loginBtn) {
    setSyncStatus('正在同步数据...');
    UserManager.refresh().then(function () {
      setSyncStatus('✓ 数据已同步');
      setTimeout(function () { setSyncStatus(''); }, 2000);
      if (UserManager.isLoggedIn()) showApp();
      else showLogin();
    }).catch(function () {
      setSyncStatus('⚠ 离线模式（本地缓存）');
      if (UserManager.isLoggedIn()) showApp();
      else showLogin();
    });
  }

})(window);
