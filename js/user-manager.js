/**
 * user-manager.js
 * 账号管理：登录 / 登出 / 进度持久化
 * 数据存储在 localStorage 的 "userdata" 键中（纯文本，每行一个用户）
 */

(function (global) {
  'use strict';

  const USERDATA_KEY = 'userdata';

  // ===== 工具函数 =====

  function loadAllUsers() {
    try {
      const raw = localStorage.getItem(USERDATA_KEY);
      if (!raw) return {};
      const users = {};
      const lines = raw.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const name = trimmed.substring(0, eqIdx).trim();
        const jsonStr = trimmed.substring(eqIdx + 1).trim();
        if (!name || !jsonStr) continue;
        try {
          users[name] = JSON.parse(jsonStr);
        } catch (e) {
          console.warn('解析用户数据失败:', name, e);
        }
      }
      return users;
    } catch (e) {
      console.error('读取 userdata 失败:', e);
      return {};
    }
  }

  function saveAllUsers(users) {
    try {
      const lines = [];
      for (const name of Object.keys(users)) {
        lines.push(name + '=' + JSON.stringify(users[name]));
      }
      localStorage.setItem(USERDATA_KEY, lines.join('\n'));
      return true;
    } catch (e) {
      console.error('保存 userdata 失败:', e);
      return false;
    }
  }

  function getDefaultUserData() {
    return {
      completed: [],   // 已通关的关卡编号数组 [1,2,3,...]
      stats: {},       // 每关统计 { "1": {correct: 23, wrong: 2}, ... }
      stars: {},       // 每关星级 { "1": 3, "2": 2, ... }
      lastLogin: 0
    };
  }

  // ===== 当前用户 =====

  let currentUser = null;

  function getCurrentUser() {
    return currentUser;
  }

  function isLoggedIn() {
    return currentUser !== null;
  }

  // ===== 登录 / 登出 =====

  function login(username) {
    const name = (username || '').trim();
    if (!name) {
      return { success: false, message: '请输入用户名' };
    }
    if (name.length > 20) {
      return { success: false, message: '用户名不能超过20个字符' };
    }
    if (name.includes('=') || name.includes('\n') || name.includes('\r')) {
      return { success: false, message: '用户名不能包含 = 或换行' };
    }

    const users = loadAllUsers();
    if (!users[name]) {
      users[name] = getDefaultUserData();
    }
    users[name].lastLogin = Date.now();
    saveAllUsers(users);

    currentUser = name;
    return { success: true, message: '登录成功' };
  }

  function logout() {
    currentUser = null;
  }

  // ===== 进度读写 =====

  function getProgress() {
    if (!currentUser) return getDefaultUserData();
    const users = loadAllUsers();
    return users[currentUser] || getDefaultUserData();
  }

  function saveProgress(data) {
    if (!currentUser) return false;
    const users = loadAllUsers();
    users[currentUser] = { ...data, lastLogin: Date.now() };
    return saveAllUsers(users);
  }

  function markLevelCompleted(levelNum, wrongCount, totalPairs) {
    const progress = getProgress();
    if (!progress.completed.includes(levelNum)) {
      progress.completed.push(levelNum);
    }
    if (!progress.stats[levelNum]) {
      progress.stats[levelNum] = { correct: 0, wrong: 0 };
    }
    progress.stats[levelNum].wrong = wrongCount;
    progress.stats[levelNum].correct = totalPairs;

    // 星级计算
    let stars = 3;
    if (wrongCount >= Math.ceil(totalPairs * 0.3)) stars = 2;
    if (wrongCount >= Math.ceil(totalPairs * 0.5)) stars = 1;
    progress.stars[levelNum] = Math.max(progress.stars[levelNum] || 0, stars);

    saveProgress(progress);
    return stars;
  }

  function resetCurrentUserProgress() {
    if (!currentUser) return;
    const users = loadAllUsers();
    users[currentUser] = getDefaultUserData();
    users[currentUser].lastLogin = Date.now();
    saveAllUsers(users);
  }

  // ===== 快速登录用户列表 =====

  function getRecentUsers() {
    const users = loadAllUsers();
    return Object.keys(users)
      .filter(name => name !== currentUser)
      .sort((a, b) => (users[b].lastLogin || 0) - (users[a].lastLogin || 0))
      .slice(0, 6);
  }

  // ===== 导出公共接口 =====

  global.UserManager = {
    login,
    logout,
    isLoggedIn,
    getCurrentUser,
    getProgress,
    saveProgress,
    markLevelCompleted,
    resetCurrentUserProgress,
    getRecentUsers
  };

})(window);
