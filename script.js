
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const W = canvas.width, H = canvas.height;

const imgNames = {
  background: "assets/background.png",
  rumruay: "assets/rumruay.png",
  enemy1: "assets/enemy1.png",
  enemy2: "assets/enemy2.png",
  enemy3: "assets/enemy3.png",
  enemy4: "assets/enemy4.png",
  enemy5: "assets/enemy5.png",
  midBoss: "assets/mid_boss.png",
  boss: "assets/boss.png",
  paw: "assets/paw.png",
  claw: "assets/claw.png",
  exp: "assets/exp.png",
  heal: "assets/healing.png",
  magnet: "assets/magnet.png",
  tree1: "assets/tree1.png",
  tree2: "assets/tree2.png",
  itemBox: "assets/item_box.png"
};

const images = {};

// simple 8bit sound effects
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function beep(freq=440, dur=0.08){
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.connect(g); g.connect(audioCtx.destination);
  o.type="square";
  o.frequency.value=freq;
  g.gain.value=0.05;
  o.start();
  o.stop(audioCtx.currentTime+dur);
}

let loaded = 0;
const totalImages = Object.keys(imgNames).length;
for (const [k, src] of Object.entries(imgNames)) {
  const img = new Image();
  img.onload = () => loaded++;
  img.onerror = () => loaded++;
  img.src = src;
  images[k] = img;
}

const ui = {
  hpFill: document.getElementById("hpFill"),
  hpText: document.getElementById("hpText"),
  expFill: document.getElementById("expFill"),
  levelText: document.getElementById("levelText"),
  timeText: document.getElementById("timeText"),
  enemyCount: document.getElementById("enemyCount"),
  weaponList: document.getElementById("weaponList"),
  overlay: document.getElementById("overlay"),
  levelup: document.getElementById("levelup"),
  choices: document.getElementById("choices"),
  startBtn: document.getElementById("startBtn"),
  touchControls: document.getElementById("touchControls"),
  joystickBase: document.getElementById("joystickBase"),
  joystickKnob: document.getElementById("joystickKnob"),
};

const touchState = {
  active: false,
  id: null,
  dx: 0,
  dy: 0,
  isTouchDevice: false,
};

const rand = (a,b) => Math.random()*(b-a)+a;
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
const dist = (a,b) => Math.hypot(a.x-b.x, a.y-b.y);
const fmt = s => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(Math.floor(s%60)).padStart(2,"0")}`;

const game = {
  started: false,
  paused: true,
  gameOver: false,
  won: false,
  time: 0,
  mapW: 3200,
  mapH: 3200,
  camX: 0,
  camY: 0,
  damageFlash: 0,
  keys: {},
  trees: [],
  bullets: [],
  slashes: [],
  enemies: [],
  drops: [],
  floatTexts: [],
  bossFlags: { mid: false, final: false },
  spawnTimer: 0,
  player: null
};

function makePlayer() {
  return {
    x: game.mapW/2, y: game.mapH/2,
    radius: 28,
    speed: 230,
    hp: 100, maxHp: 100,
    level: 1, exp: 0, expToNext: 20,
    magnetRange: 90,
    invuln: 0,
    stats: {
      damageMult: 1,
      cooldownMult: 1,
      projBonus: 0,
      moveBonus: 0,
      pickupBonus: 0
    },
    weapons: {
      paw: { unlocked: true, level: 1, cooldown: 1.10, timer: 0 },
      claw: { unlocked: false, level: 0, cooldown: 2.4, timer: 0 }
    }
  };
}


function updateTouchUI() {
  if (!ui.joystickBase || !ui.joystickKnob) return;
  const maxR = 38;
  const nx = clamp(touchState.dx, -1, 1) * maxR;
  const ny = clamp(touchState.dy, -1, 1) * maxR;
  ui.joystickKnob.style.transform = `translate(${nx}px, ${ny}px)`;
}

function resetTouchStick() {
  touchState.active = false;
  touchState.id = null;
  touchState.dx = 0;
  touchState.dy = 0;
  updateTouchUI();
}

function setTouchFromPoint(clientX, clientY) {
  if (!ui.joystickBase) return;
  const rect = ui.joystickBase.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  let dx = clientX - cx;
  let dy = clientY - cy;
  const maxR = rect.width * 0.29;
  const len = Math.hypot(dx, dy);
  if (len > maxR) {
    dx = dx / len * maxR;
    dy = dy / len * maxR;
  }
  touchState.dx = dx / maxR;
  touchState.dy = dy / maxR;
  updateTouchUI();
}

function initTouchControls() {
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const hasTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || coarse;
  touchState.isTouchDevice = !!hasTouch;
  if (!hasTouch || !ui.joystickBase || !ui.touchControls) return;
  ui.touchControls.classList.remove('hidden');

  const start = (e) => {
    const t = e.changedTouches ? e.changedTouches[0] : e;
    touchState.active = true;
    touchState.id = t.identifier ?? 'mouse';
    setTouchFromPoint(t.clientX, t.clientY);
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    e.preventDefault();
  };
  const move = (e) => {
    if (!touchState.active) return;
    let t = e;
    if (e.changedTouches) {
      t = [...e.changedTouches].find(tt => tt.identifier === touchState.id);
      if (!t) return;
    }
    setTouchFromPoint(t.clientX, t.clientY);
    e.preventDefault();
  };
  const end = (e) => {
    if (!touchState.active) return;
    if (e.changedTouches) {
      const t = [...e.changedTouches].find(tt => tt.identifier === touchState.id);
      if (!t) return;
    }
    resetTouchStick();
    e.preventDefault();
  };

  ui.joystickBase.addEventListener('touchstart', start, {passive:false});
  window.addEventListener('touchmove', move, {passive:false});
  window.addEventListener('touchend', end, {passive:false});
  window.addEventListener('touchcancel', end, {passive:false});

  // optional mouse drag for desktop testing
  ui.joystickBase.addEventListener('mousedown', start);
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);

  updateTouchUI();
}

function resetGame() {
  game.started = true;
  game.paused = false;
  game.gameOver = false;
  game.won = false;
  game.time = 0;
  game.damageFlash = 0;
  game.spawnTimer = 0;
  game.bossFlags = { mid: false, final: false };
  game.bullets = [];
  game.slashes = [];
  game.enemies = [];
  game.drops = [];
  game.floatTexts = [];
  game.player = makePlayer();
  game.trees = Array.from({length: 35}, (_,i)=>({
    x: rand(120, game.mapW-120),
    y: rand(120, game.mapH-120),
    type: Math.random() < 0.5 ? "tree1" : "tree2",
    scale: rand(0.65,1.15)
  }));
  ui.overlay.classList.add("hidden");
  ui.levelup.classList.add("hidden");
  renderUI();
}

function spawnEnemy(kind = null, x = null, y = null) {
  const p = game.player;
  const side = Math.floor(rand(0,4));
  const pad = 220;
  if (x === null || y === null) {
    if (side===0) { x = game.camX - pad; y = rand(game.camY-100, game.camY+H+100); }
    if (side===1) { x = game.camX + W + pad; y = rand(game.camY-100, game.camY+H+100); }
    if (side===2) { x = rand(game.camX-100, game.camX+W+100); y = game.camY - pad; }
    if (side===3) { x = rand(game.camX-100, game.camX+W+100); y = game.camY + H + pad; }
    x = clamp(x, 40, game.mapW-40);
    y = clamp(y, 40, game.mapH-40);
  }
  const choices = [
    {img:"enemy1", hp:125, speed:62, damage:30, scale:0.34, exp:8, unlockAt:0},
    {img:"enemy2", hp:400, speed:70, damage:30, scale:0.34, exp:12, unlockAt:240},
    {img:"enemy3", hp:600, speed:66, damage:30, scale:0.34, exp:16, unlockAt:300},
    {img:"enemy4", hp:800, speed:58, damage:30, scale:0.34, exp:20, unlockAt:360},
    {img:"enemy5", hp:1000, speed:76, damage:30, scale:0.34, exp:26, unlockAt:480},
  ];
  const availableChoices = choices.filter(c => game.time >= c.unlockAt);
  let spec = kind || availableChoices[Math.floor(Math.random()*availableChoices.length)];
  game.enemies.push({
    x, y,
    vx: 0, vy:0,
    hp: spec.hp,
    maxHp: spec.hp,
    damage: spec.damage,
    speed: spec.speed + game.time*0.22,
    scale: spec.scale,
    radius: 26,
    img: spec.img,
    exp: spec.exp,
    elite: false,
    boss: false,
    hitFlash: 0,
  });
}

function spawnBoss(type) {
  const p = game.player;
  const x = clamp(p.x + rand(-420, 420), 100, game.mapW - 100);
  const y = clamp(p.y - 350, 100, game.mapH - 100);
  const isFinal = type === "final";
  game.enemies.push({
    x, y,
    hp: isFinal ? 2300 : 950,
    maxHp: isFinal ? 2300 : 950,
    damage: 40,
    speed: isFinal ? 120 : 100,
    scale: isFinal ? 0.75 : 0.6,
    radius: isFinal ? 76 : 64,
    img: isFinal ? "boss" : "midBoss",
    exp: isFinal ? 300 : 130,
    elite: true,
    boss: true,
    bossType: type,
    hitFlash: 0,
    shootTimer: 1.5
  });
  game.floatTexts.push({x, y:y-70, text:isFinal?"FINAL BOSS!":"MID BOSS!", color:"#ffcc4a", life:1.8});
}

function dropLoot(x, y, enemy) {
  game.drops.push({x,y,type:"exp", amount:enemy.exp, radius:16});
  if (enemy.boss) {
    game.drops.push({x:x+40,y,type:"box", radius:20});
    if (enemy.bossType === "final") {
      game.drops.push({x:x-35,y,type:"heal", amount:40, radius:20});
    }
    return;
  }
  if (Math.random() < 0.045) game.drops.push({x:x+rand(-18,18), y:y+rand(-18,18), type:"heal", amount:18, radius:18});
  if (Math.random() < 0.03) game.drops.push({x:x+rand(-18,18), y:y+rand(-18,18), type:"magnet", radius:18});
  if (Math.random() < 0.025) game.drops.push({x:x+rand(-18,18), y:y+rand(-18,18), type:"box", radius:20});
}

function gainExp(amount) {
  const p = game.player;
  p.exp += amount;
  while (p.exp >= p.expToNext) {
    p.exp -= p.expToNext;
    p.level += 1;
    p.expToNext = Math.floor(18 + p.level * 14);
    levelUp();
  }
}

function levelUp() {
  game.paused = true;
  ui.levelup.classList.remove("hidden");
  ui.choices.innerHTML = "";
  const picks = getUpgradeChoices();
  picks.forEach(up => {
    const btn = document.createElement("button");
    btn.className = "choice";
    btn.innerHTML = `<strong>${up.name}</strong>${up.desc}`;
    btn.onclick = () => {
      up.apply();
      ui.levelup.classList.add("hidden");
      game.paused = false;
      renderUI();
    };
    ui.choices.appendChild(btn);
  });
}

function getUpgradeChoices() {
  const p = game.player;
  const pool = [];

  const paw = p.weapons.paw;
  const claw = p.weapons.claw;

  if (paw.level < 6) pool.push({
    name: `อุ้งเท้าพุ่ง Lv.${paw.level+1}`,
    desc: "ยิงอุ้งเท้าเร็วขึ้น แรงขึ้น และจำนวนเพิ่มเมื่อถึงระดับสูง",
    apply: () => { paw.level += 1; }
  });
  if (!claw.unlocked) pool.push({
    name: "ปลดล็อกกรงเล็บแดง",
    desc: "โจมตีแบบฟันกวาดทะลุหลายเป้าหมายรอบหน้าเป้าหมาย",
    apply: () => { claw.unlocked = true; claw.level = 1; }
  });
  if (claw.unlocked && claw.level < 6) pool.push({
    name: `กรงเล็บแดง Lv.${claw.level+1}`,
    desc: "เพิ่มความถี่ ระยะ และดาเมจของกรงเล็บ",
    apply: () => { claw.level += 1; }
  });
  pool.push(
    {
      name: "แรงขึ้น",
      desc: "เพิ่มดาเมจรวม 20%",
      apply: () => { p.stats.damageMult *= 1.2; }
    },
    {
      name: "พริ้วกว่าเดิม",
      desc: "เพิ่มความเร็วเคลื่อนที่ 12%",
      apply: () => { p.stats.moveBonus += 0.12; }
    },
    {
      name: "ยิงถี่ขึ้น",
      desc: "ลดคูลดาวน์อาวุธ 12%",
      apply: () => { p.stats.cooldownMult *= 0.88; }
    },
    {
      name: "สนามแม่เหล็ก",
      desc: "ระยะดูดไอเทมกว้างขึ้น",
      apply: () => { p.magnetRange += 35; p.stats.pickupBonus += 0.12; }
    },
    {
      name: "สุขภาพแข็งแรง",
      desc: "เพิ่ม Max HP 18 และฟื้น 18 HP",
      apply: () => { p.maxHp += 18; p.hp = Math.min(p.maxHp, p.hp + 18); }
    }
  );
  const shuffled = pool.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3);
}

function applyRandomUpgrade() {
  const picks = getUpgradeChoices();
  if (!picks.length) return null;
  const chosen = picks[Math.floor(Math.random() * picks.length)];
  chosen.apply();
  return chosen.name;
}

function openChest() {
  const rolls = 1 + Math.floor(Math.random() * 3);
  const names = [];
  for (let i = 0; i < rolls; i++) {
    const result = applyRandomUpgrade();
    if (result) names.push(result);
  }
  game.floatTexts.push({x:game.player.x, y:game.player.y-90, text:`Treasure +${rolls} LV`, color:"#ffd86f", life:1.6});
}

function firePaw() {
  const p = game.player;
  const weapon = p.weapons.paw;
  const targets = game.enemies.filter(e => dist(p,e) < 480).sort((a,b)=>dist(p,a)-dist(p,b));
  if (!targets.length) return;
  const shotCount = 1 + Math.floor((weapon.level - 1) / 2) + p.stats.projBonus;
  for (let i = 0; i < shotCount; i++) {
    const t = targets[i % targets.length];
    const ang = Math.atan2(t.y - p.y, t.x - p.x) + rand(-0.15, 0.15);
    const speed = 420 + weapon.level * 25;
    const damage = (18 + weapon.level * 7) * p.stats.damageMult;
    game.bullets.push({
      x: p.x, y: p.y,
      vx: Math.cos(ang)*speed,
      vy: Math.sin(ang)*speed,
      radius: 18,
      damage,
      ttl: 1.6,
      img: "paw",
      pierce: weapon.level >= 5 ? 2 : 1
    });
  }
}

function fireClaw() {
  const p = game.player;
  const weapon = p.weapons.claw;
  if (!weapon.unlocked || weapon.level <= 0) return;
  const targets = game.enemies.filter(e => dist(p,e) < 360).sort((a,b)=>dist(p,a)-dist(p,b));
  if (!targets.length) return;
  const hitCount = Math.min(targets.length, 1 + Math.floor(weapon.level/2));
  for (let i=0; i<hitCount; i++) {
    const t = targets[i];
    const angle = Math.atan2(t.y-p.y, t.x-p.x);
    game.slashes.push({
      x: t.x, y: t.y,
      angle,
      life: 0.22,
      radius: 66 + weapon.level*6,
      damage: (28 + weapon.level*13) * p.stats.damageMult,
      img: "claw"
    });
  }
}

function hurtEnemy(e, damage, knockbackX = 0, knockbackY = 0) {
  e.hp -= damage;
  e.x += knockbackX;
  e.y += knockbackY;
  e.hitFlash = 0.08;
  game.floatTexts.push({x:e.x+rand(-12,12), y:e.y-24, text:String(Math.round(damage)), color:"#fff0b2", life:0.42});
  if (e.hp <= 0) {
    if (e.boss && e.bossType === "final") {
      game.won = true;
      game.gameOver = true;
      game.paused = true;
      ui.overlay.classList.remove("hidden");
      ui.overlay.querySelector(".modal").innerHTML = `<h1>ชนะแล้ว!</h1><p>ร่ำรวยปราบบอสสุดท้ายสำเร็จ เก่งมาก ✨</p><button id="restartBtn">เล่นอีกครั้ง</button>`;
      document.getElementById("restartBtn").onclick = resetGame;
    }
    dropLoot(e.x, e.y, e);
    game.enemies.splice(game.enemies.indexOf(e),1);
  }
}

function damagePlayer(amount) {
  const p = game.player;
  if (p.invuln > 0 || game.gameOver) return;
  p.hp -= amount;
  p.invuln = 0.55;
  game.damageFlash = 0.18;
  if (p.hp <= 0) {
    p.hp = 0;
    game.gameOver = true;
    game.paused = true;
    ui.overlay.classList.remove("hidden");
    ui.overlay.querySelector(".modal").innerHTML = `<h1>Game Over</h1><p>ร่ำรวยถูกฝูงแมวดำรุมจนล้ม ลองใหม่อีกที</p><button id="restartBtn">เล่นอีกครั้ง</button>`;
    document.getElementById("restartBtn").onclick = resetGame;
  }
}


function collideWithTrees(entity) {
  for (const tree of game.trees) {
    const tx = tree.x;
    const ty = tree.y;
    const r = 70 * tree.scale;
    const dx = entity.x - tx;
    const dy = entity.y - ty;
    const d = Math.hypot(dx, dy);
    const minDist = r + (entity.radius || 20);
    if (d < minDist) {
      const push = (minDist - d);
      const nx = dx / (d || 1);
      const ny = dy / (d || 1);
      entity.x += nx * push;
      entity.y += ny * push;
    }
  }
}

function update(dt) {
  if (!game.started || game.paused) return;
  game.time += dt;
  game.damageFlash = Math.max(0, game.damageFlash - dt);
  const p = game.player;
  p.invuln = Math.max(0, p.invuln - dt);

  const keyMx = (game.keys["ArrowRight"]||game.keys["d"]?1:0) - (game.keys["ArrowLeft"]||game.keys["a"]?1:0);
  const keyMy = (game.keys["ArrowDown"]||game.keys["s"]?1:0) - (game.keys["ArrowUp"]||game.keys["w"]?1:0);
  const mx = clamp(keyMx + touchState.dx, -1, 1);
  const my = clamp(keyMy + touchState.dy, -1, 1);
  let len = Math.hypot(mx,my) || 1;
  p.x += (mx/len) * p.speed * (1+p.stats.moveBonus) * dt * Math.min(1, Math.hypot(mx,my));
  p.y += (my/len) * p.speed * (1+p.stats.moveBonus) * dt * Math.min(1, Math.hypot(mx,my));
  p.x = clamp(p.x, 40, game.mapW-40);
  p.y = clamp(p.y, 40, game.mapH-40);
  collideWithTrees(p);

  game.camX = clamp(p.x - W/2, 0, game.mapW - W);
  game.camY = clamp(p.y - H/2, 0, game.mapH - H);

  const density = 1 + game.time / 110;
  game.spawnTimer -= dt;
  if (game.spawnTimer <= 0 && game.enemies.length < 150) {
    const spawns = clamp(Math.floor(density / 12), 1, 4);
    for (let i=0;i<spawns;i++) spawnEnemy();
    game.spawnTimer = Math.max(0.12, 0.7 - game.time/200);
  }

  if (!game.bossFlags.mid && game.time >= 300) { game.bossFlags.mid = true; spawnBoss("mid"); }
  if (!game.bossFlags.final && game.time >= 600) { game.bossFlags.final = true; spawnBoss("final"); }

  const pawW = p.weapons.paw;
  pawW.timer -= dt;
  if (pawW.timer <= 0) {
    firePaw();
    pawW.timer = pawW.cooldown * Math.pow(0.93, pawW.level-1) * p.stats.cooldownMult;
  }

  const clawW = p.weapons.claw;
  if (clawW.unlocked) {
    clawW.timer -= dt;
    if (clawW.timer <= 0) {
      fireClaw();
      clawW.timer = clawW.cooldown * Math.pow(0.91, Math.max(0, clawW.level-1)) * p.stats.cooldownMult;
    }
  }

  for (const b of game.bullets.slice()) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.ttl -= dt;
    if (b.ttl <= 0 || b.x < 0 || b.y < 0 || b.x > game.mapW || b.y > game.mapH) {
      game.bullets.splice(game.bullets.indexOf(b),1);
      continue;
    }
    for (const e of game.enemies.slice()) {
      if (dist(b,e) < b.radius + e.radius) {
        const bv = Math.hypot(b.vx, b.vy) || 1;
        hurtEnemy(e, b.damage, (b.vx / bv) * 4, (b.vy / bv) * 4);
        b.pierce -= 1;
        if (b.pierce <= 0) {
          game.bullets.splice(game.bullets.indexOf(b),1);
          break;
        }
      }
    }
  }

  for (const s of game.slashes.slice()) {
    s.life -= dt;
    if (s.life <= 0) {
      game.slashes.splice(game.slashes.indexOf(s),1);
      continue;
    }
    for (const e of game.enemies.slice()) {
      if (dist(s,e) < s.radius + e.radius) {
        hurtEnemy(e, s.damage * dt * 7.2, Math.cos(s.angle) * 1.2, Math.sin(s.angle) * 1.2);
      }
    }
  }

  for (const e of game.enemies.slice()) {
    const angle = Math.atan2(p.y - e.y, p.x - e.x);
    e.x += Math.cos(angle) * e.speed * dt;
    e.y += Math.sin(angle) * e.speed * dt;
    e.hitFlash = Math.max(0, e.hitFlash - dt);
    collideWithTrees(e);

    if (e.boss) {
      e.shootTimer -= dt;
      if (e.shootTimer <= 0) {
        e.shootTimer = e.bossType === "final" ? 1.2 : 1.8;
        const angleToP = Math.atan2(p.y-e.y, p.x-e.x);
        for (let i=-1;i<=1;i++) {
          const ang = angleToP + i * (e.bossType === "final" ? 0.22 : 0.3);
          game.bullets.push({
            x: e.x, y: e.y,
            vx: Math.cos(ang)*(e.bossType==="final"?250:200),
            vy: Math.sin(ang)*(e.bossType==="final"?250:200),
            radius: 14,
            damage: e.damage * 0.8,
            ttl: 3,
            img: "claw",
            enemyShot: true,
            pierce: 1
          });
        }
      }
    }

    if (dist(e,p) < e.radius + p.radius) {
      damagePlayer(e.damage);
    }
  }

  for (const d of game.drops.slice()) {
    const pickupRange = p.magnetRange;
    const dd = dist(d,p);
    if (d.type === "magnet" || dd < pickupRange) {
      const ang = Math.atan2(p.y-d.y, p.x-d.x);
      const speed = d.type === "magnet" ? 260 : 210;
      d.x += Math.cos(ang) * speed * dt;
      d.y += Math.sin(ang) * speed * dt;
    }
    if (dd < p.radius + d.radius + 6) {
      if (d.type === "exp") gainExp(d.amount); beep(880,0.05);
      if (d.type === "heal") p.hp = Math.min(p.maxHp, p.hp + d.amount); beep(520,0.1);
      
if (d.type === "magnet") {
        // instead of converting EXP into magnet type, pull them instantly
        for (const other of game.drops) {
          if (other.type === "exp") {
            const ang = Math.atan2(p.y-other.y, p.x-other.x);
            other.x += Math.cos(ang) * 60;
            other.y += Math.sin(ang) * 60;
          }
        }
      }
      if (d.type === "box") openChest(); beep(1200,0.12);
      game.drops.splice(game.drops.indexOf(d),1);
    }
  }

  for (const b of game.bullets.slice()) {
    if (b.enemyShot) {
      if (dist(b,p) < b.radius + p.radius) {
        damagePlayer(b.damage);
        game.bullets.splice(game.bullets.indexOf(b),1);
      }
    }
  }

  for (const t of game.floatTexts.slice()) {
    t.life -= dt;
    t.y -= 24*dt;
    if (t.life <= 0) game.floatTexts.splice(game.floatTexts.indexOf(t),1);
  }

  renderUI();
}

function drawImageCentered(img, x, y, w, h, alpha=1, angle=0) {
  if (!img || !img.complete) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.drawImage(img, -w/2, -h/2, w, h);
  ctx.restore();
}

function render() {
  ctx.clearRect(0,0,W,H);
  if (loaded < totalImages) {
    ctx.fillStyle = "#111";
    ctx.fillRect(0,0,W,H);
    ctx.fillStyle = "#fff";
    ctx.font = "28px sans-serif";
    ctx.fillText(`Loading ${loaded}/${totalImages}`, 48, 64);
    requestAnimationFrame(loop);
    return;
  }

  const bg = images.background;
  const pattern = ctx.createPattern(bg, "repeat");
  ctx.save();
  ctx.translate(-game.camX, -game.camY);
  ctx.fillStyle = pattern || "#86c65f";
  ctx.fillRect(game.camX, game.camY, W, H);
  ctx.restore();

  // map bounds
  ctx.save();
  ctx.translate(-game.camX, -game.camY);
  ctx.strokeStyle = "rgba(60,100,40,.35)";
  ctx.lineWidth = 18;
  ctx.strokeRect(0,0,game.mapW, game.mapH);

  for (const tree of game.trees) {
    drawImageCentered(images[tree.type], tree.x, tree.y, 220*tree.scale, 260*tree.scale);
  }

  for (const d of game.drops) {
    const imgMap = {exp:"exp", heal:"heal", magnet:"magnet", box:"itemBox"};
    const size = d.type==="exp"?38:48;
    drawImageCentered(images[imgMap[d.type]], d.x, d.y, size, size);
  }

  for (const b of game.bullets) {
    const size = b.enemyShot ? 34 : 42;
    const ang = Math.atan2(b.vy, b.vx);
    drawImageCentered(images[b.img], b.x, b.y, size, size, 1, ang);
  }

  for (const s of game.slashes) {
    drawImageCentered(images[s.img], s.x, s.y, s.radius*2.0, s.radius*0.95, Math.max(0.2, s.life/0.22), s.angle);
  }

  for (const e of game.enemies) {
    const img = images[e.img];
    const w = img.naturalWidth * e.scale;
    const h = img.naturalHeight * e.scale;
    if (e.hitFlash > 0) {
      ctx.save();
      ctx.filter = "brightness(1.5)";
      drawImageCentered(img, e.x, e.y, w, h);
      ctx.restore();
    } else {
      drawImageCentered(img, e.x, e.y, w, h);
    }
    if (e.boss) {
      ctx.fillStyle = "rgba(0,0,0,.55)";
      ctx.fillRect(e.x-60, e.y-h/2-18, 120, 10);
      ctx.fillStyle = e.bossType === "final" ? "#ff6b7e" : "#ffcf5b";
      ctx.fillRect(e.x-60, e.y-h/2-18, 120*(e.hp/e.maxHp), 10);
    }
  }

  const p = game.player;
  if (p) {
    if (game.damageFlash > 0) {
      ctx.save();
      ctx.filter = "brightness(1.18)";
      drawImageCentered(images.rumruay, p.x, p.y, 170, 170);
      ctx.restore();
    } else {
      drawImageCentered(images.rumruay, p.x, p.y, 170, 170);
    }
    if (p.invuln > 0) {
      ctx.strokeStyle = "rgba(255,255,255,.55)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 38, 0, Math.PI*2);
      ctx.stroke();
    }
  }

  for (const f of game.floatTexts) {
    ctx.globalAlpha = clamp(f.life/0.6, 0, 1);
    ctx.fillStyle = f.color;
    ctx.font = "bold 24px sans-serif";
    ctx.fillText(f.text, f.x, f.y);
    ctx.globalAlpha = 1;
  }

  ctx.restore();

  if (game.damageFlash > 0) {
    ctx.fillStyle = `rgba(255, 60, 60, ${game.damageFlash*0.22})`;
    ctx.fillRect(0,0,W,H);
  }
}

function renderUI() {
  const p = game.player;
  if (!p) return;
  ui.hpFill.style.width = `${(p.hp/p.maxHp)*100}%`;
  ui.hpText.textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
  ui.expFill.style.width = `${(p.exp/p.expToNext)*100}%`;
  ui.levelText.textContent = p.level;
  ui.timeText.textContent = `${fmt(Math.min(game.time, 600))} / 10:00`;
  ui.enemyCount.textContent = String(game.enemies.length);
  const lines = [];
  lines.push(`อุ้งเท้าพุ่ง Lv.${p.weapons.paw.level}`);
  if (p.weapons.claw.unlocked) lines.push(`กรงเล็บแดง Lv.${p.weapons.claw.level}`);
  else lines.push(`กรงเล็บแดง: ยังไม่ปลดล็อก`);
  ui.weaponList.textContent = lines.join("\n");
}

let last = 0;
function loop(ts) {
  const dt = Math.min(0.033, (ts-last)/1000 || 0);
  last = ts;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

window.addEventListener("keydown", e => {
  if (e.key.length === 1) game.keys[e.key.toLowerCase()] = true;
  game.keys[e.key] = true;
  if (e.key.toLowerCase() === "p" && game.started && !game.gameOver && ui.levelup.classList.contains("hidden")) {
    game.paused = !game.paused;
    if (game.paused) {
      ui.overlay.classList.remove("hidden");
      ui.overlay.querySelector(".modal").innerHTML = `<h1>หยุดชั่วคราว</h1><p>กด P อีกครั้งเพื่อเล่นต่อ</p>`;
    } else {
      ui.overlay.classList.add("hidden");
    }
  }
  if (e.key.toLowerCase() === "t" && game.started && !game.gameOver) {
    game.time = Math.min(598, game.time + 30);
  }
});
window.addEventListener("keyup", e => {
  if (e.key.length === 1) game.keys[e.key.toLowerCase()] = false;
  game.keys[e.key] = false;
});

ui.startBtn.onclick = resetGame;
initTouchControls();

requestAnimationFrame(loop);
