// 单词PK · 联网实时对战后端
// Node.js + ws：静态文件服务 + WebSocket 房间实时通信 + 服务端排行榜持久化
const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

// ===================== 云端持久化（可选增强：Supabase） =====================
// 用 Supabase 免费 PostgreSQL 承载排行榜与词库，容器重建也不丢。
// 步骤：① 在 Supabase 控制台 SQL Editor 执行 create_cloud_tables.sql（建 kv 表 + 允许 anon 读写）；
//       ② 把 cloud.config.json 的 enabled 改为 true、填入 supabaseUrl 与 supabaseAnonKey；
//       ③ 重新发布。本进程启动后会用云端最新数据覆盖本地（云端优先）。
// 默认 enabled=false：仅使用本地加固持久化（原子写 + 自动备份 + 损坏自愈）。
// 使用原生 fetch 调用 Supabase REST（PostgREST），无需额外依赖。
let cloud = null;
let CLOUD_ENABLED = false;
try {
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'cloud.config.json'), 'utf8'));
  if (cfg.enabled && cfg.type === 'supabase' && cfg.supabaseUrl && cfg.supabaseAnonKey) {
    cloud = {
      url: String(cfg.supabaseUrl).replace(/\/+$/, ''),
      key: String(cfg.supabaseAnonKey)
    };
    CLOUD_ENABLED = true;
    console.log('[cloud] 云端持久化已启用 (Supabase)');
  }
} catch (_) {}

function sbHeaders(extra) {
  const h = {
    'apikey': cloud.key,
    'Authorization': 'Bearer ' + cloud.key,
    'Content-Type': 'application/json'
  };
  if (extra) Object.assign(h, extra);
  return h;
}

// 云端 kv 表读写（kv(key text pk, value jsonb, updated_at)；anon 可读写）
async function cloudGet(key, fallback) {
  try {
    const r = await fetch(`${cloud.url}/rest/v1/kv?key=eq.${encodeURIComponent(key)}&select=value`, { headers: sbHeaders() });
    if (!r.ok) return fallback;
    const rows = await r.json();
    if (!Array.isArray(rows) || !rows.length) return fallback;
    return rows[0].value;
  } catch (_) { return fallback; }
}
async function cloudSet(key, value) {
  try {
    const r = await fetch(`${cloud.url}/rest/v1/kv`, {
      method: 'POST',
      headers: sbHeaders({ 'Prefer': 'resolution=merge-duplicates' }),
      body: JSON.stringify({ key, value, updated_at: new Date().toISOString() })
    });
    return r.ok;
  } catch (_) { return false; }
}

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const LB_FILE = path.join(__dirname, 'leaderboard.json');
const BACKUP_DIR = path.join(__dirname, 'backups');

// ===================== 持久化工具：原子写 + 自动备份 + 损坏自动恢复 =====================
// 直接 writeFileSync 在崩溃时可能写坏文件；这里先写临时文件再 rename（原子），并保留历史备份。
function atomicWrite(file, data) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}
function backupFile(file) {
  try {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const base = path.basename(file);
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    fs.copyFileSync(file, path.join(BACKUP_DIR, base + '.' + ts + '.bak'));
    // 仅保留最近 12 份备份，避免无限增长
    const files = fs.readdirSync(BACKUP_DIR).filter((f) => f.startsWith(base + '.')).sort();
    while (files.length > 12) {
      const old = files.shift();
      try { fs.unlinkSync(path.join(BACKUP_DIR, old)); } catch (_) {}
    }
  } catch (_) {}
}
function safeLoad(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {}
  // 主文件缺失/损坏 → 从最新备份恢复
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith(path.basename(file) + '.'))
      .sort()
      .reverse();
    if (files.length) return JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, files[0]), 'utf8'));
  } catch (_) {}
  return fallback;
}
function persist(file, data) {
  try { atomicWrite(file, data); backupFile(file); return true; }
  catch (_) { return false; }
}

// ===================== 静态文件服务 =====================
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  let urlPath = decodeURIComponent(parsed.pathname);

  // 清空排行榜（根路径带 ?reset=<密钥> 触发；密钥默认为应用 sharecode）
  if ((urlPath === '/reset-lb' || urlPath === '/') && (parsed.query.reset || '') === (process.env.RESET_LB_KEY || 'INOPPOY5YX')) {
    leaderboard = {}; saveLeaderboard();
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('leaderboard cleared');
    return;
  }

  // ---- 公开 API：预设词库列表（创建页拉取） ----
  if (urlPath === '/api/presets') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      banks: presets.map((p) => ({ id: p.id, name: p.name, wordCount: p.words.length, note: p.note || '', words: p.words }))
    }));
    return;
  }

  // ---- 后台：登录（密码 -> token） ----
  if (urlPath === '/admin/login' && req.method === 'POST') {
    const body = await readJson(req).catch(() => ({}));
    if ((body.password || '') === ADMIN_PW) {
      json(res, 200, { token: ADMIN_TOKEN });
    } else {
      json(res, 401, { error: '密码错误' });
    }
    return;
  }

  // ---- 后台：词库读取（需 token） ----
  if (urlPath === '/admin/presets' && req.method === 'GET') {
    if (!checkAdmin(req, parsed)) return deny(res);
    json(res, 200, { banks: presets });
    return;
  }
  // ---- 后台：新建词库（需 token） ----
  if (urlPath === '/admin/presets' && req.method === 'POST') {
    if (!checkAdmin(req, parsed)) return deny(res);
    const body = await readJson(req).catch(() => ({}));
    const r = parseWords(body.text || '');
    if (r.words.length < 1) return json(res, 400, { error: '词库至少需要 1 个单词' });
    const bank = {
      id: 'p' + Date.now().toString(36),
      name: (body.name || '未命名词库').slice(0, 40),
      words: r.words,
      note: body.note || ''
    };
    presets.push(bank); savePresets();
    json(res, 200, bank);
    return;
  }
  // ---- 后台：编辑 / 删除词库（需 token） ----
  const mPreset = urlPath.match(/^\/admin\/presets\/([\w-]+)$/);
  if (mPreset && req.method === 'PUT') {
    if (!checkAdmin(req, parsed)) return deny(res);
    const bank = presets.find((p) => p.id === mPreset[1]);
    if (!bank) return json(res, 404, { error: '词库不存在' });
    const body = await readJson(req).catch(() => ({}));
    const r = parseWords(body.text || '');
    if (r.words.length < 1) return json(res, 400, { error: '词库至少需要 1 个单词' });
    bank.name = (body.name || bank.name).slice(0, 40);
    bank.words = r.words;
    bank.note = body.note || '';
    savePresets();
    json(res, 200, bank);
    return;
  }
  if (mPreset && req.method === 'DELETE') {
    if (!checkAdmin(req, parsed)) return deny(res);
    const i = presets.findIndex((p) => p.id === mPreset[1]);
    if (i < 0) return json(res, 404, { error: '词库不存在' });
    presets.splice(i, 1); savePresets();
    json(res, 200, { ok: true });
    return;
  }

  // ---- 后台页面 ----
  if (urlPath === '/admin') {
    serveFile(res, path.join(PUBLIC_DIR, 'admin.html'));
    return;
  }

  // ---- 静态文件 ----
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(PUBLIC_DIR, path.normalize(urlPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  serveFile(res, filePath);
});

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 2e6) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}
function deny(res) {
  res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: '未登录或登录已过期' }));
}
function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

// ===================== 工具函数 =====================
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 房间号：去掉易混淆字符（0/O、1/I 等），4 位更短
const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function genRoomId() {
  let id;
  do {
    id = '';
    for (let i = 0; i < 4; i++) id += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)];
  } while (rooms.has(id));
  return id;
}

// 出题：targetIndex 指定题干（不传则随机）；干扰项为其他单词的中文释义，保证释义不重复
function makeQuestion(words, targetIndex) {
  let target;
  if (typeof targetIndex === 'number') target = words[targetIndex];
  else target = words[Math.floor(Math.random() * words.length)];
  const pool = words.filter((w, i) => i !== (typeof targetIndex === 'number' ? targetIndex : -1));
  const others = shuffle(pool);
  const need = 3;
  const distract = [];
  const seen = new Set([target.zh]);
  for (const w of others) {
    if (distract.length >= need) break;
    if (seen.has(w.zh)) continue;
    seen.add(w.zh);
    distract.push(w);
  }
  const opts = shuffle([target, ...distract]);
  return {
    en: target.en,
    options: opts.map((w) => ({ zh: w.zh, en: w.en })),
    correctIndex: opts.findIndex((w) => w.zh === target.zh)
  };
}

// ===================== 排行榜（服务端持久化） =====================
function loadLeaderboard() {
  const d = safeLoad(LB_FILE, {});
  return (d && typeof d === 'object') ? d : {};
}
let leaderboard = loadLeaderboard();
function saveLeaderboard() {
  persist(LB_FILE, JSON.stringify(leaderboard));
  if (CLOUD_ENABLED) cloudSet('leaderboard', leaderboard);
}
function updateLeaderboard(room, winner) {
  const entries = [
    { name: room.hostName, score: room.scores.host, win: winner === 'host', correct: room.stats.host.correct, time: room.stats.host.time },
    { name: room.guestName, score: room.scores.guest, win: winner === 'guest', correct: room.stats.guest.correct, time: room.stats.guest.time }
  ];
  for (const e of entries) {
    if (!e.name) continue;
    const key = e.name.toLowerCase();
    const cur = leaderboard[key] || { name: e.name, score: 0, wins: 0, games: 0, correct: 0, time: 0 };
    cur.name = e.name;
    cur.score += e.score;
    cur.games += 1;
    if (e.win) cur.wins += 1;
    cur.correct += e.correct;
    cur.time += e.time;
    leaderboard[key] = cur;
  }
  saveLeaderboard();
}

// ===================== 每月自动清理排行榜 =====================
// 仅清理排行榜 leaderboard，保留词库 presets（用户资产，不可逆，绝不清理）。清理前自动备份。
const CLEANUP_META = path.join(__dirname, 'last_cleanup.json');
const CLEANUP_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000; // 30 天 ≈ 每月
async function loadLastCleanup() {
  if (CLOUD_ENABLED) {
    const v = await cloudGet('last_cleanup', null);
    if (v && typeof v.ts === 'number') return v.ts;
  }
  try { const m = JSON.parse(fs.readFileSync(CLEANUP_META, 'utf8')); return m.ts || 0; } catch (_) { return 0; }
}
async function saveLastCleanup() {
  const ts = Date.now();
  if (CLOUD_ENABLED) { try { await cloudSet('last_cleanup', { ts }); } catch (_) {} }
  try { atomicWrite(CLEANUP_META, JSON.stringify({ ts })); } catch (_) {}
}
async function monthlyCleanupLeaderboard() {
  try {
    if (process.env.DISABLE_MONTHLY_CLEANUP === '1') return; // 可通过环境变量关闭自动清理
    const now = Date.now();
    const last = await loadLastCleanup();
    if (last === 0) { await saveLastCleanup(); return; } // 首次运行仅建立基准时间戳，不清理；之后每 30 天清理一次
    if (now - last < CLEANUP_INTERVAL_MS) return; // 未到周期，跳过
    if (leaderboard && typeof leaderboard === 'object' && Object.keys(leaderboard).length > 0) {
      backupFile(LB_FILE); // 先备份当前排行榜数据，再清空
    }
    leaderboard = {};
    saveLeaderboard(); // 写本地 + 云端（若开启）；词库 presets 完全不受影响
    await saveLastCleanup();
    console.log('[定时] 已执行每月排行榜清理（旧数据已备份至 backups/，词库保留）');
  } catch (e) {
    console.error('[定时] 每月排行榜清理失败:', e && e.message);
  }
}

// ===================== 预设词库（服务端持久化，可在后台管理） =====================
const PRESETS_FILE = path.join(__dirname, 'presets.json');

const CET_SEED = `abandon,放弃
ability,能力
absolute,绝对的
absorb,吸收
abuse,滥用
academic,学术的
accelerate,加速
accent,口音
access,接近；使用权
accident,事故
accompany,陪伴
accomplish,完成
accurate,准确的
achieve,实现
acquire,获得
adapt,适应
adequate,充足的
adjust,调整
administration,管理
admit,承认
adopt,采用
adult,成年人
advance,前进
advantage,优势
adventure,冒险
advocate,提倡
affair,事务
affect,影响
agency,机构
agenda,议程
alcohol,酒精
ambitious,有雄心的
analyze,分析
ancient,古代的
announce,宣布
annoy,使恼怒
annual,年度的
anticipate,预期
anxiety,焦虑
apologize,道歉
apparent,明显的
appeal,呼吁
appearance,外表
apply,申请
appreciate,欣赏
approach,方法；接近
appropriate,合适的
approve,批准
architecture,建筑
argue,争论
arise,出现
arouse,唤起
article,文章
artificial,人造的
assembly,集会
assess,评估
assign,分配
assist,协助
associate,联想
assume,假设
assure,确保
athlete,运动员
atmosphere,大气
attitude,态度
attract,吸引
audience,观众
authentic,真实的
authority,权威
automatic,自动的
available,可用的
average,平均的
avoid,避免
award,奖励
aware,意识到的
awkward,尴尬的
barrier,障碍
benefit,利益
betray,背叛
bore,使厌烦`;

const IELTS_SEED = `abolish,废除
abstract,抽象的
abundant,丰富的
accumulate,积累
acknowledge,承认
adjacent,邻近的
adverse,不利的
aesthetic,美学的
affluent,富裕的
allocate,分配
ambiguous,模糊的
analogy,类比
arbitrary,武断的
autonomous,自治的
bias,偏见
boundary,边界
capable,有能力的
category,类别
cease,停止
coherent,连贯的
coincide,巧合
collapse,倒塌
committed,坚定的
compensate,补偿
compile,编纂
complement,补充
complex,复杂的
comply,遵守
comprehensive,全面的
comprise,包含
concede,承认
conceive,构想
conform,符合
consensus,共识
constitute,构成
contemporary,当代的
contradict,矛盾
contribute,贡献
controversial,有争议的
crucial,关键的
cumulative,累积的
decisive,决定性的
deduce,推断
deficient,不足的
deliberate,故意的
demonstrate,证明
denote,表示
derive,源自
detect,探测
deviate,偏离
discrete,离散的
dismantle,拆除
dispatch,派遣
distort,扭曲
diverse,多样的
domain,领域
domestic,国内的
dominant,主导的
draft,草案
dramatic,戏剧性的
dynamic,动态的
elaborate,详尽的
eliminate,消除
empirical,经验主义的
encounter,遭遇
enhance,增强
episode,事件
equilibrium,平衡
evident,明显的
evolve,进化
exclude,排除
exclusive,独有的
exemplify,举例说明
exploit,利用；剥削
expose,暴露
external,外部的
facilitate,促进
feasible,可行的
flexible,灵活的
fluctuate,波动
format,格式
formula,公式
foundation,基础
framework,框架
fundamental,基本的
generate,产生
global,全球的
harness,利用
highlight,强调
identical,相同的
identify,识别
incentive,激励
incidence,发生率
incline,倾向于
integral,完整的
interaction,互动
intervene,干预
investigate,调查
isolate,隔离
legislation,立法
legitimate,合法的
levy,征税
locate,定位
manipulate,操纵
maximize,最大化
minority,少数
motive,动机
negligible,可忽略的
notion,概念
objective,客观的
offset,抵消
ongoing,持续的
paradox,悖论
participate,参与
passive,被动的
phenomenon,现象
precede,先于
precise,精确的
predict,预测
preliminary,初步的
presume,假定
priority,优先
prohibit,禁止
promote,促进
radical,激进的
random,随机的
rational,理性的
recover,恢复
relevant,相关的
reluctant,不情愿的
restore,恢复
restrict,限制
retain,保留
reveal,揭示
revenue,收入
reverse,相反的
rigid,僵硬的
robust,强健的
roughly,大致
simulate,模拟
solely,仅仅
stable,稳定的
statistic,统计
status,地位
straightforward,简单的
subsequent,随后的
substitute,替代
successive,连续的
sufficient,充足的
survive,幸存
susceptible,易受影响的
sustain,维持
tangible,有形的
temporary,暂时的
tendency,趋势
threshold,阈值
ultimate,最终的
undergo,经历
undertake,承担
unique,独特的
universal,普遍的
utilize,利用
valid,有效的
vanish,消失
variation,变化
versatile,多才多艺的
viable,可行的
virtual,虚拟的
visible,可见的
volume,体积；量
voluntary,自愿的
widespread,广泛的`;

// 与前端一致的词库解析（服务端解析后存储为 {en,zh}）
function parseWords(text) {
  const lines = String(text).split(/\r?\n/);
  const words = [];
  let skipped = 0;
  const HEADER_RE = /^(英文|单词|word|en)[\s,，]*(中文|释义|意思|翻译|meaning|zh|cn)$/i;
  for (let raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^[#;／/]/.test(line)) continue;
    if (HEADER_RE.test(line)) continue;
    const m = line.match(/^(.*?)([\u4e00-\u9fff])/);
    if (!m) { skipped++; continue; }
    let en = line.slice(0, m.index + m[1].length).replace(/[\s,，;；:：=\-–—]+$/, '');
    let zh = line.slice(m.index + m[1].length).trim();
    en = en.replace(/^["']|["']$/g, '').trim();
    en = en.replace(/^\d+[\.\)、]\s*/, '').trim();
    en = en.replace(/\s+(n|v|vt|vi|adj|adv|prep|conj|pron|num|art|aux|int)\.?$/i, '').trim();
    zh = zh.replace(/^["']|["']$/g, '').trim();
    if (!en || !zh) { skipped++; continue; }
    words.push({ en, zh });
  }
  return { words, skipped };
}

function defaultPresets() {
  return [
    { id: 'cet', name: '四六级通用高频词（示例）', words: parseWords(CET_SEED).words, note: '' },
    { id: 'ielts', name: '雅思通用高频词（示例）', words: parseWords(IELTS_SEED).words, note: '' },
    { id: 'kaoyan', name: '考研·红宝书（请导入你的正版词表）', words: [], note: '请在「词库后台」把你的红宝书乱序2026词表粘贴进来；本程序不直接内置原书内容，请粘贴你手上的正版。' }
  ];
}

function loadPresets() {
  const data = safeLoad(PRESETS_FILE, null);
  if (Array.isArray(data) && data.length) return data;
  const d = defaultPresets();
  persist(PRESETS_FILE, JSON.stringify(d, null, 2));
  return d;
}
function savePresets(list) {
  persist(PRESETS_FILE, JSON.stringify(list || presets, null, 2));
  if (CLOUD_ENABLED) cloudSet('presets', list || presets);
}
let presets = loadPresets();

// 若开启云端持久化，启动后异步用云端最新数据覆盖本地（云端优先）
if (CLOUD_ENABLED) {
  cloudGet('leaderboard', null).then((v) => { if (v && typeof v === 'object') leaderboard = v; });
  cloudGet('presets', null).then((v) => { if (Array.isArray(v) && v.length) presets = v; });
}

// ===================== 后台管理（密码保护） =====================
const ADMIN_PW = process.env.ADMIN_PW || 'wordpk2026';
// 无状态 token：由密码派生，所有实例计算结果一致（平台可能多实例路由，不能用内存态 token）
const ADMIN_TOKEN = crypto.createHmac('sha256', ADMIN_PW).update('wordpk-admin-v1').digest('hex');
// token 支持 Authorization 头或 ?token= 查询参数（平台可能剥离 Authorization 头，故后台页用查询参数）
function getAdminToken(req, parsed) {
  const h = req.headers['authorization'] || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (m) return m[1];
  return (parsed && parsed.query && parsed.query.token) || '';
}
function checkAdmin(req, parsed) {
  return getAdminToken(req, parsed) === ADMIN_TOKEN;
}

// ===================== 房间管理 =====================
const rooms = new Map();

function aliasTaken(alias) {
  if (!alias) return false;
  const low = alias.toLowerCase();
  for (const r of rooms.values()) {
    if (r.alias && r.alias.toLowerCase() === low && r.state !== 'over') return true;
  }
  return false;
}

function createRoom(hostWs, name, words, settings, alias) {
  const id = genRoomId();
  const total = Math.max(1, Math.min(settings.total || 10, words.length));
  const room = {
    id,
    alias: alias || null,
    hostWs, guestWs: null,
    hostName: name || '玩家1', guestName: null,
    words,
    settings: { perQuestion: Math.min(Math.max(settings.perQuestion || 10, 4), 30), total },
    state: 'waiting',
    deck: [],
    qnum: 0,
    scores: { host: 0, guest: 0 },
    answered: { host: false, guest: false },
    current: null,
    timer: null,
    nextTimer: null,
    wrong: { host: [], guest: [] },
    stats: { host: { correct: 0, time: 0 }, guest: { correct: 0, time: 0 } }
  };
  rooms.set(id, room);
  return room;
}

function broadcast(room, obj) {
  const msg = JSON.stringify(obj);
  for (const ws of [room.hostWs, room.guestWs]) {
    if (ws && ws.readyState === 1) ws.send(msg);
  }
}

function sendTo(room, role, obj) {
  const ws = role === 'host' ? room.hostWs : room.guestWs;
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function startGame(room) {
  if ((room.state !== 'waiting' && room.state !== 'over') || !room.guestWs) return;
  room.state = 'playing';
  room.qnum = 0;
  room.scores = { host: 0, guest: 0 };
  room.wrong = { host: [], guest: [] };
  room.stats = { host: { correct: 0, time: 0 }, guest: { correct: 0, time: 0 } };
  room.deck = shuffle(room.words.map((_, i) => i));
  sendNextQuestion(room);
}

function sendNextQuestion(room) {
  if (room.qnum >= room.settings.total) { endGame(room); return; }
  const idx = room.deck[room.qnum];
  const q = makeQuestion(room.words, idx);
  room.current = { q, answers: {}, times: {}, start: Date.now() };
  room.answered = { host: false, guest: false };
  room.qnum++;
  const payload = {
    type: 'question',
    en: q.en,
    options: q.options,
    qnum: room.qnum,
    total: room.settings.total,
    perQuestion: room.settings.perQuestion
  };
  broadcast(room, payload);
  room.timer = setTimeout(() => reveal(room), room.settings.perQuestion * 1000);
}

function handleAnswer(room, role, choice) {
  if (room.state !== 'playing' || !room.current) return;
  if (room.answered[role]) return;
  if (typeof choice !== 'number' || choice < 0 || choice >= room.current.q.options.length) return;
  room.answered[role] = true;
  room.current.answers[role] = choice;
  room.current.times[role] = Date.now() - room.current.start;
  broadcast(room, { type: 'status', answered: { host: room.answered.host, guest: room.answered.guest } });
  if (room.answered.host && room.answered.guest) {
    clearTimeout(room.timer);
    reveal(room);
  }
}

function scoreRound(cH, cG, tH, tG) {
  let gainH = 0, gainG = 0;
  if (cH) gainH += 100;
  if (cG) gainG += 100;
  // 速度奖励：两人都答对时，用时更短者额外 +50
  if (cH && cG) {
    if (tH < tG) gainH += 50;
    else if (tG < tH) gainG += 50;
  }
  return { gainH, gainG };
}

function reveal(room) {
  clearTimeout(room.timer); room.timer = null;
  const q = room.current.q;
  const correct = q.correctIndex;
  const aH = room.current.answers.host;
  const aG = room.current.answers.guest;
  const cH = aH === correct;
  const cG = aG === correct;
  const tH = room.current.times.host;
  const tG = room.current.times.guest;
  const sc = scoreRound(cH, cG, tH, tG);
  room.scores.host += sc.gainH;
  room.scores.guest += sc.gainG;
  // 收集错题 + 统计
  if (!cH) room.wrong.host.push({ en: q.en, zh: q.options[correct].zh });
  if (!cG) room.wrong.guest.push({ en: q.en, zh: q.options[correct].zh });
  if (cH) { room.stats.host.correct++; if (typeof tH === 'number') room.stats.host.time += tH; }
  if (cG) { room.stats.guest.correct++; if (typeof tG === 'number') room.stats.guest.time += tG; }
  const base = {
    type: 'result',
    correctIndex: correct,
    correctZh: q.options[correct].zh,
    options: q.options,
    en: q.en,
    scores: room.scores,
    detail: {
      host: { choice: aH, correct: cH, time: tH || null, gain: sc.gainH },
      guest: { choice: aG, correct: cG, time: tG || null, gain: sc.gainG }
    }
  };
  sendTo(room, 'host', { ...base, yourChoice: aH });
  sendTo(room, 'guest', { ...base, yourChoice: aG });
  room.nextTimer = setTimeout(() => sendNextQuestion(room), 1800);
}

function endGame(room) {
  room.state = 'over';
  clearTimeout(room.timer); clearTimeout(room.nextTimer);
  let winner = 'draw';
  if (room.scores.host > room.scores.guest) winner = 'host';
  else if (room.scores.guest > room.scores.host) winner = 'guest';
  updateLeaderboard(room, winner);
  broadcast(room, {
    type: 'over',
    scores: room.scores,
    winner,
    total: room.settings.total,
    wrong: room.wrong
  });
}

function cleanupRoom(room) {
  clearTimeout(room.timer); clearTimeout(room.nextTimer);
  rooms.delete(room.id);
}

function handleDisconnect(ws) {
  const room = rooms.get(ws.roomId);
  if (!room) return;
  const other = ws.role === 'host' ? room.guestWs : room.hostWs;
  if (other && other.readyState === 1) {
    other.send(JSON.stringify({ type: 'oppLeft', role: ws.role }));
  }
  if (ws.role === 'host') room.hostWs = null; else room.guestWs = null;
  // 任一方离开即结束本局，清理房间
  cleanupRoom(room);
}

// ===================== WebSocket =====================
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  ws.role = null;
  ws.roomId = null;
  ws.on('message', (data) => {
    let m;
    try { m = JSON.parse(data.toString()); } catch { return; }
    handleMessage(ws, m);
  });
  ws.on('close', () => handleDisconnect(ws));
  ws.on('error', () => handleDisconnect(ws));
});

function handleMessage(ws, m) {
  switch (m.type) {
    case 'create': {
      const words = Array.isArray(m.words) ? m.words : [];
      if (words.length < 2) {
        ws.send(JSON.stringify({ type: 'error', msg: '词库至少需要 2 个单词才能对战' }));
        return;
      }
      // 自定义房间名
      let alias = (m.alias || '').trim();
      if (alias) {
        if (alias.length > 12) { ws.send(JSON.stringify({ type: 'error', msg: '房间名最多 12 个字符' })); return; }
        if (!/^[\u4e00-\u9fa5A-Za-z0-9_-]+$/.test(alias)) { ws.send(JSON.stringify({ type: 'error', msg: '房间名只能用中文、字母、数字、_ 或 -' })); return; }
        if (aliasTaken(alias)) { ws.send(JSON.stringify({ type: 'error', msg: '该房间名已被占用，请换一个' })); return; }
      }
      const room = createRoom(ws, m.name, words, m.settings || {}, alias);
      ws.roomId = room.id; ws.role = 'host';
      ws.send(JSON.stringify({
        type: 'created', room: room.id, alias: room.alias, youAre: 'host',
        name: room.hostName, total: room.settings.total, perQuestion: room.settings.perQuestion
      }));
      break;
    }
    case 'join': {
      const input = (m.room || '').trim();
      if (!input) { ws.send(JSON.stringify({ type: 'error', msg: '请输入房间号或房间名' })); return; }
      const up = input.toUpperCase();
      let room = rooms.get(up);
      if (!room) {
        // 按自定义房间名（大小写不敏感）查找
        const low = input.toLowerCase();
        for (const r of rooms.values()) {
          if (r.alias && r.alias.toLowerCase() === low) { room = r; break; }
        }
      }
      if (!room) { ws.send(JSON.stringify({ type: 'error', msg: '房间不存在，请检查房间号/房间名' })); return; }
      if (room.guestWs) { ws.send(JSON.stringify({ type: 'error', msg: '房间已满' })); return; }
      if (room.state !== 'waiting') { ws.send(JSON.stringify({ type: 'error', msg: '游戏已开始，无法加入' })); return; }
      room.guestWs = ws; room.guestName = m.name || '玩家2';
      ws.roomId = room.id; ws.role = 'guest';
      ws.send(JSON.stringify({
        type: 'joined', room: room.id, youAre: 'guest',
        hostName: room.hostName, name: room.guestName,
        total: room.settings.total, perQuestion: room.settings.perQuestion
      }));
      broadcast(room, {
        type: 'update', state: 'waiting',
        hostName: room.hostName, guestName: room.guestName, ready: true
      });
      break;
    }
    case 'start': {
      const room = rooms.get(ws.roomId);
      if (!room) { ws.send(JSON.stringify({ type: 'error', msg: '房间已失效' })); return; }
      if (ws.role !== 'host') { ws.send(JSON.stringify({ type: 'error', msg: '只有房主可以开始' })); return; }
      if (!room.guestWs) { ws.send(JSON.stringify({ type: 'error', msg: '还没有人加入房间' })); return; }
      if (room.state === 'playing') { ws.send(JSON.stringify({ type: 'error', msg: '游戏进行中' })); return; }
      startGame(room);
      break;
    }
    case 'answer': {
      const room = rooms.get(ws.roomId);
      if (!room) return;
      handleAnswer(room, ws.role, m.choice);
      break;
    }
    case 'getLeaderboard': {
      const arr = Object.values(leaderboard).map((e) => ({
        name: e.name, score: e.score, wins: e.wins, games: e.games, correct: e.correct, time: e.time
      }));
      arr.sort((a, b) => b.score - a.score || b.wins - a.wins || a.name.localeCompare(b.name));
      arr.forEach((e, i) => { e.rank = i + 1; });
      ws.send(JSON.stringify({ type: 'leaderboard', list: arr }));
      break;
    }
    case 'leave': {
      handleDisconnect(ws);
      break;
    }
    default:
      break;
  }
}

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`单词PK 服务器已启动: http://localhost:${PORT}`);
    console.log(`房间数: ${rooms.size}`);
  });
  // 每月自动清理排行榜：启动延迟 10s（等云端排行榜加载完成）检查一次，之后每 24h 再检查；仅清 leaderboard，保留词库
  setTimeout(monthlyCleanupLeaderboard, 10000);
  setInterval(monthlyCleanupLeaderboard, 24 * 60 * 60 * 1000);
}

module.exports = { scoreRound, makeQuestion, shuffle };

// 定时清理空房间（兜底）
setInterval(() => {
  for (const [id, room] of rooms) {
    if (!room.hostWs && !room.guestWs) rooms.delete(id);
  }
}, 60000);
