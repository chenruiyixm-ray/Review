// ====== User Manager ======
// Handles login, multi-user profiles, progress save/load,
// and import/export of the `userdata` file (no extension).

const UserManager = (function () {
  const STORAGE_KEY = 'wenyan_userdata_v1';
  const CURRENT_USER_KEY = 'wenyan_current_user_v1';

  // ---------- raw persistence (localStorage) ----------
  function loadRaw() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch (e) {
      return {};
    }
  }
  function saveRaw(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  // ---------- userdata text format ----------
  // One line per user:  username=JSON
  // e.g. 小明={"completed":[1,2],"stats":{}}
  function exportText() {
    const data = loadRaw();
    const lines = [];
    for (const [name, profile] of Object.entries(data)) {
      lines.push(name + '=' + JSON.stringify(profile));
    }
    return lines.join('\n');
  }

  function importText(text) {
    const data = loadRaw();
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const name = line.slice(0, eq).trim();
      const json = line.slice(eq + 1).trim();
      if (!name) continue;
      try {
        const profile = JSON.parse(json);
        // merge: keep most progress for each user
        const existing = data[name] || {};
        const merged = {
          completed: Array.from(new Set([...(existing.completed || []), ...(profile.completed || [])])),
          stats: { ...(existing.stats || {}), ...(profile.stats || {}) },
          lastLogin: Math.max(existing.lastLogin || 0, profile.lastLogin || 0),
          stars: { ...(existing.stars || {}), ...(profile.stars || {}) }
        };
        data[name] = merged;
      } catch (e) { /* skip bad line */ }
    }
    saveRaw(data);
  }

  // ---------- profile helpers ----------
  function getProfile(name) {
    const data = loadRaw();
    return data[name] || null;
  }

  function saveProfile(name, profile) {
    const data = loadRaw();
    data[name] = profile;
    saveRaw(data);
  }

  function listUsers() {
    const data = loadRaw();
    return Object.entries(data).map(([name, p]) => ({
      name,
      completed: (p.completed || []).length,
      lastLogin: p.lastLogin || 0
    })).sort((a, b) => b.lastLogin - a.lastLogin);
  }

  // ---------- current user ----------
  function getCurrentUser() {
    return localStorage.getItem(CURRENT_USER_KEY) || null;
  }

  function setCurrentUser(name) {
    if (name) localStorage.setItem(CURRENT_USER_KEY, name);
    else localStorage.removeItem(CURRENT_USER_KEY);
  }

  // ---------- login / logout ----------
  function login(name) {
    name = (name || '').trim();
    if (!name) return { ok: false, msg: '请输入用户名' };
    if (name.includes('=') || name.includes('\n')) return { ok: false, msg: '用户名不能含 = 或换行' };
    if (name.length > 20) return { ok: false, msg: '用户名最多20个字符' };

    let profile = getProfile(name);
    if (!profile) {
      profile = { completed: [], stats: {}, stars: {}, lastLogin: Date.now() };
      saveProfile(name, profile);
    } else {
      profile.lastLogin = Date.now();
      saveProfile(name, profile);
    }
    setCurrentUser(name);
    return { ok: true, profile };
  }

  function logout() {
    setCurrentUser(null);
  }

  // ---------- progress for current user ----------
  function getProgress(name) {
    name = name || getCurrentUser();
    if (!name) return { completed: [], stats: {}, stars: {} };
    const p = getProfile(name) || { completed: [], stats: {}, stars: {} };
    return { completed: p.completed || [], stats: p.stats || {}, stars: p.stars || {} };
  }

  function saveProgress(name, progress) {
    name = name || getCurrentUser();
    if (!name) return;
    const p = getProfile(name) || {};
    p.completed = progress.completed || [];
    p.stats = progress.stats || {};
    p.stars = progress.stars || {};
    p.lastLogin = Date.now();
    saveProfile(name, p);
  }

  function clearProgress(name) {
    name = name || getCurrentUser();
    if (!name) return;
    const p = getProfile(name) || {};
    p.completed = [];
    p.stats = {};
    p.stars = {};
    p.lastLogin = Date.now();
    saveProfile(name, p);
  }

  // public API
  return {
    login, logout,
    getCurrentUser, listUsers,
    getProgress, saveProgress, clearProgress,
    exportText, importText
  };
})();
