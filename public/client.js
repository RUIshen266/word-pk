(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  let ws = null;
  const me = { role: null, room: null, name: null, alias: null };
  const game = { total: 0, perQuestion: 0, qnum: 0, answered: false, cur: null, wrong: [] };
  let timerRAF = null, timerStart = 0, timerDur = 0;

  // ===================== 内置词库预设（通用示例，非特定版权书） =====================
  const PRESET_CET = `abandon,放弃
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

  const PRESET_IELTS = `abolish,废除
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

  const TMPL_KAOYAN = `# 考研·红宝书（乱序2026）
# 请把你自己的红宝书词表粘贴到下面，每行一个单词：
# 支持格式：  abandon,放弃   或   abandon 放弃
# （程序不能直接内置红宝书原书词表，请粘贴你手上的正版内容）

`;

  // ===================== 屏幕切换 =====================
  function show(id) {
    $$('.screen').forEach((s) => s.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
    window.scrollTo(0, 0);
  }

  // ===================== 连接状态 / toast =====================
  function setConn(t, cls) {
    const c = $('#conn');
    c.textContent = t;
    c.className = 'conn' + (cls ? ' ' + cls : '');
  }
  let toastT = null;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), 2800);
  }

  // ===================== 词库解析 =====================
  function parseWords(text) {
    const lines = text.split(/\r?\n/);
    const words = [];
    let skipped = 0;
    const HEADER_RE = /^(英文|单词|word|en)[\s,，]*(中文|释义|意思|翻译|meaning|zh|cn)$/i;
    for (let raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      if (/^[#;／/]/.test(line)) continue;
      if (HEADER_RE.test(line)) continue;
      const m = line.match(/^(.*?)([一-鿿])/);
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

  // ===================== 文件读取 =====================
  function loadSheetJS() {
    return new Promise((res, rej) => {
      if (window.XLSX) return res();
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
      s.onload = res;
      s.onerror = () => rej(new Error('xlsx 解析库加载失败（请检查网络）'));
      document.head.appendChild(s);
    });
  }
  async function readFileText(file) {
    const name = (file.name || '').toLowerCase();
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      await loadSheetJS();
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
      return rows.filter((r) => r && r.length).map((r) => {
        const a = (r[0] == null ? '' : String(r[0])).trim();
        const b = (r[1] == null ? '' : String(r[1])).trim();
        return a && b ? a + ' - ' + b : (a || b);
      }).join('\n');
    }
    return await file.text();
  }

  // ===================== WebSocket =====================
  function connect() {
    const proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
    ws = new WebSocket(proto + location.host + location.search);
    ws.onopen = () => setConn('已连接', 'ok');
    ws.onclose = () => { setConn('已断开', 'bad'); setTimeout(connect, 1500); };
    ws.onerror = () => setConn('连接异常', 'bad');
    ws.onmessage = (e) => {
      try { handle(JSON.parse(e.data)); } catch (_) {}
    };
  }
  function send(obj) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
  }

  function handle(m) {
    switch (m.type) {
      case 'created':
        me.role = 'host'; me.room = m.room; me.name = m.name; me.alias = m.alias || null;
        game.total = m.total; game.perQuestion = m.perQuestion;
        $('#sbHostName').textContent = m.name;
        $('#sbGuestName').textContent = '对手';
        enterWait();
        break;
      case 'joined':
        me.role = 'guest'; me.room = m.room; me.name = m.name;
        game.total = m.total; game.perQuestion = m.perQuestion;
        $('#sbHostName').textContent = m.hostName;
        $('#sbGuestName').textContent = m.name;
        enterWait();
        break;
      case 'update':
        if (m.hostName) { $('#hostNameShow').textContent = m.hostName; if (me.role === 'guest') $('#sbHostName').textContent = m.hostName; }
        if (m.guestName) { $('#guestNameShow').textContent = m.guestName; if (me.role === 'host') $('#sbGuestName').textContent = m.guestName; }
        if (m.ready) {
          $('#chipGuest').classList.remove('off');
          $('#btnStart').disabled = (me.role !== 'host');
        }
        break;
      case 'question':
        game.qnum = m.qnum; game.total = m.total; game.perQuestion = m.perQuestion;
        game.answered = false; game.cur = m;
        renderQuestion(m);
        break;
      case 'status':
        updateOppStatus(m.answered);
        break;
      case 'result':
        renderResult(m);
        break;
      case 'over':
        renderOver(m);
        break;
      case 'leaderboard':
        renderLeaderboard(m.list);
        break;
      case 'oppLeft':
        toast('对手已离开房间');
        show('screen-home');
        break;
      case 'error':
        toast(m.msg || '出错了');
        break;
    }
  }

  // ===================== 创建 / 加入 =====================
  function refreshParseInfo() {
    const t = $('#wordsInput').value;
    if (!t.trim()) { $('#parseInfo').textContent = ''; return; }
    const r = parseWords(t);
    $('#parseInfo').textContent = `已识别 ${r.words.length} 个单词` + (r.skipped ? `（跳过 ${r.skipped} 行）` : '');
  }

  function doCreate() {
    const r = parseWords($('#wordsInput').value);
    if (r.words.length < 2) { toast('词库至少需要 2 个有效单词'); return; }
    const total = Math.min(parseInt($('#qTotal').value) || 10, r.words.length);
    const perQuestion = Math.min(Math.max(parseInt($('#qSec').value) || 10, 4), 30);
    me.name = ($('#hostName').value || '玩家1').trim().slice(0, 12);
    const alias = ($('#roomName').value || '').trim().slice(0, 12);
    send({
      type: 'create', name: me.name, words: r.words, alias,
      settings: { total, perQuestion }
    });
  }

  function doJoin() {
    const room = ($('#joinRoom').value || '').trim();
    if (!room) { toast('请输入房间号或房间名'); return; }
    me.name = ($('#joinName').value || '玩家2').trim().slice(0, 12);
    send({ type: 'join', room, name: me.name });
  }

  // ===================== 等待页 =====================
  function enterWait() {
    show('screen-wait');
    $('#roomCode').textContent = me.room;
    if (me.alias) { $('#aliasLine').style.display = ''; $('#aliasCode').textContent = me.alias; }
    else { $('#aliasLine').style.display = 'none'; }
    const q = new URLSearchParams(location.search);
    q.set('room', me.alias || me.room);
    const link = location.origin + location.pathname + '?' + q.toString();
    $('#shareLink').value = link;
    $('#hostNameShow').textContent = me.role === 'host' ? me.name : '玩家1';
    $('#guestNameShow').textContent = '等待加入…';
    $('#chipGuest').classList.add('off');
    $('#btnStart').disabled = (me.role !== 'host');
    $('#waitTitle').textContent = me.role === 'host' ? '房间已创建' : '已加入房间';
  }

  function copyLink() {
    const inp = $('#shareLink');
    inp.select();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(inp.value).then(() => toast('链接已复制，发给对手吧'), () => toast('复制失败，请手动复制'));
    } else {
      try { document.execCommand('copy'); toast('链接已复制'); } catch (_) { toast('请手动复制'); }
    }
  }

  // ===================== 对战页 =====================
  function renderQuestion(m) {
    show('screen-game');
    $('#qWord').textContent = m.en;
    $('#qProgress').textContent = `${m.qnum} / ${m.total}`;
    const box = $('#options');
    box.innerHTML = '';
    m.options.forEach((opt, i) => {
      const b = document.createElement('button');
      b.className = 'opt';
      b.innerHTML = `<span class="opt-key">${i + 1}</span><span class="opt-zh">${escapeHtml(opt.zh)}</span>`;
      b.addEventListener('click', () => choose(i));
      box.appendChild(b);
    });
    $('#feedback').textContent = '';
    $('#feedback').className = 'feedback';
    $('#oppStatus').textContent = '对手思考中…';
    startTimer(m.perQuestion);
  }

  function choose(i) {
    if (game.answered) return;
    game.answered = true;
    stopTimer();
    send({ type: 'answer', choice: i });
    $$('#options .opt').forEach((b, idx) => {
      b.classList.add('disabled');
      if (idx === i) {
        b.classList.add('mine', 'tapped');
      }
    });
    // 反馈：手机震动 + 轻微音效（不支持的环境自动忽略）
    if (navigator.vibrate) { try { navigator.vibrate(28); } catch (_) {} }
    Sound.playTap();
    Sound.ensureMusicIfDesired(); // 选词即恢复/续播背景音乐（覆盖键盘选择、退出重进等场景）
    $('#oppStatus').textContent = '已提交，等待对手…';
  }

  function renderResult(m) {
    stopTimer();
    $('#timerFill').style.width = '0%';
    const opts = $$('#options .opt');
    const correct = m.correctIndex;
    opts.forEach((b, idx) => {
      b.classList.add('disabled', 'reveal');
      const o = m.options[idx] || {};
      b.innerHTML = `<span class="opt-key">${idx + 1}</span><span class="opt-zh">${escapeHtml(o.zh)}</span><span class="opt-en">${escapeHtml(o.en)}</span>`;
      if (idx === correct) b.classList.add('correct');
      if (idx === m.yourChoice && idx !== correct) b.classList.add('wrong');
      if (idx === m.yourChoice) b.classList.add('mine');
    });
    const mine = m.yourChoice;
    const fb = $('#feedback');
    if (mine === correct) {
      fb.textContent = `✓ 答对啦  +${m.detail[me.role].gain}`;
      fb.className = 'feedback ok';
    } else if (mine == null) {
      fb.textContent = `⏰ 超时 · 正确答案：${m.correctZh}`;
      fb.className = 'feedback bad';
    } else {
      fb.textContent = `✗ 答错 · 正确答案：${m.correctZh}`;
      fb.className = 'feedback bad';
    }
    updateScores(m.scores.host, m.scores.guest);
    if (mine === correct) Sound.playCorrect(); else Sound.playWrong();
    const oppRole = me.role === 'host' ? 'guest' : 'host';
    const opp = m.detail[oppRole];
    const oppName = me.role === 'host' ? $('#sbGuestName').textContent : $('#sbHostName').textContent;
    if (opp.choice == null) {
      $('#oppStatus').textContent = `${oppName} 超时未答`;
    } else {
      $('#oppStatus').textContent = `${oppName} ${opp.correct ? '答对' : '答错'}` + (opp.gain ? ` +${opp.gain}` : '');
    }
  }

  function updateScores(h, g) {
    $('#sbHostScore').textContent = h;
    $('#sbGuestScore').textContent = g;
    $('#sbHost').classList.toggle('lead', h > g);
    $('#sbGuest').classList.toggle('lead', g > h);
  }

  function updateOppStatus(answered) {
    const oppAns = me.role === 'host' ? answered.guest : answered.host;
    if (game.answered && oppAns) $('#oppStatus').textContent = '双方已作答，揭晓中…';
    else if (oppAns) $('#oppStatus').textContent = '对手已作答，快一点！';
    else $('#oppStatus').textContent = '对手思考中…';
  }

  function startTimer(sec) {
    cancelAnimationFrame(timerRAF);
    timerDur = sec * 1000;
    timerStart = performance.now();
    const fill = $('#timerFill');
    fill.classList.remove('warn');
    function step(now) {
      const left = Math.max(0, timerDur - (now - timerStart));
      const pct = (left / timerDur) * 100;
      fill.style.width = pct + '%';
      if (left < timerDur * 0.3) fill.classList.add('warn');
      if (left > 0) timerRAF = requestAnimationFrame(step);
    }
    timerRAF = requestAnimationFrame(step);
  }
  function stopTimer() { cancelAnimationFrame(timerRAF); }

  // ===================== 结算页 =====================
  function renderOver(m) {
    show('screen-over');
    const banner = $('#winnerBanner');
    if (m.winner === 'draw') { banner.textContent = '平局！'; banner.className = 'winner draw'; }
    else if (m.winner === me.role) { banner.textContent = '🏆 你赢了！'; banner.className = 'winner'; }
    else { banner.textContent = '惜败，再来一局？'; banner.className = 'winner lose'; }
    $('#fsHostName').textContent = $('#sbHostName').textContent;
    $('#fsGuestName').textContent = $('#sbGuestName').textContent;
    $('#fsHostScore').textContent = m.scores.host;
    $('#fsGuestScore').textContent = m.scores.guest;
    // 我的错题
    game.wrong = (m.wrong && m.wrong[me.role]) || [];
    renderWrong(game.wrong);
    if (me.role === 'host') {
      $('#btnAgain').style.display = '';
      $('#btnAgain').textContent = '再来一局';
    } else {
      $('#btnAgain').style.display = 'none';
    }
    // 顺手刷新排行榜数据
    send({ type: 'getLeaderboard' });
  }

  function renderWrong(words) {
    const list = $('#wrongList');
    list.innerHTML = '';
    $('#wrongCount').textContent = words.length;
    if (!words.length) {
      $('#wrongTip').textContent = '这一局全对，太强了！';
      return;
    }
    $('#wrongTip').textContent = '点击下方按钮导出为 PDF（英文 | 中文 双列表格）';
    words.forEach((w) => {
      const row = document.createElement('div');
      row.className = 'wrong-item';
      row.innerHTML = `<span class="w-en">${escapeHtml(w.en)}</span><span class="w-zh">${escapeHtml(w.zh)}</span>`;
      list.appendChild(row);
    });
  }

  // ===================== 导出 PDF =====================
  function downloadBlob(blob, filename) {
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1200);
  }
  // 加载 jsPDF + html2canvas（如需中文完美显示，用截图方式生成）
  function loadPdfLibs() {
    return new Promise((res, rej) => {
      if (window.jspdf && window.html2canvas) return res();
      let pending = 0;
      const done = () => { if (pending === 0) res(); };
      const fail = () => rej(new Error('PDF 库加载失败'));
      function inject(src) {
        pending++;
        const s = document.createElement('script');
        s.src = src;
        s.onload = () => { pending--; done(); };
        s.onerror = fail;
        document.head.appendChild(s);
      }
      if (!window.jspdf) inject('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js');
      else done();
      if (!window.html2canvas) inject('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js');
      else done();
    });
  }
  async function exportWrongToPdf() {
    const words = game.wrong || [];
    if (!words.length) { toast('这一局全对，没有错题可导出~'); return; }
    const name = me.name || '我';
    toast('正在生成 PDF…');
    try {
      await loadPdfLibs();
      const canvas = await renderWrongCanvas(words, name);
      const pdf = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4' });
      addCanvasPaged(pdf, canvas, 36);
      pdf.save(`单词PK错题本_${name}.pdf`);
      toast('已导出 PDF');
    } catch (e) {
      console.warn('PDF 生成失败，回退打印页：', e);
      openPrintFriendly(words, name);
    }
  }
  // 把双列表格（英文|中文）渲染到离屏容器，再用 html2canvas 截图
  function renderWrongCanvas(words, name) {
    return new Promise((resolve, reject) => {
      const stage = document.createElement('div');
      stage.className = 'export-stage';
      const rows = words.map((w, i) => `
        <div class="ex-row">
          <div class="ex-no">${i + 1}</div>
          <div class="ex-en">${escapeHtml(w.en)}</div>
          <div class="ex-zh">${escapeHtml(w.zh)}</div>
        </div>`).join('');
      stage.innerHTML = `
        <div class="ex-title">单词PK · 我的错题本</div>
        <div class="ex-sub">玩家：${escapeHtml(name)}　日期：${new Date().toLocaleDateString('zh-CN')}　共 ${words.length} 词</div>
        <div class="ex-table">
          <div class="ex-row ex-head">
            <div class="ex-no">#</div>
            <div class="ex-en">英文</div>
            <div class="ex-zh">中文</div>
          </div>
          ${rows}
        </div>`;
      document.body.appendChild(stage);
      window.html2canvas(stage, { scale: 2, backgroundColor: '#ffffff', logging: false, useCORS: true })
        .then((canvas) => { resolve(canvas); stage.remove(); })
        .catch((err) => { stage.remove(); reject(err); });
    });
  }
  // 把整张截图按 A4 宽度适配并分页
  function addCanvasPaged(pdf, canvas, margin) {
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgW = pageW - margin * 2;
    const pxPageH = canvas.width * (pageH - margin * 2) / imgW;
    let rendered = 0, first = true;
    while (rendered < canvas.height) {
      const sliceH = Math.min(pxPageH, canvas.height - rendered);
      const tmp = document.createElement('canvas');
      tmp.width = canvas.width; tmp.height = Math.ceil(sliceH);
      const ctx = tmp.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, tmp.width, tmp.height);
      ctx.drawImage(canvas, 0, rendered, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
      const img = tmp.toDataURL('image/jpeg', 0.92);
      if (!first) pdf.addPage();
      const h = imgW * sliceH / canvas.width;
      pdf.addImage(img, 'JPEG', margin, margin, imgW, h);
      rendered += sliceH; first = false;
    }
  }
  // 回退：CDN 不可用时打开一个打印友好页，用户可 Ctrl+P 另存为 PDF
  function openPrintFriendly(words, name) {
    const rows = words.map((w) => `<tr><td>${escapeHtml(w.en)}</td><td>${escapeHtml(w.zh)}</td></tr>`).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>单词PK错题本</title>
<style>
  body{font-family:'Microsoft YaHei',sans-serif;padding:24px;color:#111}
  h2{text-align:center;margin:0 0 6px} .sub{text-align:center;color:#666;margin-bottom:16px}
  table{width:80%;margin:0 auto;border-collapse:collapse;font-size:15px}
  th,td{border:1px solid #ccc;padding:9px 12px;text-align:center}
  th{background:#f2f4fb}
</style></head><body>
<h2>单词PK · 我的错题本</h2>
<div class="sub">玩家：${escapeHtml(name)}　日期：${new Date().toLocaleDateString('zh-CN')}</div>
<table><thead><tr><th>英文</th><th>中文</th></tr></thead><tbody>${rows}</tbody></table>
<script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script>
</body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); toast('已打开打印页，可另存为 PDF'); }
    else toast('导出失败：浏览器拦截了弹窗，请允许弹窗');
  }
  // ===================== 音频引擎（Web Audio 程序化，无外部文件） =====================
  // 包含：轻快循环背景音乐 + 点击音 + 答对/答错反馈音；不支持的环境自动忽略。
  const Sound = (function () {
    let ctx = null, master = null, musicGain = null, sfxGain = null;
    let bgmOn = false, bgmTimer = null, step = 0, nextTime = 0;
    const TEMPO = 120;                       // BPM
    const STEP = 60 / TEMPO / 2;             // 八分音符时长(秒)
    // 16 步主旋律（C 大调轻快，0 = 休止）
    const MEL  = [523.25, 659.25, 783.99, 659.25, 587.33, 698.46, 880.00, 698.46,
                  523.25, 659.25, 783.99, 1046.5, 880.00, 783.99, 659.25, 0];
    // 低音（每 4 步一个根音：C D E D）
    const BASS = [130.81, 0, 0, 0, 146.83, 0, 0, 0, 164.81, 0, 0, 0, 146.83, 0, 130.81, 0];

    function ensure() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
        master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
        musicGain = ctx.createGain(); musicGain.gain.value = 0.5; musicGain.connect(master);
        sfxGain = ctx.createGain(); sfxGain.gain.value = 1.0; sfxGain.connect(master);
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    function tone(freq, start, dur, type, vol, dest) {
      if (!ctx || !freq) return;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, start);
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(vol, start + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      o.connect(g); g.connect(dest || sfxGain);
      o.start(start); o.stop(start + dur + 0.03);
    }
    function noiseHit(start, dur, vol) {
      if (!ctx) return;
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource(); src.buffer = buf;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000;
      const g = ctx.createGain(); g.gain.value = vol;
      src.connect(hp); hp.connect(g); g.connect(musicGain);
      src.start(start);
    }
    function schedule() {
      if (!bgmOn || !ctx) return;
      if (ctx.state !== 'running') { bgmTimer = setTimeout(schedule, 60); return; } // ctx 挂起时不调度，避免基于冻结时钟的错误排程
      while (nextTime < ctx.currentTime + 0.15) {
        const i = step % MEL.length;
        const t = nextTime;
        tone(MEL[i], t, STEP * 0.92, 'triangle', 0.18, musicGain);          // 主旋律
        if (BASS[i]) tone(BASS[i], t, STEP * 1.8, 'sawtooth', 0.12, musicGain); // 低音
        if (i % 2 === 0) noiseHit(t, 0.04, 0.06);                          // 轻 hi-hat
        if (i % 4 === 0) tone(98, t, 0.10, 'square', 0.10, musicGain);      // kick 低频
        step++; nextTime += STEP;
      }
      bgmTimer = setTimeout(schedule, 25);
    }
    function startBGM() {
      if (!ensure()) return;
      if (bgmOn) return;
      bgmOn = true; step = 0; nextTime = ctx.currentTime + 0.08;
      schedule();
    }
    function stopBGM() {
      bgmOn = false;
      if (bgmTimer) { clearTimeout(bgmTimer); bgmTimer = null; }
    }
    function toggle() { if (bgmOn) stopBGM(); else startBGM(); return bgmOn; }
    function isOn() { return bgmOn; }
    // 播放前若 ctx 处于 suspended（首次/切后台回来/微信未解锁），先 resume 再发声，避免首声丢失
    function withCtx(fn) {
      if (!ensure()) return;
      if (ctx.state === 'suspended') {
        try {
          ctx.resume().then(() => { if (ctx.state === 'running') fn(); });
        } catch (_) { fn(); }
      } else { fn(); }
    }
    // 点击轻响
    function playTap() {
      withCtx(() => tone(330, ctx.currentTime, 0.12, 'triangle', 0.16, sfxGain));
    }
    // 答对：明亮上行琶音 (C5 E5 G5 C6)
    function playCorrect() {
      withCtx(() => {
        const t = ctx.currentTime;
        [523.25, 659.25, 783.99, 1046.5].forEach((f, k) =>
          tone(f, t + k * 0.075, 0.20, 'triangle', 0.26, sfxGain));
      });
    }
    // 答错：低沉下行 + 闷响 (G4 → Eb4，叠加 C3 低音)
    function playWrong() {
      withCtx(() => {
        const t = ctx.currentTime;
        tone(392.00, t, 0.20, 'sawtooth', 0.20, sfxGain);       // G4
        tone(311.13, t + 0.13, 0.34, 'sawtooth', 0.20, sfxGain); // Eb4
        tone(130.81, t + 0.05, 0.40, 'square', 0.12, sfxGain);   // C3 低沉根音
      });
    }
    let wantBGM = true; // 用户是否希望播放 BGM（退出重进/键盘选择都能据此续播）
    function setDesired(b) { wantBGM = !!b; }
    function isDesired() { return wantBGM; }
    function resync() {
      // BGM 已在播但播放头落后于真实时钟（ctx 曾被挂起后恢复），重新对齐避免一次性补播爆音
      if (bgmOn && ctx && ctx.state === 'running' && nextTime < ctx.currentTime) nextTime = ctx.currentTime + 0.08;
    }
    function ensureMusicIfDesired() {
      if (!wantBGM) { if (bgmOn) stopBGM(); return; }
      ensure();
      if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch (_) {} }
      if (wantBGM && !bgmOn) startBGM();
      else resync();
    }
    function resumeCtx() { ensure(); }
    return { ensure, resumeCtx, startBGM, stopBGM, toggle, isOn, isDesired, setDesired, ensureMusicIfDesired, playTap, playCorrect, playWrong };
  })();

  // ===================== 排行榜 =====================
  function openLeaderboard() {
    show('screen-leaderboard');
    send({ type: 'getLeaderboard' });
  }
  function renderLeaderboard(list) {
    const body = $('#lbBody');
    body.innerHTML = '';
    $('#lbEmpty').style.display = (list && list.length) ? 'none' : 'block';
    (list || []).slice(0, 20).forEach((e) => {
      const tr = document.createElement('tr');
      if (e.name === me.name) tr.className = 'me';
      const avg = e.correct > 0 ? (e.time / e.correct / 1000).toFixed(1) + 's' : '-';
      tr.innerHTML = `<td>${e.rank}</td><td>${escapeHtml(e.name)}</td><td>${e.score}</td><td>${e.wins}/${e.games}</td><td>${avg}</td>`;
      body.appendChild(tr);
    });
  }

  // ===================== 工具 =====================
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ===================== 预设词库（服务端动态加载） =====================
  let presetBanks = [];
  function loadPresets() {
    fetch('/api/presets' + (location.search || ''))
      .then((r) => r.json())
      .then((d) => { presetBanks = (d && d.banks) || []; renderPresetButtons(); })
      .catch(() => { presetBanks = []; renderPresetButtons(); });
  }
  function renderPresetButtons() {
    const row = $('#presetRow');
    if (!row) return;
    row.innerHTML = '';
    const banks = presetBanks.length ? presetBanks : [
      { id: 'cet', name: '四六级示例', words: parseWords(PRESET_CET).words, note: '' },
      { id: 'ielts', name: '雅思示例', words: parseWords(PRESET_IELTS).words, note: '' },
      { id: 'kaoyan', name: '考研·红宝书', words: parseWords(TMPL_KAOYAN).words, note: '请粘贴你的红宝书词表' }
    ];
    banks.forEach((b) => {
      const hasWords = b.words && b.words.length;
      const btn = document.createElement('button');
      btn.className = 'preset';
      btn.textContent = b.name;
      btn.title = b.note || '';
      btn.addEventListener('click', () => {
        if (hasWords) {
          $('#wordsInput').value = b.words.map((w) => w.en + ',' + w.zh).join('\n');
          refreshParseInfo();
          toast('已载入「' + b.name + '」，可直接修改');
        } else {
          $('#wordsInput').value = '';
          refreshParseInfo();
          toast(b.note || '该词库暂无内容，请在后台添加');
        }
      });
      row.appendChild(btn);
    });
  }

  // ===================== 事件绑定 =====================
  function bind() {
    $('#btnGoCreate').addEventListener('click', () => show('screen-create'));
    $('#btnGoJoin').addEventListener('click', () => show('screen-join'));
    $('#btnCreateBack').addEventListener('click', () => show('screen-home'));
    $('#btnJoinBack').addEventListener('click', () => show('screen-home'));
    $('#btnGoLb').addEventListener('click', openLeaderboard);
    $('#btnAdmin').addEventListener('click', () => window.open('/admin' + location.search, '_blank'));
    $('#btnLbBack').addEventListener('click', () => show('screen-home'));
    $('#btnLbHome').addEventListener('click', () => show('screen-home'));
    $('#btnViewLb').addEventListener('click', openLeaderboard);
    $('#wordsInput').addEventListener('input', refreshParseInfo);
    $('#fileInput').addEventListener('change', async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const txt = await readFileText(f);
        const cur = $('#wordsInput').value.trim();
        $('#wordsInput').value = (cur ? cur + '\n' : '') + txt;
        refreshParseInfo();
        toast('已导入：' + f.name);
      } catch (err) {
        toast(err.message || '文件读取失败');
      }
    });
    // 预设词库（从服务端 /api/presets 动态渲染，失败回退到内置示例）
    loadPresets();
    $('#btnCreate').addEventListener('click', doCreate);
    $('#btnJoin').addEventListener('click', doJoin);
    $('#btnCopy').addEventListener('click', copyLink);
    $('#btnWaitBack').addEventListener('click', () => { send({ type: 'leave' }); show('screen-home'); });
    $('#btnStart').addEventListener('click', () => send({ type: 'start' }));
    $('#btnOverHome').addEventListener('click', () => { send({ type: 'leave' }); show('screen-home'); });
    $('#btnAgain').addEventListener('click', () => send({ type: 'start' }));
    $('#btnExportWord').addEventListener('click', exportWrongToPdf);

    // 键盘 1-4 选答案
    document.addEventListener('keydown', (e) => {
      if (!$('#screen-game').classList.contains('active')) return;
      if (['1', '2', '3', '4'].includes(e.key)) {
        const i = parseInt(e.key) - 1;
        if (game.cur && i < game.cur.options.length) choose(i);
      }
    });

    // ===== 背景音乐开关 =====
    const btnMusic = $('#btnMusic');
    const wantMusic = localStorage.getItem('wordpk_music');
    const prefOn = (wantMusic === null) ? true : (wantMusic === 'on'); // 默认开启
    Sound.setDesired(prefOn);
    function syncMusicBtn() {
      const on = Sound.isOn();
      // 开启但未真正播放时显示「🔈 音乐」提示用户点一下页面即可开始
      btnMusic.textContent = on ? '🔊 音乐' : (prefOn ? '🔈 音乐' : '🔇 音乐');
      btnMusic.classList.toggle('on', on);
    }
    btnMusic.addEventListener('click', (e) => {
      e.stopPropagation();
      Sound.setDesired(!Sound.isOn());
      if (Sound.isDesired()) { Sound.ensure(); Sound.resumeCtx(); Sound.startBGM(); }
      else Sound.stopBGM();
      localStorage.setItem('wordpk_music', Sound.isDesired() ? 'on' : 'off');
      syncMusicBtn();
    });
    // 持续监听用户手势：每次交互都尝试解锁并续播 BGM（幂等）。
    // 关键修复：之前是“首次手势后移除监听”，导致创建/加入房间的那次点击误把 bgmOn 设 true 但未真正出声，
    // 进入对战后监听器已移除、再无人 startBGM，全程静音。改为持续监听后，对战内任意点击都能恢复播放。
    function keepBGMAlive(e) {
      if (e && e.target && e.target.closest && e.target.closest('#btnMusic')) return; // 交给按钮自身处理
      Sound.resumeCtx(); Sound.ensureMusicIfDesired(); syncMusicBtn();
    }
    ['pointerdown', 'touchstart', 'click'].forEach((ev) => document.addEventListener(ev, keepBGMAlive));
    // 微信内置浏览器：必须在 WeixinJSBridgeReady 之后才能解锁音频
    function wxUnlock() {
      Sound.ensure(); Sound.resumeCtx();
      try { if (window.WeixinJSBridge) window.WeixinJSBridge.invoke('getNetworkType', {}, () => {}); } catch (_) {}
      if (Sound.isDesired() && !Sound.isOn()) Sound.ensureMusicIfDesired();
      syncMusicBtn();
    }
    if (typeof window.WeixinJSBridge !== 'undefined') {
      try { window.WeixinJSBridge.invoke('getNetworkType', {}, wxUnlock); } catch (_) { wxUnlock(); }
    } else {
      document.addEventListener('WeixinJSBridgeReady', wxUnlock, false);
    }
    // 切后台再回来：恢复音频上下文并续播 BGM（解决退出重进/切应用后没声音）
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        Sound.resumeCtx();
        if (Sound.isDesired() && !Sound.isOn()) Sound.ensureMusicIfDesired();
        syncMusicBtn();
      }
    });
    syncMusicBtn();
  }

  // ===================== 启动 =====================
  bind();
  const params = new URLSearchParams(location.search);
  const preRoom = params.get('room');
  if (preRoom) {
    $('#joinRoom').value = preRoom;
    show('screen-join');
  }
  connect();
})();
