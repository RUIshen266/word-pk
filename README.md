# 单词PK · 联网实时对战

一个轻量的**联网实时单词 PK 对战**小游戏：房主建房、好友凭房间号/房间名加入，限时选释义，实时计分与排行榜。支持自定义词库（四六级 / 雅思 / 你自己的词表），并可导出对局错题本。

> 线上地址：<https://pk.ciling.icu>（海外 Render 托管 + 自有域名，免备案）

---

## ✨ 功能特性

- **实时 1v1 对战**：基于 WebSocket，房主建房、对方输入房间号或自定义房间名即可加入，全程实时同步。
- **限时抢答计分**：每题限时（默认 10s），答对 +100，两人都答对时用时更短者额外 +50 速度奖励。
- **中英文选项展示**：题目仅显示中文释义，揭晓时每个选项「上方中文 + 下方英文」居中呈现，方便核对与学习。
- **音效反馈**：选中选项有震动（`navigator.vibrate`）+ 缩放弹跳 + 颜色高亮；**答对播放明亮上行琶音、答错播放低沉下行音**（全部 Web Audio 程序化生成，无外部文件，iOS 不支持震动时自动降级为视觉/听觉反馈）。
- **背景音乐**：内置轻快循环 BGM（主旋律 + 低音 + 轻打击多声部，不单调），左上角 🎵 一键开关，偏好记忆在本地；受浏览器自动播放限制，首次交互后自动开始。
- **错题本导出 PDF**：对局结束后可把两人的错题导出为 PDF，生成「英文 | 中文」双列居中对称表格（并保留打印回退）。
- **自定义词库**：内置「四六级高频词」「雅思高频词」示例词库，可在后台粘贴你自己的词表（支持 `英文,中文` 逐行格式）。
- **排行榜 & 持久化**：服务端持久化排行榜；可选接入 Supabase 云端，容器重建也不丢数据。
- **防作弊**：服务端在 `question` 消息中**不含正确答案索引**，仅在 `result` 阶段下发，客户端无法提前得知答案。

---

## 🧱 技术栈

- **后端**：Node.js + [`ws`](https://github.com/websockets/ws)（HTTP 静态服务 + WebSocket 房间通信 + 排行榜/词库持久化），零额外框架。
- **前端**：原生 HTML / CSS / JavaScript（无构建步骤），放在 `public/` 下。
- **云端持久化（可选）**：Supabase（PostgreSQL + PostgREST），通过 Node 原生 `fetch` 调用，无需额外 SDK。
- **部署**：Render Web Service（原生支持 WebSocket），配合自定义域名。

---

## 📁 目录结构

```
word-pk/
├── server.js                 # 后端：静态服务 + WebSocket + 持久化 + 后台 API
├── public/                   # 前端静态资源
│   ├── index.html            # 对战主页
│   ├── client.js             # 前端逻辑（出题/作答/揭晓/PDF导出/震动/音频引擎）
│   ├── style.css             # 样式（含选项上下居中、点击动画）
│   ├── admin.html            # 词库后台管理页
│   └── 8a1c16289833f847666a5204fa688e33.txt  # 微信域名验证文件（勿删/勿改名）
├── cloud.config.json         # 云端持久化配置（Supabase）
├── create_cloud_tables.sql   # Supabase 建表 SQL
├── render.yaml               # Render Blueprint 部署配置
├── package.json              # 依赖仅 ws
└── presets.json / leaderboard.json  # 运行时生成（已被 .gitignore 排除）
```

> 根目录下若干 `*.test.js` / `pub_admin_verify.js` 等为开发期自测脚本，非运行所需。

---

## 🚀 本地运行

```bash
# 需要 Node.js 18+
npm install
npm start
# 打开 http://localhost:3000
```

- 端口：默认 `3000`，可用环境变量 `PORT` 覆盖（部署平台会注入）。
- 开两个浏览器标签（或一个普通 + 一个隐身），一个建房、一个加入，即可对战。

---

## ⚙️ 配置说明

### 1. 后台管理密码
词库后台 `/admin` 受密码保护：

- 默认密码：`wordpk2026`
- 修改方式：设置环境变量 `ADMIN_PW`（部署平台的环境变量里配置即可）。

### 2. 云端持久化（可选，Supabase）
编辑 `cloud.config.json`：

```json
{
  "enabled": true,
  "type": "supabase",
  "supabaseUrl": "https://<your-project>.supabase.co",
  "supabaseAnonKey": "<your-anon-key>"
}
```

启用步骤：
1. 在 Supabase 控制台 **SQL Editor** 执行 `create_cloud_tables.sql`（建 `kv` 表并允许 anon 读写）；
2. 填入上面的 `supabaseUrl` 与 `supabaseAnonKey`，把 `enabled` 改为 `true`；
3. 重新部署。进程启动后会用云端最新数据覆盖本地（云端优先）。

> `anon` key 设计为可公开，但建议仍只放在服务端配置中，不要提交到公开仓库。

### 3. 清空排行榜（慎用）
访问根路径带 `?reset=<密钥>` 可清空排行榜，密钥为 `process.env.RESET_LB_KEY` 或默认 `INOPPOY5YX`：

```
https://你的域名/?reset=INOPPOY5YX
```

---

## 🌐 部署（Render + 自有域名，免备案）

1. 在 [Render](https://render.com) 选择 **New → Blueprint**，连接本 GitHub 仓库，自动读取 `render.yaml`（已配置 `npm install` / `npm start`、免费层、海外节点）。
2. 首次部署后，在 Render 的 **Environment** 里按需设置环境变量（如 `ADMIN_PW`）。
3. **绑定自有域名**：在 Render 添加 Custom Domain（如 `pk.ciling.icu`），会给出一条 CNAME 记录。
4. 到你的域名解析商（本项目用西部数码）添加该 CNAME，`pk → word-pk.onrender.com`，等待 Render 侧显示 `Verified` 并自动签发 SSL 证书。
5. 之后每次推送到 `main` 分支，Render 会自动重新部署。

> 选择海外节点（如 Oregon / Singapore）+ `.icu` 等海外后缀域名，可免国内 ICP 备案。

---

## 🛠️ 后台管理（词库）

访问 `/admin` 并输入密码后，可：

- 查看现有词库（四六级 / 雅思 / 自定义）；
- 新建 / 编辑 / 删除词库；
- 词库文本格式：每行 `英文,中文`，例如：

```
abandon,放弃
ability,能力
```

保存后即时生效，对战创建页即可选用。

---

## 🔑 微信域名验证文件

`public/8a1c16289833f847666a5204fa688e33.txt` 是微信公众平台/JS-SDK 要求的**域名所有权验证文件**：

- **不要删除、不要改名、不要修改内容**，否则微信重新校验时会失败。
- 它会被自动作为静态文件在网站根目录提供：`https://你的域名/8a1c16289833f847666a5204fa688e33.txt`。
- `server.js` 已为该后缀配置 `text/plain` MIME。

---

## 📝 已知说明

- 排行榜与词库默认写本地文件（`leaderboard.json` / `presets.json`），采用原子写入 + 自动备份 + 损坏自愈；如需跨实例/跨重启不丢，请按上面开启 Supabase 云端持久化。
- 数据库体量很小（仅排行榜与词库），正常使用不会写满，无需定期清理。
- iOS 设备不支持 `navigator.vibrate`，点击反馈会自动降级为缩放 + 高亮 + 音效。

---

## 📄 License

仅供学习与个人使用。内置示例词库为程序生成的通用高频词；如需使用受版权保护的词表（如某机构红宝书），请导入你拥有的正版内容。
