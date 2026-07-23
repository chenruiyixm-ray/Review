/**
 * user-manager.js
 * 账号管理：登录 / 登路 / 进度持久化
 *
 * 核心思路：
 *   userdata 是服务器上的纯文本文件（无后缀），每行格式：
 *     用户名=JSON
 *   例如：
 *     小明={"completed":[1,2,3],"stars":{"1":3},"lastLogin":1718000000}
 *
 *   - 登录时 GET userdata → 解析 → 找到该用户 → 加载进度
 *   - 进度变化时 POST 更新后的全部内容回服务器
 *
 *   由于 GitHub Pages 是纯静态托管，不支持服务端写入，
 *   这里采用「本地缓存 + 尝试同步」策略：
 *     1. 优先从 localStorage 读取（离线可用）
 *     2. 启动时尝试 GET userdata（服务器有则用服务器的）
 *     3. 每次写入同时更新 localStorage 和尝试 POST 到服务器
 *
 *   如果你的服务器支持 PHP/Node/Python 等后端，只需提供两个接口：
 *     GET  /userdata  → 返回文件原文
 *     POST /userdata  → body 为文件全文，服务端直接覆盖写入
 *   不支持后端的纯静态环境会自动降级为 localStorage only。
 */

(function (global) {
  'use strict';

  var USERDATA_URL = 'userdata';          // 服务器上 userdata 文件的路径
  var LOCAL_KEY = 'wenyan_userdata';     // 本地缓存 key
  var CURRENT_USER_KEY = 'wenyan_current_user';

  // ===== 内存缓存 =====
  var memoryStore = null;   // 解析后的 users 对象
  var currentUser = null;   // 当前用户名

  // ===== 初始化：从 localStorage 恢复当前用户 =====
  try {
    currentUser = localStorage.getItem(CURRENT_USER_KEY) || null;
  } catch (e) {
    currentUser = null;
  }

  // ===== 工具函数 =====

  // 解析 userdata 文本 → { 用户名: {...}, ... }
  function parseUserdata(raw) {
    var users = {};
    if (!raw) return users;
    var lines = raw.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      var eqIdx = line.indexOf('=');
      if (eqIdx === -1) continue;
      var name = line.substring(0, eqIdx).trim();
      var jsonStr = line.substring(eqIdx + 1).trim();
      if (!name || !jsonStr) continue;
      try {
        users[name] = JSON.parse(jsonStr);
      } catch (e) {
        console.warn('[userdata] 解析用户失败:', name, e);
      }
    }
    return users;
  }

  // users 对象 → userdata 文本
  function serializeUserdata(users) {
    var lines = [];
    var names = Object.keys(users);
    // 按 lastLogin 倒序，让活跃用户排在前面
    names.sort(function (a, b) {
      return (users[b].lastLogin || 0) - (users[a].lastLogin || 0);
    });
    for (var i = 0; i < names.length; i++) {
      var n = names[i];
      lines.push(n + '=' + JSON.stringify(users[n]));
    }
    return lines.join('\n') + '\n';
  }

  // 从 localStorage 读取缓存
  function loadLocalCache() {
    try {
      var raw = localStorage.getItem(LOCAL_KEY);
      return parseUserdata(raw);
    } catch (e) {
      return {};
    }
  }

  // 写入 localStorage 缓存
  function saveLocalCache(users) {
    try {
      localStorage.setItem(LOCAL_KEY, serializeUserdata(users));
    } catch (e) {
      console.warn('[userdata] localStorage 写入失败:', e);
    }
  }

  // 默认用户数据结构
  function defaultUserData() {
    return {
      completed: [],
      stats: {},
      stars: {},
      lastLogin: 0
    };
  }

  // ===== 服务器同步 =====

  // 从服务器拉取 userdata
  function fetchFromServer() {
    return fetch(USERDATA_URL, {
      method: 'GET',
      cache: 'no-cache'
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    }).then(function (text) {
      var users = parseUserdata(text);
      // 合并：服务器数据优先，本地新增用户追加
      var local = loadLocalCache();
      var merged = {};
      // 先放服务器数据
      var names = Object.keys(users);
      for (var i = 0; i < names.length; i++) merged[names[i]] = users[names[i]];
      // 本地有但服务器没有的，追加
      var localNames = Object.keys(local);
      for (var j = 0; j < localNames.length; j++) {
        if (!merged[localNames[j]]) {
          merged[localNames[j]] = local[localNames[j]];
        }
      }
      memoryStore = merged;
      saveLocalCache(merged);
      return merged;
    });
  }

  // 把当前内存数据推送到服务器
  function pushToServer() {
    if (!memoryStore) memoryStore = loadLocalCache();
    var body = serializeUserdata(memoryStore);
    return fetch(USERDATA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: body
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    }).then(function () {
      // 成功后也更新本地缓存
      saveLocalCache(memoryStore);
      return true;
    });
  }

  // 确保内存中有数据（优先服务器，回退本地）
  function ensureLoaded() {
    if (memoryStore) return Promise.resolve(memoryStore);
    // 先尝试服务器
    return fetchFromServer().catch(function () {
      // 服务器不可用，用本地缓存
      memoryStore = loadLocalCache();
      return memoryStore;
    });
  }

  // ===== 登录 / 登出 =====

  function login(username) {
    var name = (username || '').trim();
    if (!name) return { success: false, message: '请输入用户名' };
    if (name.length > 20) return { success: false, message: '用户名不能超过20个字符' };
    if (name.indexOf('=') !== -1 || name.indexOf('\n') !== -1 || name.indexOf('\r') !== -1) {
      return { success: false, message: '用户名不能包含 = 或换行' };
    }

    // 同步检查（用内存或本地缓存）
    var users = memoryStore || loadLocalCache();
    if (!users[name]) {
      users[name] = defaultUserData();
    }
    users[name].lastLogin = Date.now();
    memoryStore = users;
    saveLocalCache(users);

    currentUser = name;
    try { localStorage.setItem(CURRENT_USER_KEY, name); } catch (e) {}

    // 异步同步到服务器（不阻塞登录）
    pushToServer().catch(function () {
      console.info('[userdata] 服务器同步失败，数据已保存在本地');
    });

    return { success: true, message: '登录成功' };
  }

  function logout() {
    currentUser = null;
    try { localStorage.removeItem(CURRENT_USER_KEY); } catch (e) {}
  }

  // ===== 进度读写 =====

  function getProgress() {
    if (!currentUser) return defaultUserData();
    var users = memoryStore || loadLocalCache();
    return users[currentUser] || defaultUserData();
  }

  function saveProgress(data) {
    if (!currentUser) return;
    var users = memoryStore || loadLocalCache();
    users[currentUser] = Object.assign({}, data, { lastLogin: Date.now() });
    memoryStore = users;
    saveLocalCache(users);
    // 异步推服务器
    pushToServer().catch(function () {});
  }

  function markLevelCompleted(levelNum, wrongCount, totalPairs) {
    var progress = getProgress();
    if (progress.completed.indexOf(levelNum) === -1) {
      progress.completed.push(levelNum);
    }
    if (!progress.stats[levelNum]) {
      progress.stats[levelNum] = { correct: 0, wrong: 0 };
    }
    progress.stats[levelNum].wrong = wrongCount;
    progress.stats[levelNum].correct = totalPairs;

    // 星级
    var stars = 3;
    if (wrongCount >= Math.ceil(totalPairs * 0.3)) stars = 2;
    if (wrongCount >= Math.ceil(totalPairs * 0.5)) stars = 1;
    progress.stars[levelNum] = Math.max(progress.stars[levelNum] || 0, stars);

    saveProgress(progress);
    return stars;
  }

  function resetCurrentUserProgress() {
    if (!currentUser) return;
    saveProgress(defaultUserData());
  }

  // ===== 其他 =====

  function isLoggedIn() { return currentUser !== null; }
  function getCurrentUser() { return currentUser; }

  function getRecentUsers() {
    var users = memoryStore || loadLocalCache();
    return Object.keys(users)
      .filter(function (n) { return n !== currentUser; })
      .sort(function (a, b) {
        return (users[b].lastLogin || 0) - (users[a].lastLogin || 0);
      })
      .slice(0, 6);
  }

  // ===== 启动：尝试从服务器拉取最新数据 =====
  ensureLoaded().then(function () {
    console.info('[userdata] 数据加载完成，用户数:', Object.keys(memoryStore).length);
  }).catch(function () {
    console.info('[userdata] 使用本地缓存');
  });

  // ===== 导出 =====
  global.UserManager = {
    login: login,
    logout: logout,
    isLoggedIn: isLoggedIn,
    getCurrentUser: getCurrentUser,
    getProgress: getProgress,
    saveProgress: saveProgress,
    markLevelCompleted: markLevelCompleted,
    resetCurrentUserProgress: resetCurrentUserProgress,
    getRecentUsers: getRecentUsers,
    // 高级：手动刷新 / 同步
    refresh: fetchFromServer,
    sync: pushToServer
  };

})(window);
