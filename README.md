# 文言实词配对大挑战

65关 · 300个文言实词 · 配对游戏

## 文件结构

```
wenyan-game/
├── index.html              入口页面（含 SVG favicon）
├── README.md               本文档
├── css/
│   └── styles.css          暗色主题样式
├── js/
│   ├── game-data.js        65关游戏数据（53KB）
│   ├── user-manager.js     账号·进度·userdata 同步
│   └── game-engine.js      游戏引擎·UI·配对逻辑
└── userdata                用户数据文件（服务器上，自动生成）
```

## 部署说明

### 纯静态托管（GitHub Pages / Vercel 等）

直接将 `wenyan-game/` 目录部署即可。

> ⚠️ **注意**：纯静态环境**不支持服务端写入**。此时 userdata 会降级为
> 仅保存在浏览器 localStorage，换设备/清缓存会丢失。
> 如需跨设备同步，请使用下面的后端方案。

### 带后端（推荐，支持 userdata 文件持久化）

需要服务器支持 **PHP / Node / Python** 等任意一种后端。
游戏通过两个 HTTP 请求读写 `userdata` 文件：

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET`  | `/userdata`  | 返回文件全文（纯文本） |
| `POST` | `/userdata`  | body 为文件全文，服务端覆盖写入 |

#### 示例：PHP 版接口（`api/userdata.php`）

```php
<?php
header('Content-Type: text/plain; charset=utf-8');
$file = __DIR__ . '/../userdata';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (file_exists($file)) {
        echo file_get_contents($file);
    }
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = file_get_contents('php://input');
    // 简单校验：每行必须含 = 号
    $lines = explode("\n", $data);
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line !== '' && strpos($line, '=') === false) {
            http_response_code(400);
            echo 'Invalid format';
            exit;
        }
    }
    file_put_contents($file, $data, LOCK_EX);
    echo 'OK';
    exit;
}
```

> 把 `index.html` 中 `USERDATA_URL` 改为 `'api/userdata.php'` 即可。

#### 示例：Node.js 版接口（Express）

```js
const express = require('express');
const fs = require('fs');
const app = express();
app.use(express.text({ type: '*/*' }));

const FILE = './userdata';

app.get('/userdata', (req, res) => {
  if (fs.existsSync(FILE)) res.send(fs.readFileSync(FILE, 'utf8'));
  else res.send('');
});

app.post('/userdata', (req, res) => {
  fs.writeFileSync(FILE, req.body, 'utf8');
  res.send('OK');
});

app.use(express.static('wenyan-game'));
app.listen(3000);
```

### userdata 文件格式

纯文本，每行一个用户，`用户名=JSON`：

```
小明={"completed":[1,2,3],"stats":{"1":{"correct":23,"wrong":2}},"stars":{"1":3},"lastLogin":1718000000}
小红={"completed":[],"stats":{},"stars":{},"lastLogin":1718000000}
```

首次部署时创建一个**空文件**即可（或完全不创建，会自动生成）。

## 账号系统

- 输入用户名（无需密码）→ 自动创建 / 登录
- 每个用户独立进度，互不影响
- 已登录用户显示为快捷标签，点击即登
- 进度同时写入 **服务器 userdata** + **本地 localStorage 缓存**
- 离线时自动降级为本地缓存，恢复网络后自动同步

## 游戏玩法

- 左侧文言文例句（加点字高亮），右侧词义选项
- 点击一句 + 点击一个词义 = 完成一次配对
- 正确 → 绿色锁定；错误 → 红色抖动，可重试
- 每关完成 → 撒花 + ⭐星级评定
- 进度自动保存，刷新/关闭不丢失

## 重置进度

每个页面底部有「🔄 重置我的进度」按钮（带确认提示），仅清除当前账号数据。

## 导入 / 导出 userdata

游戏开始页和选关页底部各有一组数据管理按钮：

| 按钮 | 说明 |
|------|------|
| 💾 导出 userdata | 下载名为 `userdata` 的文件（无后缀，纯文本），包含所有用户数据 |
| 📂 导入 userdata | 选择本地 `userdata` 文件 → 弹窗选择合并或替换 |

**合并 vs 替换：**
- **合并**（点确定）：导入文件中的用户覆盖同名用户，本地其他用户保留 → 适合多人汇总
- **替换**（点取消）：完全用导入文件替换当前所有数据 → 适合从备份恢复

> 💡 **典型用途**：老师可以在服务器上维护一份完整的 `userdata` 文件，
> 学生下载后导入自己的浏览器即可看到全班进度；反之亦然。

**userdata 文件格式**（纯文本，每行一个用户）：

```
小明={"completed":[1,2,3],"stats":{"1":{"correct":23,"wrong":2}},"stars":{"1":3},"lastLogin":1718000000}
小红={"completed":[],"stats":{},"stars":{},"lastLogin":1718000000}
```

也可以直接在浏览器控制台调用 API：

```js
// 导出（返回纯文本字符串）
UserManager.exportData()

// 导入（合并模式）
UserManager.importData(text, true)

// 导入（替换模式）
UserManager.importData(text, false)
```
