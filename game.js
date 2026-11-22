/* =========================================================
   奶蛙保龄球 · game.js
   ---------------------------------------------------------
   结构（从上往下）：
     1. 常量与工具
     2. 伪 3D 投影：把"米"换算成屏幕上的像素
     3. 画布 / 图片 / 状态
     4. 球瓶（奶蛙罐子）与球
     5. 输入（鼠标 / 触摸 / 键盘）
     6. 回合流程 + 标准十格计分
     7. 物理更新
     8. 绘制（墙、球道、瓶、球、奶蛙、HUD）
     9. 主循环

   坐标系说明：
     球道用"米"当单位：x 横向（0 = 中线，左负右正），z 纵向（0 = 罚球线，19 米处是瓶）。
     屏幕上看到的一切都是 project(x, z) 算出来的，物理只在米空间里算。
   ========================================================= */
(function () {
  'use strict';

  window.__GAME_BOOTED__ = true;

  // 版本号：改功能时跟着改，页面和脚本对不上就能立刻发现
  const VERSION = '3.0';
  // 数据结构版本：和老版本不兼容时改它，会清一次旧的最高分/排行榜
  const DATA_VERSION = '2.3';

  /* ---------------- 1. 常量与工具 ---------------- */

  const W = 480;
  const H = 720;

  const NEAR_Y = 700;          // z = 0（罚球线）在屏幕上的 y
  const FAR_Y = 300;           // z = 20m（球道尽头）在屏幕上的 y
  const LANE = { len: 20, halfW: 0.53, pinZ: 18.29 };

  const PERS = 1.9;            // 透视强度：越大，远处缩得越狠
  const BALL_R = 0.109;        // 球半径（米）
  const BALL_DECEL = 0.9;      // 滚动阻力（m/s²）：力度不够的球会在半路停下
  const AIM_RANGE = 0.42;      // 瞄准指针左右摆动的幅度（米，瓶线处）
  const AIM_SPEED = 1.35;      // 指针摆动快慢
  const PIN_R = 0.062;         // 瓶半径（米）
  const PIN_H = 0.50;          // 瓶在屏幕上的高度（米，视觉值，比真实瓶夸张一点更好看）

  // 球瓶的帧列表：从你录的视频里抽出来的"拍肚皮"循环（14 帧，约 7.5fps）
  const PIN_FRAME_FILES = [
    'assets/pins/pin-00.png', 'assets/pins/pin-01.png', 'assets/pins/pin-02.png',
    'assets/pins/pin-03.png', 'assets/pins/pin-04.png', 'assets/pins/pin-05.png',
    'assets/pins/pin-06.png', 'assets/pins/pin-07.png', 'assets/pins/pin-08.png',
    'assets/pins/pin-09.png', 'assets/pins/pin-10.png', 'assets/pins/pin-11.png',
    'assets/pins/pin-12.png', 'assets/pins/pin-13.png'
  ];

  // 奶蛙的帧列表。同理：以后要是拿到真正的投球序列帧，按顺序列在这里，
  // 投球动画就会自动从"变形拉伸"切换成"逐帧播放"。
  const FROG_FRAME_FILES = ['assets/frog.png'];

  // 投球音效：从你给的四段视频里抽出来的音轨，每次投球随机挑一段
  const AUDIO_FILES = [
    'assets/audio/throw-0.wav', 'assets/audio/throw-1.wav',
    'assets/audio/throw-2.wav', 'assets/audio/throw-3.wav'
  ];

  // 全中之后：奶蛙本人变成"捧腹大笑"的序列帧（从视频里抠出来的 30 帧）
  const LAUGH_FRAME_FILES = [
    'assets/frog-laugh/laugh-00.png', 'assets/frog-laugh/laugh-01.png',
    'assets/frog-laugh/laugh-02.png', 'assets/frog-laugh/laugh-03.png',
    'assets/frog-laugh/laugh-04.png', 'assets/frog-laugh/laugh-05.png',
    'assets/frog-laugh/laugh-06.png', 'assets/frog-laugh/laugh-07.png',
    'assets/frog-laugh/laugh-08.png', 'assets/frog-laugh/laugh-09.png',
    'assets/frog-laugh/laugh-10.png', 'assets/frog-laugh/laugh-11.png',
    'assets/frog-laugh/laugh-12.png', 'assets/frog-laugh/laugh-13.png',
    'assets/frog-laugh/laugh-14.png', 'assets/frog-laugh/laugh-15.png',
    'assets/frog-laugh/laugh-16.png', 'assets/frog-laugh/laugh-17.png',
    'assets/frog-laugh/laugh-18.png', 'assets/frog-laugh/laugh-19.png',
    'assets/frog-laugh/laugh-20.png', 'assets/frog-laugh/laugh-21.png',
    'assets/frog-laugh/laugh-22.png', 'assets/frog-laugh/laugh-23.png',
    'assets/frog-laugh/laugh-24.png', 'assets/frog-laugh/laugh-25.png',
    'assets/frog-laugh/laugh-26.png', 'assets/frog-laugh/laugh-27.png',
    'assets/frog-laugh/laugh-28.png', 'assets/frog-laugh/laugh-29.png'
  ];

  // 笑的时候放的声音（视频原声）
  const LAUGH_AUDIO = 'assets/audio/laugh.wav';

  // 背景音乐：循环播放，结算界面不放
  const BGM_FILE = 'assets/audio/bgm.wav';

  // 背景图（下标 0 = 默认渐变，不加载图片；其余对应 assets/bg/*.png）
  const BG_NAMES = ['默认', '球馆', '森林', '海洋', '天空', '城市', '雪地'];
  const BG_FILES = [null,
    'assets/bg/alley.png', 'assets/bg/forest.png', 'assets/bg/ocean.png',
    'assets/bg/sky.png', 'assets/bg/city.png', 'assets/bg/snow.png'];

  // 破纪录小窗：96 帧拼成一张精灵图（12 列 × 8 行），减少请求数
  const REC_FRAME_COUNT = 96;
  const REC_SHEET = 'assets/record-sheet.jpg';
  const REC_COLS = 12;
  const REC_AUDIO = 'assets/audio/record.wav';

  // 撞瓶音效：代码合成的"坚果撞僵尸"式闷响（3 个变体随机播）
  const HIT_AUDIO = [
    'assets/audio/hit-0.wav', 'assets/audio/hit-1.wav', 'assets/audio/hit-2.wav'
  ];

  // 十个瓶的位置（x, z 相对首瓶的偏移），标准三角阵
  const PIN_SPOTS = [
    [0, 0],
    [-0.1525, 0.264], [0.1525, 0.264],
    [-0.305, 0.528], [0, 0.528], [0.305, 0.528],
    [-0.4575, 0.792], [-0.1525, 0.792], [0.1525, 0.792], [0.4575, 0.792]
  ].map(function (p) {
    return { x: p[0], z: LANE.pinZ + p[1] };
  });

  const clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  const rand = function (a, b) { return a + Math.random() * (b - a); };

  /* ---------------- 2. 伪 3D 投影 ---------------- */

  // s = 深度缩放系数：z=0 时 1，越远越小（1/(1+k) 是针孔相机的形式）
  function scaleAt(z) { return 1 / (1 + PERS * z / LANE.len); }

  const S_FAR = scaleAt(LANE.len);

  // 屏幕上每米对应多少像素（近处 311px/m，远处按 s 缩）
  function pxPerM(s) { return 311 * s; }

  // y 也随 s 线性变化，这样直线在屏幕上还是直线
  function yAt(s) { return NEAR_Y + (FAR_Y - NEAR_Y) * (1 - s) / (1 - S_FAR); }

  function project(x, z) {
    const s = scaleAt(z);
    return { x: W / 2 + x * pxPerM(s), y: yAt(s), s: s };
  }

  /* ---------------- 3. 画布 / 图片 / 状态 ---------------- */

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  const IMG = { frogFrames: [], ball: null, laughFrames: [], recSheet: null, bgs: [] };
  const PIN_IMGS = [];

  // 单文件版会把图片以 data:URI 的形式塞进 window.__ASSETS，
  // 这样即使页面被放在"读不到同目录文件"的地方（比如聊天窗口的预览）也能玩。
  const ASSET = (typeof window !== 'undefined' && window.__ASSETS) || {};

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      const im = new Image();
      im.onload = function () { resolve(im); };
      im.onerror = function () {
        const pageUrl = (typeof location !== 'undefined' ? location.href : '?');
        // 在聊天窗口的"预览"里打开时，页面地址是 blob:/about:，天然读不到同目录文件
        const inPreview = /^(blob:|about:|data:)/.test(pageUrl);
        reject(new Error(
          '图片加载失败：' + src +
          '\n它被解析成：' + im.src +
          '\n页面地址：' + pageUrl +
          '\n\n' + (inPreview
            ? '你现在是在「应用内预览」里打开的（地址以 blob: 开头），\n' +
              '这种页面读不到同目录的 assets/。\n' +
              '请到文件夹里双击 index.html，或者直接双击桌面上的「奶蛙保龄球.html」。'
            : '页面读不到和它同一个文件夹里的 assets/。\n' +
              '请确认 assets 文件夹没有被移动或改名。')
        ));
      };
      im.src = src;
    });
  }

  /* ---- 资源加载：先加载"能开玩"的，剩下的后台补 ---- */

  let loadDone = 0;
  let loadTotal = 0;

  function bumpProgress() {
    loadDone += 1;
    const btn = document.getElementById('startBtn');
    if (btn && btn.disabled && loadDone < loadTotal) {
      btn.textContent = '载入中… ' + loadDone + '/' + loadTotal;
    }
  }

  function loadList(list) {
    loadTotal += list.length;
    return Promise.all(list.map(function (item) {
      return loadImage(item.src).then(function (im) {
        item.store(im);
        bumpProgress();
        return im;
      });
    }));
  }

  // 开局必须的：球、奶蛙、球瓶（很小，加起来几百 KB）
  function essentialJobs() {
    const jobs = [{
      src: ASSET.ball || 'assets/ball.png',
      store: function (im) { IMG.ball = im; }
    }];
    FROG_FRAME_FILES.forEach(function (src, i) {
      jobs.push({
        src: (ASSET.frogFrames && ASSET.frogFrames[i]) || src,
        store: function (im) { IMG.frogFrames[i] = im; }
      });
    });
    PIN_FRAME_FILES.forEach(function (src, i) {
      jobs.push({
        src: (ASSET.pins && ASSET.pins[i]) || src,
        store: function (im) { PIN_IMGS[i] = im; }
      });
    });
    return jobs;
  }

  // 只有全中/破纪录才用得到：可以等玩起来再慢慢加载
  function deferredJobs() {
    const jobs = [];
    LAUGH_FRAME_FILES.forEach(function (src, i) {
      jobs.push({
        src: (ASSET.laughFrames && ASSET.laughFrames[i]) || src,
        store: function (im) { IMG.laughFrames[i] = im; }
      });
    });
    jobs.push({
      src: ASSET.recSheet || REC_SHEET,
      store: function (im) { IMG.recSheet = im; }
    });
    // 背景图也不挡开局，后台慢慢加载
    BG_FILES.forEach(function (src, i) {
      if (!src) return;
      jobs.push({
        src: (ASSET.bgs && ASSET.bgs[i]) || src,
        store: function (im) { IMG.bgs[i] = im; }
      });
    });
    return jobs;
  }

  // 音效：用 Audio 元素预加载，投球时随机挑一段播放
  const SFX = [];
  const HIT_SFX = [];          // 撞瓶音效的"模板"元素，播放时克隆
  let laughAudio = null;      // 全中庆祝那段
  let bgmAudio = null;        // 背景音乐
  let recAudio = null;        // 破纪录小窗的声音

  /* ---- 音量：分五类，各自独立，存在本地 ---- */

  const VOL_KEYS = ['bgm', 'throw', 'hit', 'laugh', 'record'];
  const VOL_DEFAULT = { bgm: 0.42, throw: 0.9, hit: 0.8, laugh: 0.95, record: 0.8 };
  const VOL_SLIDERS = {
    volBgm: 'bgm', volThrow: 'throw', volHit: 'hit', volLaugh: 'laugh', volRecord: 'record'
  };
  let VOL = { bgm: VOL_DEFAULT.bgm, throw: VOL_DEFAULT.throw, hit: VOL_DEFAULT.hit,
              laugh: VOL_DEFAULT.laugh, record: VOL_DEFAULT.record };

  function loadVolumes() {
    try {
      const raw = localStorage.getItem('frog_vol');
      if (!raw) return;
      const o = JSON.parse(raw);
      VOL_KEYS.forEach(function (k) {
        if (typeof o[k] === 'number') VOL[k] = clamp(o[k], 0, 1);
      });
    } catch (e) { /* 忽略 */ }
  }
  function saveVolumes() {
    try { localStorage.setItem('frog_vol', JSON.stringify(VOL)); } catch (e) { /* 忽略 */ }
  }

  // 把当前音量应用到所有声音对象，并同步滑块显示
  function applyVolumes() {
    if (bgmAudio) bgmAudio.volume = VOL.bgm;
    if (laughAudio) laughAudio.volume = VOL.laugh;
    if (recAudio) recAudio.volume = VOL.record;
    for (const a of SFX) a.volume = VOL.throw;
    for (const a of HIT_SFX) a.volume = VOL.hit;

    Object.keys(VOL_SLIDERS).forEach(function (id) {
      const el = document.getElementById(id);
      const out = document.getElementById(id + 'Val');
      const v = Math.round(VOL[VOL_SLIDERS[id]] * 100);
      if (el && document.activeElement !== el) el.value = v;
      if (out) out.textContent = v;
    });
  }

  function loadSounds() {
    for (let i = 0; i < AUDIO_FILES.length; i++) {
      const src = (ASSET.audio && ASSET.audio[i]) || AUDIO_FILES[i];
      const a = new Audio(src);
      a.preload = 'auto';
      SFX.push(a);
    }
    laughAudio = new Audio(ASSET.laughAudio || LAUGH_AUDIO);
    laughAudio.preload = 'auto';

    bgmAudio = new Audio(ASSET.bgm || BGM_FILE);
    bgmAudio.preload = 'auto';
    bgmAudio.loop = true;

    recAudio = new Audio(ASSET.recordAudio || REC_AUDIO);
    recAudio.preload = 'auto';
    recAudio.loop = true;

    for (let i = 0; i < HIT_AUDIO.length; i++) {
      const src = (ASSET.hitAudio && ASSET.hitAudio[i]) || HIT_AUDIO[i];
      const a = new Audio(src);
      a.preload = 'auto';
      HIT_SFX.push(a);
    }

    applyVolumes();
  }

  // 撞瓶声：音高/音量跟撞击力度走，并且限流（十只瓶一起撞时不能糊成噪音）
  function playHitSound(strength) {
    if (G.muted || HIT_SFX.length === 0) return;
    if (G.t - G.lastHitAt < 0.045) return;        // 45ms 内只响一次
    if (G.hitsThisRoll >= 12) return;             // 一球最多 12 声
    G.lastHitAt = G.t;
    G.hitsThisRoll += 1;

    const tpl = HIT_SFX[Math.floor(Math.random() * HIT_SFX.length)];
    const a = tpl.cloneNode();                    // 克隆才能叠着响
    a.volume = Math.min(1, VOL.hit * (0.4 + strength * 0.06));
    a.playbackRate = 0.9 + Math.random() * 0.22;
    a.loop = false;
    const p = a.play();
    if (p && p.catch) p.catch(function () {});
  }

  // 背景音乐：只在游戏中循环，结算界面停掉
  function playBgm() {
    if (!bgmAudio || G.muted) return;
    bgmAudio.muted = false;
    const p = bgmAudio.play();
    if (p && p.catch) p.catch(function () {});     // 自动播放被拒 → 等用户下一次操作
  }

  function stopBgm() {
    if (!bgmAudio) return;
    try { bgmAudio.pause(); bgmAudio.currentTime = 0; } catch (e) { /* 忽略 */ }
  }

  function playThrowSound() {
    if (G.muted || SFX.length === 0) return;
    // 先把上一段停掉，免得连投时声音叠在一起
    for (const a of SFX) {
      try { a.pause(); a.currentTime = 0; } catch (e) { /* 忽略 */ }
    }
    const pick = SFX[Math.floor(Math.random() * SFX.length)];
    pick.volume = VOL.throw;
    pick.currentTime = 0;
    const p = pick.play();
    // 浏览器可能因为自动播放策略拒绝；用户点击投球算手势，通常没问题
    if (p && p.catch) p.catch(function () {});
  }

  const G = {
    mode: 'title',        // title | aim | throw | over
    t: 0,
    shake: 0,

    frame: 1,             // 当前第几格（1~10）
    ballNo: 1,            // 当前是这一格的第几球
    frames: [[], [], [], [], [], [], [], [], [], []],   // 每格已投的击倒数
    pins: [],
    rackStanding: 10,     // 这一球开始时还立着几个瓶

    ball: null,
    aimX: 0,              // 瞄准点在瓶线的横向偏移（米）
    aimLocked: false,     // 方向是否已经锁定（锁定后才能蓄力）
    power: 0,             // 0~1
    powerT: 0,
    charging: false,
    frogAnim: 1,          // 投球动作进度 0~1（1 = 站着不动）

    settleT: 0,
    message: '',
    messageT: 0,
    total: 0,
    muted: false,          // 由设置面板 / M 键切换
    laughEnabled: true,    // 全中是否播放"大笑"庆祝
    best: 0,               // 历史最高分
    record: false,         // 这一局是不是破了纪录
    clipT: 0,              // 破纪录小窗的播放进度
    lastHitAt: -9,         // 上次撞瓶声的时间（限流用）
    hitsThisRoll: 0,       // 这一球已经响了几声
    laughing: false,       // 正在捧腹大笑
    laughT: 0,             // 笑的动画计时
    laughEnd: null,        // 提前结束（点一下/按空格跳过）
    laughTimer: 0,
    frameBonus: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],  // 每格从闪光奶鱼拿到的加分
    shiny: -1,             // 这一球哪只瓶是闪光奶鱼（-1 = 没有）
    shinyHit: false,       // 这一球有没有打中闪光奶鱼
    shinyFx: 0,            // 打中时的爆炸特效计时
    bg: 0,                 // 当前背景（0 = 默认）
    paused: false          // 设置框打开时暂停
  };

  /* ---------------- 4. 瓶与球 ---------------- */

  function makePins() {
    G.pins = PIN_SPOTS.map(function (p, i) {
      return {
        i: i, x0: p.x, z0: p.z,
        x: p.x, z: p.z,
        row: Math.round((p.z - LANE.pinZ) / 0.264),   // 第几排（0~3），用来做视觉上的纵深
        standing: true,
        vx: 0, vz: 0,
        fall: 0,          // 倒下进度 0~1
        dir: 1,           // 往哪边倒
        pop: 1,           // 重新摆瓶时的出现动画
        vanish: null,     // 这一球结束后倒下的瓶淡出（0~1），避免"躺在地上抽"
        gone: false       // 已经不在场上了
      };
    });
  }

  function resetRack(instant) {
    for (const p of G.pins) {
      p.x = p.x0;
      p.z = p.z0;
      p.standing = true;
      p.vx = 0;
      p.vz = 0;
      p.fall = 0;
      p.dir = 1;
      p.vanish = null;
      p.gone = false;
      p.pop = instant ? 1 : 0;
    }
  }

  // 一球结束：把倒下的瓶标记成"淡出"，不再摆在地上
  function clearFallen() {
    for (const p of G.pins) {
      if (!p.standing && !p.gone && p.vanish == null) p.vanish = 0;
    }
  }

  function standingCount() {
    let n = 0;
    for (const p of G.pins) if (p.standing) n++;
    return n;
  }

  function knockPin(p, vx, vz, dir) {
    if (!p.standing) return;
    p.standing = false;
    p.vx = vx;
    p.vz = vz;
    p.dir = dir >= 0 ? 1 : -1;
    p.fall = 0;
    G.shake = Math.min(9, G.shake + 5);
    playHitSound(Math.min(10, Math.hypot(vx, vz)));

    // 打倒闪光奶鱼：这一格 +5 分
    if (p.i === G.shiny) {
      G.shiny = -1;
      G.shinyHit = true;
      G.shinyFx = 1.1;
      G.frameBonus[G.frame - 1] += 5;
    }
  }

  /* ---------------- 5. 输入 ---------------- */

  // 按住：指针立刻停住（方向锁定）+ 蓄力条开始跑；松开就投。
  function beginThrowCharge() {
    if (G.mode !== 'aim' || G.charging) return;
    G.aimLocked = true;       // 指针停在按下的那一刻
    startCharge();
  }

  canvas.addEventListener('pointerdown', function (e) {
    // 笑的时候点一下屏幕就跳过
    if (G.mode === 'celebrate') {
      if (G.laughEnd) G.laughEnd();
      return;
    }
    if (G.mode !== 'aim') return;
    if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
    beginThrowCharge();
  });

  window.addEventListener('pointerup', function () {
    if (G.mode === 'aim' && G.charging) releaseThrow();
  });

  canvas.addEventListener('pointercancel', function () {
    if (G.mode === 'aim' && G.charging) releaseThrow();
  });

  window.addEventListener('keydown', function (e) {
    const k = e.key.toLowerCase();
    if (k === ' ' || k === 'enter') e.preventDefault();
    if (k === 'escape') { closeSettings(); return; }

    if (G.mode === 'aim' && k === ' ' && !e.repeat) beginThrowCharge();
    if ((k === ' ' || k === 'enter') && G.mode === 'title') startGame();
    if ((k === ' ' || k === 'enter') && G.mode === 'over') startGame();
    if ((k === ' ' || k === 'enter') && G.mode === 'celebrate' && G.laughEnd) G.laughEnd();
    if (k === 'm') toggleMute();
  });

  window.addEventListener('keyup', function (e) {
    if (e.key.toLowerCase() === ' ' && G.mode === 'aim' && G.charging) releaseThrow();
  });

  /* ---------------- 6. 回合流程 ---------------- */

  const boardEl = document.getElementById('board');

  // 设置记在本地，下次打开还是上次的选择
  function loadMuted() {
    try { return localStorage.getItem('frog_muted') === '1'; } catch (e) { return false; }
  }
  function saveMuted(v) {
    try { localStorage.setItem('frog_muted', v ? '1' : '0'); } catch (e) { /* 忽略 */ }
  }
  function loadLaughEnabled() {
    try { return localStorage.getItem('frog_laugh') !== '0'; } catch (e) { return true; }
  }
  function saveLaughEnabled(v) {
    try { localStorage.setItem('frog_laugh', v ? '1' : '0'); } catch (e) { /* 忽略 */ }
  }

  // 选中的背景
  function loadBg() {
    try {
      const v = Number(localStorage.getItem('frog_bg')) || 0;
      return Math.max(0, Math.min(BG_NAMES.length - 1, v));
    } catch (e) { return 0; }
  }
  function saveBg(v) {
    try { localStorage.setItem('frog_bg', String(v)); } catch (e) { /* 忽略 */ }
  }

  // 设置面板里的背景选择器
  function buildBgPicker() {
    const box = document.getElementById('bgPicker');
    if (!box) return;
    box.innerHTML = '';
    BG_NAMES.forEach(function (name, i) {
      const b = document.createElement('button');
      b.className = 'bg-chip' + (i === G.bg ? ' on' : '');
      b.textContent = name;
      b.addEventListener('click', function () {
        G.bg = i;
        saveBg(i);
        const chips = box.querySelectorAll('.bg-chip');
        for (let k = 0; k < chips.length; k++) {
          chips[k].classList.toggle('on', k === i);
        }
      });
      box.appendChild(b);
    });
  }

  // 打开设置 = 暂停；叉掉 = 继续
  function openSettings() {
    const panel = document.getElementById('settings');
    if (!panel) return;
    panel.classList.remove('hidden');
    G.paused = true;
    hideGearHint();
  }
  function closeSettings() {
    const panel = document.getElementById('settings');
    if (panel) panel.classList.add('hidden');
    G.paused = false;
  }
  function hideGearHint() {
    const h = document.getElementById('gearHint');
    if (h) h.classList.add('hidden');
    try { localStorage.setItem('frog_hint_seen', '1'); } catch (e) { /* 忽略 */ }
  }
  // 第一次玩的时候指一下齿轮
  function maybeShowGearHint() {
    let seen = true;
    try { seen = localStorage.getItem('frog_hint_seen') === '1'; } catch (e) { /* 忽略 */ }
    if (seen) return;
    const h = document.getElementById('gearHint');
    if (!h) return;
    h.classList.remove('hidden');
    setTimeout(hideGearHint, 9000);
  }
  function loadBest() {
    try { return Number(localStorage.getItem('frog_best')) || 0; } catch (e) { return 0; }
  }
  function saveBest(v) {
    try { localStorage.setItem('frog_best', String(v)); } catch (e) { /* 忽略 */ }
  }

  /* ---- 清空本地记录 ---- */

  // 升级到新版本时清一次旧数据（数据结构不兼容时用）
  function migrateData() {
    try {
      if (localStorage.getItem('frog_data_ver') !== DATA_VERSION) {
        localStorage.removeItem('frog_best');
        localStorage.removeItem('frog_scores');
        localStorage.setItem('frog_data_ver', DATA_VERSION);
      }
    } catch (e) { /* 忽略 */ }
  }

  // 手动清空（设置面板里的按钮）
  function clearRecords() {
    if (!window.confirm('确定清空这台设备上的最高分吗？无法恢复。')) return;
    try {
      localStorage.removeItem('frog_best');
      localStorage.removeItem('frog_scores');
    } catch (e) { /* 忽略 */ }
    G.best = 0;
    const sb = document.getElementById('startBest');
    if (sb) sb.textContent = '0';
    const bl = document.getElementById('bestLine');
    if (bl) bl.textContent = '最高分：0';
  }

  // 把开关状态同步到设置面板上的两个勾选框
  function syncSettings() {
    const s = document.getElementById('optSound');
    const l = document.getElementById('optLaugh');
    if (s) s.checked = !G.muted;
    if (l) l.checked = G.laughEnabled !== false;
  }

  function applyMuted() {
    if (G.muted) {
      for (const a of SFX) { try { a.pause(); a.currentTime = 0; } catch (e) { /* 忽略 */ } }
      if (laughAudio) {
        try { laughAudio.pause(); laughAudio.currentTime = 0; } catch (e) { /* 忽略 */ }
        laughAudio.muted = true;
      }
      if (recAudio) {
        try { recAudio.pause(); } catch (e) { /* 忽略 */ }
        recAudio.muted = true;
      }
      stopBgm();
    } else {
      if (laughAudio) laughAudio.muted = false;
      if (recAudio) {
        recAudio.muted = false;
        if (G.mode === 'over' && G.record) {
          const p = recAudio.play();
          if (p && p.catch) p.catch(function () {});
        }
      }
      if (G.mode !== 'title' && G.mode !== 'over') playBgm();   // 结算界面不放 BGM
    }
    syncSettings();
  }

  function toggleMute() {
    G.muted = !G.muted;
    saveMuted(G.muted);
    applyMuted();
  }

  function bindUI() {
    const startBtn = document.getElementById('startBtn');
    startBtn.disabled = false;                 // 资源都加载完了才允许开始
    startBtn.textContent = '开 始 比 赛';
    startBtn.addEventListener('click', startGame);
    document.getElementById('retryBtn').addEventListener('click', startGame);

    G.muted = loadMuted();
    G.laughEnabled = loadLaughEnabled();
    migrateData();
    G.best = loadBest();
    const sb = document.getElementById('startBest');
    if (sb) sb.textContent = G.best;
    const ver = document.getElementById('verLine');
    if (ver) ver.textContent = '版本 ' + VERSION;
    syncSettings();

    const gear = document.getElementById('gearBtn');
    const panel = document.getElementById('settings');
    if (gear) {
      gear.addEventListener('click', function (e) {
        e.stopPropagation();
        openSettings();
      });
    }
    if (panel) {
      // 点弹框外面也关掉
      panel.addEventListener('click', function (e) {
        if (e.target === panel) closeSettings();
      });
    }
    const closeBtn = document.getElementById('settingsClose');
    if (closeBtn) closeBtn.addEventListener('click', closeSettings);

    // 背景
    G.bg = loadBg();
    buildBgPicker();

    const optSound = document.getElementById('optSound');
    if (optSound) {
      optSound.addEventListener('change', function () {
        G.muted = !optSound.checked;
        saveMuted(G.muted);
        applyMuted();
      });
    }

    const optLaugh = document.getElementById('optLaugh');
    if (optLaugh) {
      optLaugh.addEventListener('change', function () {
        G.laughEnabled = optLaugh.checked;
        saveLaughEnabled(G.laughEnabled);
        // 正在笑的时候关掉，就立刻结束
        if (!G.laughEnabled && G.laughEnd) G.laughEnd();
      });
    }

    // 清空记录
    const clearBtn = document.getElementById('clearBestBtn');
    if (clearBtn) clearBtn.addEventListener('click', clearRecords);

    // 五个音量条
    loadVolumes();
    Object.keys(VOL_SLIDERS).forEach(function (id) {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', function () {
        VOL[VOL_SLIDERS[id]] = clamp(Number(el.value) / 100, 0, 1);
        saveVolumes();
        applyVolumes();
      });
    });
    applyVolumes();
  }

  function startGame() {
    G.frames = [[], [], [], [], [], [], [], [], [], []];
    G.frameBonus = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    G.shiny = -1;
    G.shinyHit = false;
    G.frame = 1;
    G.ballNo = 1;
    G.total = 0;
    G.ball = null;
    G.message = '';
    G.messageT = 0;
    makePins();
    pickShiny();
    G.rackStanding = 10;
    G.mode = 'aim';
    G.charging = false;
    G.power = 0;
    G.powerT = 0;
    G.record = false;
    G.clipT = 0;
    stopRecordClip();
    const clip = document.getElementById('clipBox');
    if (clip) clip.classList.add('hidden');
    document.getElementById('titleScreen').classList.add('hidden');
    document.getElementById('overScreen').classList.add('hidden');
    renderBoard();
    playBgm();               // 开局就把背景音乐放起来（循环）
  }

  function startCharge() {
    G.charging = true;
    G.powerT = 0;
    G.power = 0;
  }

  function releaseThrow() {
    if (!G.charging) return;
    G.charging = false;
    throwBall(G.power);
  }

  function throwBall(power) {
    if (G.mode !== 'aim') return;

    const p = clamp(power, 0, 1);
    // 4.0 ~ 11.6 m/s：最轻的一球会在半路停下（滚动阻力 0.9 m/s²）
    const speed = 4.0 + p * 7.6;
    const z0 = 0.8;
    const dz = LANE.pinZ - z0;
    const len = Math.hypot(G.aimX, dz);

    G.ball = {
      x: 0,
      z: z0,
      // 一点点"球道误差"：同样的操作不会每次都走同一条线，杜绝无敌点位
      vx: speed * G.aimX / len + rand(-0.055, 0.055),
      vz: speed * dz / len,
      dist: 0,
      gutter: false,
      done: false
    };
    G.rackStanding = standingCount();
    G.mode = 'throw';
    G.frogAnim = 0;          // 触发投球动作
    G.hitsThisRoll = 0;      // 撞瓶声计数归零
    playThrowSound();        // 随机播一段投球音效
    G.settleT = 0;
    G.power = 0;
    G.charging = false;
  }

  // 这一球结束：结算击倒数 → 推进格子 → 重置瓶子
  function resolveRoll() {
    const knocked = G.rackStanding - standingCount();

    G.frames[G.frame - 1].push(knocked);

    const wasStrike = knocked === 10 && G.rackStanding === 10;
    const wasSpare = !wasStrike && knocked === G.rackStanding && G.rackStanding < 10;
    const sfx = G.shinyHit ? '　闪光 +5' : '';
    if (wasStrike) showMessage('全中！+10' + sfx, '#ffd75e');
    else if (wasSpare) showMessage('补中！+10' + sfx, '#7de0ff');
    else if (knocked > 0) showMessage('+' + knocked + sfx, '#cfc6e6');
    else showMessage('这一球空了', '#9d94b8');

    G.ball = null;
    clearFallen();           // 倒下的瓶淡出，别躺在原地
    renderBoard();

    // 全中 / 补中都会让奶蛙笑一会儿，笑完再推进
    const advance = function () { advanceRoll(knocked); };
    if (wasStrike || wasSpare) celebrateThen(advance);
    else advance();
  }

  // 这一球之后怎么推进（换格 / 重摆瓶 / 结束）
  function advanceRoll(knocked) {
    if (G.frame < 10) {
      if (knocked === 10) {
        // 全中：这一格结束，重新摆瓶
        G.frame += 1;
        G.ballNo = 1;
        resetRack(false);
        nextAim();
        return;
      }
      if (G.ballNo === 1) {
        G.ballNo = 2;
        nextAim();
        return;
      }
      // 两球都投完，换下一格
      G.frame += 1;
      G.ballNo = 1;
      resetRack(false);
      nextAim();
      return;
    }

    /* ---- 第 10 格：最多三个球 ---- */
    const r = G.frames[9];
    if (r.length === 1) {
      if (r[0] === 10) resetRack(false);     // 全中，重新摆瓶
      nextAim();
      return;
    }
    if (r.length === 2) {
      if (r[0] === 10) {
        if (r[1] === 10) resetRack(false);   // 第二球也全中，重新摆瓶
      } else if (r[0] + r[1] === 10) {
        resetRack(false);                    // 补中，重新摆瓶
      } else {
        endGame();
        return;
      }
      nextAim();
      return;
    }
    endGame();
  }

  function nextAim() {
    G.mode = 'aim';
    G.power = 0;
    G.powerT = 0;
    G.charging = false;
    G.aimLocked = false;      // 下一球要重新锁定方向
    G.settleT = 0;
    pickShiny();              // 每一球重新挑一只闪光奶鱼
    renderBoard();
  }

  // 在还站着的瓶里随机挑一只，作为这一球的"闪光奶鱼"（打倒 +5 分）
  function pickShiny() {
    const stand = G.pins.filter(function (p) { return p.standing; });
    G.shiny = stand.length ? stand[Math.floor(Math.random() * stand.length)].i : -1;
    G.shinyHit = false;
  }

  /* ---- 全中庆祝：奶蛙原地变成"捧腹大笑"，配视频原声，放完（或跳过）再继续 ---- */

  function celebrateThen(done) {
    // 设置里关掉了"全中大笑"，就直接继续
    if (G.laughEnabled === false || !IMG.laughFrames.length) { done(); return; }

    G.mode = 'celebrate';
    G.laughing = true;
    G.laughT = 0;
    let finished = false;

    const finish = function () {
      if (finished) return;
      finished = true;
      G.laughEnd = null;
      G.laughing = false;
      clearTimeout(G.laughTimer);
      if (laughAudio) {
        try { laughAudio.pause(); laughAudio.currentTime = 0; } catch (e) { /* 忽略 */ }
      }
      done();
    };

    G.laughEnd = finish;

    if (laughAudio) {
      laughAudio.onended = finish;
      laughAudio.muted = G.muted;
      try { laughAudio.currentTime = 0; } catch (e) { /* 忽略 */ }
      if (!G.muted) {
        const p = laughAudio.play();
        if (p && p.catch) p.catch(function () {});   // 被自动播放策略拒了就不出声，但照常笑
      }
    }

    // 兜底：音频没加载出来 / ended 不触发，也要让游戏继续
    const ms = (laughAudio && isFinite(laughAudio.duration) && laughAudio.duration > 0
      ? laughAudio.duration * 1000 : 6000) + 700;
    clearTimeout(G.laughTimer);
    G.laughTimer = setTimeout(finish, ms);
  }

  /* ---- 破纪录：小窗播片段 + 文字 ---- */

  function startRecordClip() {
    G.clipT = 0;
    drawRecordClip();
    if (recAudio && !G.muted) {
      recAudio.muted = false;
      try { recAudio.currentTime = 0; } catch (e) { /* 忽略 */ }
      const p = recAudio.play();
      if (p && p.catch) p.catch(function () {});
    }
  }

  function stopRecordClip() {
    if (!recAudio) return;
    try { recAudio.pause(); recAudio.currentTime = 0; } catch (e) { /* 忽略 */ }
  }

  function drawRecordClip() {
    const cv = document.getElementById('recCanvas');
    const sheet = IMG.recSheet;
    if (!cv || !sheet) return;

    const rows = Math.ceil(REC_FRAME_COUNT / REC_COLS);
    const fw = sheet.width / REC_COLS;
    const fh = sheet.height / rows;
    const idx = Math.floor(G.clipT * 10) % REC_FRAME_COUNT;
    const sx = (idx % REC_COLS) * fw;
    const sy = Math.floor(idx / REC_COLS) * fh;

    const c2 = cv.getContext('2d');
    if (c2) c2.drawImage(sheet, sx, sy, fw, fh, 0, 0, cv.width, cv.height);
  }

  function endGame() {
    G.mode = 'over';
    const sc = scoreFrames();
    let total = 0;
    for (const f of sc) if (f.cum != null) total = f.cum;
    G.total = total;

    // 破纪录判定：严格大于历史最高分
    G.record = total > G.best;
    if (G.record) {
      G.best = total;
      saveBest(total);
    }

    const title = document.getElementById('recTitle');
    const comment = document.getElementById('finalComment');
    const clipBox = document.getElementById('clipBox');

    document.getElementById('finalScore').textContent = total;
    document.getElementById('bestLine').textContent = '最高分：' + G.best + (G.record ? '  🎉 新纪录' : '');

    if (G.record) {
      title.textContent = '您已打出自己的历史最高分';
      title.classList.add('record');
      comment.textContent = '奶蛙再一次超越了自我';
      clipBox.classList.remove('hidden');
      startRecordClip();
    } else {
      title.textContent = '比赛结束';
      title.classList.remove('record');
      comment.textContent =
        total >= 200 ? '职业选手！' :
        total >= 150 ? '很强了，再练练连击。' :
        total >= 100 ? '及格线以上，继续打。' :
        total >= 60 ? '还行，瞄准再稳一点。' : '……先熟悉一下手感吧。';
      clipBox.classList.add('hidden');
      stopRecordClip();
    }

    document.getElementById('overScreen').classList.remove('hidden');
    renderBoard();
    stopBgm();               // 结算播报时不放背景音乐
  }

  function showMessage(text, color) {
    G.message = text;
    G.messageColor = color;
    G.messageT = 1.4;
  }

  /* ---------------- 标准十格计分 ---------------- */

  // 把一格的击倒数变成 X / 3 / 这样的符号
  function rollMarks(rolls) {
    let s = '';
    let subFirst = null;
    let inSub = false;
    for (let i = 0; i < rolls.length; i++) {
      const r = rolls[i];
      if (!inSub) {
        if (r === 10) { s += 'X'; subFirst = null; inSub = false; }
        else { s += r === 0 ? '-' : String(r); subFirst = r; inSub = true; }
      } else {
        if (subFirst + r === 10) { s += '/'; }
        else { s += r === 0 ? '-' : String(r); }
        subFirst = null;
        inSub = false;
      }
    }
    return s;
  }

  function scoreFrames() {
    const frames = G.frames;
    const flat = [];
    const start = [];
    for (const f of frames) {
      start.push(flat.length);
      for (const r of f) flat.push(r);
    }
    const out = [];
    let cum = 0;
    let pending = false;

    for (let f = 0; f < 10; f++) {
      const rolls = frames[f];
      if (rolls.length === 0) {
        out.push({ rolls: rolls, score: null, cum: null, marks: '' });
        pending = true;
        continue;
      }
      let pts = null;
      const s = start[f];

      if (f < 9) {
        if (rolls[0] === 10) {
          if (flat.length > s + 2) pts = 10 + flat[s + 1] + flat[s + 2];
        } else if (rolls.length === 2) {
          if (rolls[0] + rolls[1] === 10) {
            if (flat.length > s + 2) pts = 10 + flat[s + 2];
          } else {
            pts = rolls[0] + rolls[1];
          }
        }
      } else {
        pts = rolls.reduce(function (a, b) { return a + b; }, 0);
      }

      if (pts === null) {
        out.push({ rolls: rolls, score: null, cum: null, marks: rollMarks(rolls) });
        pending = true;
      } else {
        cum += pts;
        out.push({ rolls: rolls, score: pts, cum: pending ? null : cum, marks: rollMarks(rolls) });
      }
    }

    // 闪光奶鱼的 +5 只进"累计"，不改变本格得分（否则全中/补中的加分算法就乱了）
    let bonus = 0;
    for (let f = 0; f < 10; f++) {
      bonus += G.frameBonus[f] || 0;
      if (out[f].cum != null) out[f].cum += bonus;
    }
    return out;
  }

  // 一格结果的"人话"版本：全中 / 补中 / 7+2 / 3（只投了一球）
  function frameLabel(rolls) {
    if (!rolls || rolls.length === 0) return '·';
    if (rolls[0] === 10) return '全中';
    if (rolls.length >= 2 && rolls[0] + rolls[1] === 10) return '补中';
    return rolls.join('+');
  }

  function renderBoard() {
    const sc = scoreFrames();
    let cells = '';
    for (let i = 0; i < 10; i++) {
      const f = sc[i];
      const cls = 'cell' + (i === 9 ? ' last' : '') + (i + 1 === G.frame && G.mode !== 'over' ? ' now' : '');
      cells += '<div class="' + cls + '">' +
        '<span class="fn">第' + (i + 1) + '格</span>' +
        '<span class="ris">' + frameLabel(f.rolls) + '</span>' +
        '<span class="fsc">' + (f.score == null ? '' : f.score) + '</span>' +
        '<span class="tt">' + (f.cum == null ? '' : f.cum) + '</span>' +
        '</div>';
    }

    // 总分 = 最后一个结算完的累计
    let total = 0;
    for (const f of sc) if (f.cum != null) total = f.cum;

    boardEl.innerHTML =
      '<div class="row">' + cells + '</div>' +
      '<p class="legend">' +
        '<span class="lines">' +
          '<span>每格从上到下：结果 · 本格得分 · 累计总分</span>' +
          '<span>全中 = 10 分 + 下两球　·　补中 = 10 分 + 下一球</span>' +
        '</span>' +
        '<b>总分 ' + total + '</b>' +
      '</p>';
  }

  /* ---------------- 7. 物理 ---------------- */

  function updateBall(dt) {
    const b = G.ball;
    if (!b) return;
    const steps = 4;
    const h = dt / steps;

    for (let s = 0; s < steps; s++) {
      if (b.done) break;
      b.x += b.vx * h;
      b.z += b.vz * h;
      b.dist += Math.abs(b.vz) * h;

      // 进地沟：横向超出球道就滚到底，不算击倒
      if (!b.gutter && Math.abs(b.x) > LANE.halfW - BALL_R * 0.6) {
        b.gutter = true;
        b.x = (b.x > 0 ? 1 : -1) * (LANE.halfW - BALL_R * 0.6);
        b.vx = 0;
      }

      // 滚动阻力：力度小的时候球会在半路停下（这是"力度"最直观的反馈）
      b.vz -= BALL_DECEL * h;
      if (b.vz < 0.35 && !b.gutter) {
        b.vz = 0;
        b.done = true;
        b.stalled = b.z < LANE.pinZ - 1;
      }

      // 撞瓶（只在瓶区附近检测，省点计算）
      if (!b.gutter && b.z > LANE.pinZ - 1.2) {
        for (const p of G.pins) {
          if (!p.standing) continue;
          const dx = p.x - b.x;
          const dz = p.z - b.z;
          const rr = BALL_R + PIN_R;
          if (dx * dx + dz * dz < rr * rr) {
            const d = Math.max(0.001, Math.hypot(dx, dz));
            const nx = dx / d;
            // 加一点点随机，让同样的球不会每次都一模一样（真实的瓶也这样）
            knockPin(p,
              b.vx * 0.5 + nx * 0.9 + rand(-0.12, 0.12),
              Math.abs(b.vz) * 0.62 + rand(-0.05, 0.15),
              nx + rand(-0.1, 0.1));
            // 球被撞得偏一点、慢一点（正撞时抖动更大，避免"永远正中间=全中"）
            const jam = 1 - Math.min(1, Math.abs(nx) * 2);
            b.vx += nx * 0.45 + rand(-0.32, 0.32) * (0.35 + 0.65 * jam);
            b.vz *= 0.90;
          }
        }
      }

      if (b.z > LANE.len + 0.4) b.done = true;
      if (Math.abs(b.vz) < 0.6) b.done = true;
    }
  }

  function updatePins(dt) {
    // 先处理"被撞飞的瓶"撞倒别的瓶（连锁反应）
    for (const a of G.pins) {
      if (a.standing || a.gone) continue;
      if (Math.hypot(a.vx, a.vz) < 0.4) continue;

      for (const p of G.pins) {
        if (!p.standing) continue;
        const dx = p.x - a.x;
        const dz = p.z - a.z;
        const rr = PIN_R * 2;
        if (dx * dx + dz * dz < rr * rr) {
          const d = Math.max(0.001, Math.hypot(dx, dz));
          const nx = dx / d;
          knockPin(p,
            a.vx * 0.85 + nx * 0.5 + rand(-0.12, 0.12),
            a.vz * 0.85 + rand(-0.08, 0.12),
            nx + rand(-0.12, 0.12));
          a.vx *= 0.65;
          a.vz *= 0.65;
        }
      }
    }

    for (const p of G.pins) {
      if (p.pop < 1) p.pop = Math.min(1, p.pop + dt * 4);

      if (p.standing) continue;

      // 正在淡出的瓶：只更新透明度，不再做物理
      if (p.vanish != null) {
        p.vanish += dt * 3.5;
        if (p.vanish >= 1) {
          p.vanish = null;
          p.gone = true;
          p.vx = 0;
          p.vz = 0;
        }
        continue;
      }

      if (!p.gone) {
        p.x += p.vx * dt;
        p.z += p.vz * dt;
        p.vx *= 1 - 3.2 * dt;
        p.vz *= 1 - 3.2 * dt;
        if (Math.abs(p.vx) < 0.05) p.vx = 0;
        if (Math.abs(p.vz) < 0.05) p.vz = 0;
        if (p.z > LANE.len - 0.2 || Math.abs(p.x) > LANE.halfW + 0.25) {
          p.gone = true;
          p.vx = 0;
          p.vz = 0;
        }
      }
      p.fall = Math.min(1, p.fall + dt * 3.4);
    }
  }

  function checkRollEnd(dt) {
    const ballMoving = G.ball && !G.ball.done;
    let pinMoving = false;
    for (const p of G.pins) {
      if (p.standing || p.gone) continue;
      if (Math.hypot(p.vx, p.vz) > 0.25 || p.fall < 1) { pinMoving = true; break; }
    }

    if (ballMoving || pinMoving) {
      G.settleT = 0;
      return;
    }
    G.settleT += dt;
    if (G.settleT > 0.85) {
      G.settleT = 0;
      resolveRoll();
    }
  }

  /* ---------------- 8. 绘制 ---------------- */

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawRoom() {
    // 球道两侧的房间地板：不填这一层，画布边缘会是透明的
    const g = ctx.createLinearGradient(0, FAR_Y, 0, H);
    g.addColorStop(0, '#191229');
    g.addColorStop(1, '#0b0812');
    ctx.fillStyle = g;
    ctx.fillRect(0, FAR_Y - 1, W, H - FAR_Y + 1);

    // 瓶台正上方的一束聚光（用椭圆而不是矩形，避免出现一块生硬的光板）
    const spot = ctx.createRadialGradient(W / 2, FAR_Y + 24, 8, W / 2, FAR_Y + 24, 210);
    spot.addColorStop(0, 'rgba(255, 236, 190, .18)');
    spot.addColorStop(1, 'rgba(255, 236, 190, 0)');
    ctx.save();
    ctx.translate(W / 2, FAR_Y + 24);
    ctx.scale(1, 0.55);
    ctx.translate(-W / 2, -(FAR_Y + 24));
    ctx.fillStyle = spot;
    ctx.fillRect(0, FAR_Y - 120, W, 300);
    ctx.restore();
  }

  function drawWall() {
    const bg = IMG.bgs[G.bg];
    if (bg) {
      // 选中的背景图铺满远景区域
      ctx.drawImage(bg, 0, 0, W, FAR_Y);
      // 再压一层暗调：保证球瓶和记分板在任何背景下都清楚
      const shade = ctx.createLinearGradient(0, 0, 0, FAR_Y);
      shade.addColorStop(0, 'rgba(10, 6, 18, .28)');
      shade.addColorStop(0.6, 'rgba(10, 6, 18, .16)');
      shade.addColorStop(1, 'rgba(10, 6, 18, .58)');
      ctx.fillStyle = shade;
      ctx.fillRect(0, 0, W, FAR_Y);
    } else {
      const g = ctx.createLinearGradient(0, 0, 0, FAR_Y);
      g.addColorStop(0, '#100b1b');
      g.addColorStop(1, '#2a1f42');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, FAR_Y);

      // 竖向灯带
      for (let i = 0; i < 9; i++) {
        const x = 30 + i * 52;
        ctx.fillStyle = 'rgba(120, 90, 200, .12)';
        ctx.fillRect(x, 0, 6, FAR_Y);
      }
    }

    // 招牌
    ctx.save();
    ctx.shadowColor = 'rgba(255, 190, 61, .55)';
    ctx.shadowBlur = 26;
    roundRect(104, 158, 272, 66, 16);
    ctx.fillStyle = 'rgba(20, 14, 32, .9)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 205, 90, .85)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = '#ffd75e';
    ctx.font = '700 26px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('奶蛙保龄球', 240, 186);

    ctx.fillStyle = 'rgba(255,255,255,.45)';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillText('F R O G   B O W L I N G', 240, 208);

    // 招牌下面的暗色护墙
    const g2 = ctx.createLinearGradient(0, 150, 0, FAR_Y);
    g2.addColorStop(0, 'rgba(8, 6, 14, 0)');
    g2.addColorStop(1, 'rgba(8, 6, 14, .95)');
    ctx.fillStyle = g2;
    ctx.fillRect(0, 150, W, FAR_Y - 150);
  }

  function laneQuad(x1, x2, z1, z2) {
    const a = project(x1, z1), b = project(x2, z1), c = project(x2, z2), d = project(x1, z2);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.closePath();
  }

  function drawLane() {
    // 地沟（比球道宽一圈）
    laneQuad(-LANE.halfW - 0.26, LANE.halfW + 0.26, 0, LANE.len);
    const gg = ctx.createLinearGradient(0, FAR_Y, 0, NEAR_Y);
    gg.addColorStop(0, '#151020');
    gg.addColorStop(1, '#221a33');
    ctx.fillStyle = gg;
    ctx.fill();

    // 球道（木地板）
    laneQuad(-LANE.halfW, LANE.halfW, 0, LANE.len);
    const wood = ctx.createLinearGradient(0, FAR_Y, 0, NEAR_Y);
    wood.addColorStop(0, '#7a4f2c');
    wood.addColorStop(0.45, '#a86e3c');
    wood.addColorStop(1, '#c98f56');
    ctx.fillStyle = wood;
    ctx.fill();

    // 木纹：从近到远收拢的线
    ctx.strokeStyle = 'rgba(60, 34, 14, .35)';
    ctx.lineWidth = 1;
    for (let i = -5; i <= 5; i++) {
      const x = i * (LANE.halfW / 5.5);
      const a = project(x, 0.2), b = project(x, LANE.len - 0.2);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // 球道上的反光
    const shine = ctx.createLinearGradient(0, FAR_Y, 0, NEAR_Y);
    shine.addColorStop(0, 'rgba(255,255,255,0)');
    shine.addColorStop(0.7, 'rgba(255,255,255,.06)');
    shine.addColorStop(1, 'rgba(255,255,255,.12)');
    laneQuad(-LANE.halfW * 0.55, -LANE.halfW * 0.1, 0, LANE.len);
    ctx.fillStyle = shine;
    ctx.fill();

    // 瓶台：远端一块深色地板
    laneQuad(-LANE.halfW, LANE.halfW, LANE.pinZ - 0.55, LANE.len);
    ctx.fillStyle = 'rgba(30, 18, 12, .45)';
    ctx.fill();

    // 瞄准箭头（离罚球线 4.6 米处）
    for (let i = -3; i <= 3; i++) {
      const p = project(i * 0.13, 4.6);
      const sz = 5 * p.s + 2;
      ctx.fillStyle = 'rgba(40, 20, 8, .55)';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - sz);
      ctx.lineTo(p.x - sz * 0.6, p.y + sz * 0.4);
      ctx.lineTo(p.x + sz * 0.6, p.y + sz * 0.4);
      ctx.closePath();
      ctx.fill();
    }

    // 罚球线
    const f1 = project(-LANE.halfW, 0), f2 = project(LANE.halfW, 0);
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(f1.x, f1.y);
    ctx.lineTo(f2.x, f2.y);
    ctx.stroke();
  }

  function drawPin(p, t) {
    const pos = project(p.x, p.z);
    // 所有瓶共用同一个时间基准：动作整齐，不会各摸各的
    const img = PIN_IMGS.length === 1
      ? PIN_IMGS[0]
      : PIN_IMGS[Math.floor(t * 8) % PIN_IMGS.length];
    if (!img) return;

    const h = pxPerM(pos.s) * PIN_H * (0.35 + 0.65 * p.pop);
    const w = h * (img.width / img.height) * 0.82;

    const isShiny = p.standing && p.i === G.shiny;

    // 闪光奶鱼：底下画一圈金色光晕 + 环绕的小星星
    if (isShiny) {
      const pulse = 0.75 + 0.25 * Math.sin(t * 7);
      const glow = ctx.createRadialGradient(pos.x, pos.y - h * 0.45, 2,
                                            pos.x, pos.y - h * 0.45, h * 0.8);
      glow.addColorStop(0, 'rgba(255, 240, 150, ' + (0.85 * pulse).toFixed(3) + ')');
      glow.addColorStop(0.6, 'rgba(255, 220, 110, ' + (0.35 * pulse).toFixed(3) + ')');
      glow.addColorStop(1, 'rgba(255, 236, 140, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.ellipse(pos.x, pos.y - h * 0.45, h * 0.8, h * 0.9, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      for (let k = 0; k < 7; k++) {
        const a = t * 1.9 + k * Math.PI * 2 / 7;
        const rx = Math.cos(a) * h * 0.6;
        const ry = Math.sin(a) * h * 0.36;
        const s = 2.5 + 2.2 * Math.abs(Math.sin(t * 5 + k));
        ctx.fillStyle = 'rgba(255, 252, 214, .98)';
        ctx.beginPath();
        ctx.moveTo(pos.x + rx, pos.y - h * 0.5 + ry - s);
        ctx.lineTo(pos.x + rx + s * 0.62, pos.y - h * 0.5 + ry);
        ctx.lineTo(pos.x + rx, pos.y - h * 0.5 + ry + s);
        ctx.lineTo(pos.x + rx - s * 0.62, pos.y - h * 0.5 + ry);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    ctx.save();
    // 越靠后的排画得越高一点：屏幕上纵深只有几个像素，不加这个会挤成一排
    ctx.translate(pos.x, pos.y - p.row * 5);
    if (!p.standing) {
      // 倒地：绕底部旋转 + 稍微透明
      ctx.rotate(p.dir * p.fall * 1.45);
      ctx.globalAlpha = 0.9;
    }
    if (p.vanish != null) {
      ctx.globalAlpha *= Math.max(0, 1 - p.vanish);
    }

    // 地面阴影
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    ctx.beginPath();
    ctx.ellipse(0, p.row * 5, w * 0.34, w * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();

    // 闪光奶鱼：让精灵本身也发光
    if (isShiny) {
      ctx.shadowColor = 'rgba(255, 226, 110, .95)';
      ctx.shadowBlur = 14 + 7 * Math.sin(t * 6);
    }
    ctx.drawImage(img, -w / 2, -h, w, h);
    ctx.shadowBlur = 0;

    // 头顶一颗跳动的星
    if (isShiny) {
      const bob = Math.sin(t * 4) * 3;
      const s = 5.5;
      ctx.fillStyle = 'rgba(255, 250, 200, .98)';
      ctx.beginPath();
      ctx.moveTo(0, -h - 10 + bob - s);
      ctx.lineTo(s * 0.6, -h - 10 + bob);
      ctx.lineTo(0, -h - 10 + bob + s);
      ctx.lineTo(-s * 0.6, -h - 10 + bob);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBall() {
    // 瞄准阶段奶蛙手里也捧着一个球，投出去之后才是飞行中的球
    const b = G.ball || (G.mode === 'aim' ? { x: 0, z: 0.72, dist: 0 } : null);
    if (!b) return;
    const pos = project(b.x, b.z);
    const d = 2 * BALL_R * pxPerM(pos.s);
    let cy = pos.y - d * 0.46;

    // 蓄力时把球往后压一点，看起来像在攒劲
    if (!G.ball && G.charging) cy += 6 * G.power;

    // 影子
    ctx.fillStyle = 'rgba(0,0,0,.32)';
    ctx.beginPath();
    ctx.ellipse(pos.x, pos.y, d * 0.5, d * 0.17, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(pos.x, cy);
    ctx.rotate(Math.sin(b.dist * 2.2) * 0.22);   // 轻微滚动感
    ctx.drawImage(IMG.ball, -d / 2, -d / 2, d, d);
    ctx.restore();
  }

  function drawFrog() {
    // 全中：原地变成"捧腹大笑"的序列帧（脚底位置不变，看起来还是同一只奶蛙）
    if (G.laughing && IMG.laughFrames.length) {
      const laugh = IMG.laughFrames;
      const img = laugh[Math.floor(G.laughT * 11) % laugh.length];
      const lh = 196;
      const lw = lh * (img.width / img.height);
      ctx.save();
      ctx.translate(W / 2, H + 8);
      ctx.translate(0, Math.sin(G.laughT * 9) * 2);   // 笑得一颤一颤
      ctx.drawImage(img, -lw / 2, -lh, lw, lh);
      ctx.restore();
      return;
    }

    const frames = IMG.frogFrames;
    if (!frames.length) return;

    // 多帧时按投球进度取帧；只有一帧时就用"变形"来表现动作
    const idx = frames.length > 1
      ? Math.min(frames.length - 1, Math.floor(G.frogAnim * frames.length))
      : 0;
    const img = frames[idx];

    const fh = 186;
    const fw = fh * (img.width / img.height);

    // 奶蛙的动作是靠"变形"做出来的：蓄力后仰压扁 → 出手前冲拉长 → 回弹
    let rot = 0, sx = 1, sy = 1, dy = 0;

    if (G.mode === 'aim' && G.charging) {
      const k = G.power;
      rot -= 0.04 * k;
      sy -= 0.03 * k;
      sx += 0.02 * k;
      dy += 2 * k;
    }

    if (G.frogAnim < 1) {
      const a = G.frogAnim;
      // 先正后负、幅度衰减：sin 给"冲—回弹"的节奏，exp 让它停下来
      // 静态图只能做"压一下再弹起"，转太多会像往旁边倒，所以幅度都收着
      const punch = Math.sin(a * Math.PI * 2.4) * Math.exp(-3.2 * a);
      rot += 0.05 * punch;
      sy += 0.08 * punch;
      sx -= 0.03 * punch;
      dy -= 7 * punch;
    }

    ctx.save();
    ctx.translate(W / 2, H + 4 + dy);
    ctx.rotate(rot);           // 以脚底为支点
    ctx.scale(sx, sy);
    ctx.drawImage(img, -fw / 2, -fh, fw, fh);
    ctx.restore();
  }

  function drawAim() {
    if (G.mode !== 'aim') return;

    const start = project(0, 0.7);
    const target = project(G.aimX, LANE.pinZ + 0.35);
    const locked = G.aimLocked;

    // 引导线：没锁定时是虚的（还在晃），锁定后变实
    ctx.save();
    ctx.setLineDash(locked ? [] : [9, 9]);
    ctx.lineWidth = locked ? 2.5 : 2;
    ctx.strokeStyle = locked ? 'rgba(255, 231, 150, .75)' : 'rgba(255, 231, 150, .4)';
    ctx.beginPath();
    ctx.moveTo(start.x, start.y - 26);
    ctx.lineTo(target.x, target.y);
    ctx.stroke();
    ctx.restore();

    // 落点圈
    const pulse = 1 + Math.sin(G.t * 6) * 0.12;
    ctx.strokeStyle = locked ? 'rgba(255, 215, 94, 1)' : 'rgba(255, 215, 94, .65)';
    ctx.lineWidth = locked ? 3 : 2;
    ctx.beginPath();
    ctx.ellipse(target.x, target.y, 13 * pulse, 5 * pulse, 0, 0, Math.PI * 2);
    ctx.stroke();

    // 未锁定：在瓶线附近画一条"扫描带"，让人看清指针在左右跑
    if (!locked) {
      const left = project(-AIM_RANGE, LANE.pinZ + 0.35);
      const right = project(AIM_RANGE, LANE.pinZ + 0.35);
      ctx.strokeStyle = 'rgba(255, 215, 94, .22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(left.x, left.y);
      ctx.lineTo(right.x, right.y);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 215, 94, .95)';
      ctx.beginPath();
      ctx.moveTo(target.x, target.y - 8);
      ctx.lineTo(target.x - 5, target.y - 16);
      ctx.lineTo(target.x + 5, target.y - 16);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawHud() {
    // 蓄力条（右下）：锁定方向之后才出现
    if (G.mode === 'aim' && G.aimLocked) {
      const bw = 16, bh = 132;
      const bx = W - 40, by = 470;

      ctx.fillStyle = 'rgba(10, 8, 16, .55)';
      roundRect(bx, by, bw, bh, 8);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.14)';
      ctx.lineWidth = 1;
      ctx.stroke();

      const hgt = bh * G.power;
      const g = ctx.createLinearGradient(0, by + bh, 0, by);
      g.addColorStop(0, '#6ee7a8');
      g.addColorStop(0.6, '#ffd75e');
      g.addColorStop(1, '#ff6b6b');
      ctx.fillStyle = g;
      if (hgt > 2) {
        roundRect(bx + 2, by + bh - hgt, bw - 4, hgt, 6);
        ctx.fill();
      }

      ctx.fillStyle = 'rgba(255,255,255,.7)';
      ctx.font = '600 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('力', bx + bw / 2, by - 10);
    }

    // 左下角：第几格 / 第几球 / 提示
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const label = G.mode === 'over' ? '比赛结束' : ('第 ' + G.frame + ' 格 · 第 ' + G.ballNo + ' 球');
    ctx.font = '700 13px "PingFang SC", "Microsoft YaHei", sans-serif';
    const tw = ctx.measureText(label).width;

    ctx.fillStyle = 'rgba(10, 8, 16, .6)';
    roundRect(12, 548, tw + 20, 26, 13);
    ctx.fill();
    ctx.fillStyle = '#ffd75e';
    ctx.fillText(label, 22, 566);

    if (G.mode === 'aim') {
      const hint = G.charging ? '按住蓄力 · 松开投球' : '按住屏幕：指针停住并开始蓄力';
      ctx.fillStyle = 'rgba(255,255,255,.6)';
      ctx.font = '600 11px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText(hint, 12, 594);
    }

    // 全中 / 补中提示
    if (G.messageT > 0) {
      ctx.globalAlpha = Math.min(1, G.messageT / 0.5);
      ctx.textAlign = 'center';
      ctx.font = '800 34px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillStyle = G.messageColor || '#fff';
      ctx.shadowColor = 'rgba(0,0,0,.6)';
      ctx.shadowBlur = 12;
      ctx.fillText(G.message, W / 2, 430 - (1.4 - G.messageT) * 26);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }
  }

  function draw(t) {
    ctx.save();
    if (G.shake > 0.2) {
      ctx.translate(rand(-G.shake, G.shake) * 0.5, rand(-G.shake, G.shake) * 0.5);
    }

    ctx.fillStyle = '#0a0710';
    ctx.fillRect(0, 0, W, H);

    drawRoom();
    drawWall();
    drawLane();

    // 深度排序：比球远的瓶先画，比球近的后画
    const ballZ = G.ball ? G.ball.z : 0.72;
    const sorted = G.pins.slice().sort(function (a, b) { return b.z - a.z; });
    const back = sorted.filter(function (p) { return p.z >= ballZ; });
    const front = sorted.filter(function (p) { return p.z < ballZ; });

    for (const p of back) if (!p.gone) drawPin(p, t);

    // 球飞出去之后就比奶蛙"远"了，必须先画，否则球会盖在奶蛙脖子上
    if (G.ball) {
      drawBall();
      drawFrog();
    } else {
      drawFrog();
      drawBall();      // 瞄准时球是捧在手里的，画在前面
    }

    for (const p of front) if (!p.gone) drawPin(p, t);

    drawAim();
    drawHud();

    ctx.restore();
  }

  /* ---------------- 9. 主循环 ---------------- */

  function update(dt) {
    G.t += dt;

    if (G.frogAnim < 1) G.frogAnim = Math.min(1, G.frogAnim + dt * 1.5);
    if (G.laughing) G.laughT += dt;
    if (G.mode === 'over' && G.record) {
      G.clipT += dt;
      drawRecordClip();
    }
    if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 26);
    if (G.messageT > 0) G.messageT -= dt;
    if (G.shinyFx > 0) G.shinyFx = Math.max(0, G.shinyFx - dt);

    // 瞄准阶段：指针自己左右晃，玩家点一下定住
    if (G.mode === 'aim' && !G.aimLocked) {
      G.aimX = Math.sin(G.t * AIM_SPEED) * AIM_RANGE;
    }

    if (G.mode === 'aim' && G.charging) {
      // 蓄力条来回摆动：0 → 1 → 0 循环，考验松手时机
      G.powerT += dt * 1.05;
      const p = G.powerT % 2;
      G.power = p < 1 ? p : 2 - p;
    }

    if (G.mode === 'throw') updateBall(dt);
    updatePins(dt);
    if (G.mode === 'throw') checkRollEnd(dt);
  }

  function loop(ts) {
    if (!G.last) G.last = ts;
    let dt = (ts - G.last) / 1000;
    G.last = ts;
    dt = Math.min(dt, 0.05);

    // 设置框打开时暂停：不推进时间，只把当前画面画一次（弹框后面能看见球道）
    if (G.paused) {
      draw(G.t);
      requestAnimationFrame(loop);
      return;
    }

    update(dt);
    draw(G.t);

    requestAnimationFrame(loop);
  }

  /* ---------------- 启动 ---------------- */

  // 页面和脚本版本对不上时（典型情况：浏览器还在用旧缓存的 HTML），
  // 与其半残地跑，不如直接说清楚，免得"功能消失"查半天。
  function checkDom() {
    const need = ['board', 'startBtn', 'retryBtn', 'titleScreen', 'overScreen',
      'gearBtn', 'settings', 'optSound', 'optLaugh', 'recTitle', 'bestLine',
      'clipBox', 'recCanvas', 'clearBestBtn'];
    const missing = need.filter(function (id) { return !document.getElementById(id); });
    if (missing.length) {
      if (window.__showError) {
        window.__showError('页面是旧版本，缺少这些元素：' + missing.join('、') +
          '\n\n请按 Ctrl+F5 强制刷新，或者关掉这个标签页重新打开。\n' +
          '（脚本版本 ' + VERSION + '）');
      }
      return false;
    }
    return true;
  }

  if (checkDom()) {
    loadList(essentialJobs()).then(function () {
      makePins();
      bindUI();
      loadSounds();
      renderBoard();
      G.mode = 'title';
      requestAnimationFrame(loop);

      // 剩下的素材（大笑 / 破纪录小窗 / 背景）后台加载，不挡开局
      loadList(deferredJobs()).catch(function () { /* 后台失败就算了 */ });

      // 第一次玩：指一下齿轮
      maybeShowGearHint();
    }).catch(function (err) {
      if (window.__showError) window.__showError(err.message);
    });
  }

  // 测试钩子：index.html?test=1 时暴露内部状态，方便自动化验证
  if (typeof location !== 'undefined' && location.search.indexOf('test=1') >= 0) {
    window.__test = {
      G: G,
      start: startGame,
      throwAt: function (aimX, power) { G.aimX = aimX; G.power = power; throwBall(power); },
      // 手动推进 n 帧（不依赖浏览器的 requestAnimationFrame，方便截图和自动化测试）
      step: function (n, dt) {
        for (let i = 0; i < (n || 1); i++) { update(dt || 1 / 60); draw(G.t); }
      },
      // 直接触发一次"全中庆祝"，用来验证视频播放/跳过
      celebrate: function (done) { celebrateThen(done || function () {}); },
      // 测试用：拿到背景音乐对象，检查它是不是在放
      bgm: function () { return bgmAudio; },
      score: scoreFrames
    };
  }
})();
