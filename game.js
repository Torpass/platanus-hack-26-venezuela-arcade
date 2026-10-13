// EL ASOMBROSO CHAMO ARAÑA — Platanus Hack 26: Caracas Arcade Challenge
// Sube el cerro guindao de los cables del barrio antes de que el corto te alcance.
// Todo vive dentro de una IIFE para que el minificador pueda acortar los nombres.
(() => {

const W = 800, H = 600;
const GRAV = 1250;     // gravedad
const REACH = 290;     // alcance del brazo para agarrar un cable
const CH = 600;        // alto de cada pedazo de barrio que se genera
const PX_M = 20;       // pixeles por metro (para mostrar la altura)

// DO NOT replace existing keys — they match the physical arcade cabinet wiring.
// To add local testing shortcuts, append extra keys to any array.
const CABINET_KEYS = {
  P1_U: ['w'],
  P1_D: ['s'],
  P1_L: ['a'],
  P1_R: ['d'],
  P1_1: ['u'],
  P1_2: ['i'],
  P1_3: ['o'],
  P1_4: ['j'],
  P1_5: ['k'],
  P1_6: ['l'],
  P2_U: ['ArrowUp'],
  P2_D: ['ArrowDown'],
  P2_L: ['ArrowLeft'],
  P2_R: ['ArrowRight'],
  P2_1: ['r'],
  P2_2: ['t'],
  P2_3: ['y'],
  P2_4: ['f'],
  P2_5: ['g'],
  P2_6: ['h'],
  START1: ['Enter'],
  START2: ['2'],
};

const KEYMAP = {};
for (const [code, keys] of Object.entries(CABINET_KEYS)) {
  for (const k of keys) KEYMAP[k.toLowerCase()] = code;
}

const BRICK = [0xb5532c, 0xc0643a, 0xa34a28, 0x9c4426, 0xc97b4a];
const PAINT = [0x4f9da6, 0xf2c14e, 0xe86a92, 0x7bc67b, 0xf4f1e8];
const SIGNS = ['SE VENDE HIELO', 'HAY GAS', 'SE HACEN TORTAS', 'BODEGA', 'CYBER',
  'SE LAVAN CARROS', 'TEQUENOS', 'HAY PAN', 'SE VENDE CHICHA', 'BARBERIA'];
const CHEERS = ['EPA!', 'ASI MISMO!', 'QUE NIVEL!', 'TA BUENO!', 'DURO!', 'BRUTAL!'];
const TRICKS = ['MORTAL!', 'TORNILLO!', 'SUPERMAN!', 'EPA LA GORRA!'];

let S, G, sky, hud = {};
let held = {}, hit = {};
let phase = 'title';
let clock = 0;
let P, PL = [];        // el chamo que se esta procesando y la lista de jugadores
let mode = 1, wins = [0, 0], runT = 0;
let cables = [], birds = [], bulbs = [], sparks = [];
let chunks = {};
// Capas de fondo con parallax: f = cuanto siguen a la camara, d = profundidad de dibujo.
const LAYERS = [
  { f: 0.16, d: 1.2 }, // cerro lejano
  { f: 0.42, d: 1.4 }, // cerro medio, en los lados
  { f: 1.35, d: 3.5 }, // primer plano oscuro, en los bordes
];
let lay = [{}, {}, {}], fog = [], NIGHT = 0, HAZE = 0xffd08a;
let nextBand = 0;      // altura (y) de la proxima franja de cables por generar
let corto = 0, cortoOn = false;
let best = 0;          // record de la sesion (modo solo)
let tut = 0;           // paso del tutorial
let deadT = 0, birdT = 0;
let boosts = [], egg = null, eggDone = false, EG;
let hint = '', hintT = 0, seenBoost = false, gaveBoost = false;

// ---------------------------------------------------------------- arranque

function create() {
  S = this;
  window.addEventListener('keydown', (e) => {
    const c = KEYMAP[(e.key || '').toLowerCase()];
    if (!c) return;
    if (!held[c]) hit[c] = true;
    held[c] = true;
    Snd.wake();
  });
  window.addEventListener('keyup', (e) => {
    const c = KEYMAP[(e.key || '').toLowerCase()];
    if (c) held[c] = false;
  });

  sky = S.add.graphics().setScrollFactor(0).setDepth(0);
  avila(S.add.graphics().setScrollFactor(0.05).setDepth(1));
  // neblina entre capas: lo lejano se funde con el color del cielo
  for (const d of [1.1, 1.3, 1.5]) fog.push(S.add.graphics().setScrollFactor(0).setDepth(d));
  if (S.renderer.type === Phaser.WEBGL) S.cameras.main.postFX.addVignette(0.5, 0.5, 0.95, 0.28);
  G = S.add.graphics().setDepth(3);
  EG = S.add.graphics().setScrollFactor(0).setDepth(2.5);
  hud.g = S.add.graphics().setScrollFactor(0).setDepth(5);

  const T = (x, y, size, color, depth) => S.add.text(x, y, '', {
    fontFamily: 'Arial Black, Arial, sans-serif',
    fontSize: size + 'px',
    color: color || '#fff4dc',
    stroke: '#1a0f08',
    strokeThickness: Math.max(4, size / 7),
    align: 'center',
  }).setOrigin(0.5).setScrollFactor(0).setDepth(depth || 6);
  hud.alt = T(90, 26, 22).setOrigin(0, 0.5);
  hud.pts = T(W - 20, 26, 22).setOrigin(1, 0.5);
  hud.tip = T(W / 2, H - 70, 26, '#ffd23f');
  hud.big = T(W / 2, 200, 70, '#ffd23f');
  hud.sub = T(W / 2, 270, 22);
  // logo estilo comic: "EL ASOMBROSO" chiquito arriba, "CHAMO ARAÑA" grande con sombra roja
  hud.pre = T(W / 2, 58, 30, '#fff4dc').setAngle(-3);
  hud.title = T(W / 2, 122, 86, '#ffd23f').setAngle(-3).setShadow(6, 6, '#cf142b', 0, true, true);
  hud.tag = T(W / 2, 195, 22, '#fff4dc');
  hud.menu = T(W / 2, 470, 20);
  hud.start = T(W / 2, 540, 30, '#ffd23f');

  Snd.init(S.sound.context);
  reset(true);
}

function down(c) { return held[c] === true; }

// Arma un barrio nuevo. En el titulo el chamo queda guindao meciendose solo.
function reset(title, m) {
  mode = m || 1;
  for (const k in chunks) destroyChunk(chunks[k]);
  for (const m of lay) for (const k in m) m[k].destroy();
  chunks = {}; lay = [{}, {}, {}];
  cables = []; birds = []; bulbs = []; sparks = [];
  boosts = []; egg = null; eggDone = false; EG.clear();
  hintT = 0; seenBoost = false; gaveBoost = false;
  nextBand = -190;
  corto = 160; cortoOn = false;
  tut = 0; birdT = 3; runT = 0;
  PL = [];
  for (let i = 0; i < mode; i++) PL.push(mkPlayer(i, mode === 1 ? 400 : 330 + i * 140));
  P = PL[0];
  S.cameras.main.scrollY = -H + 120;
  ensureWorld();
  phase = title ? 'title' : 'play';
  hud.pre.setText(title ? 'EL ASOMBROSO' : '');
  // la Ñ se arma con codigo: asi se ve bien aunque el navegador no lea el archivo como UTF-8
  hud.title.setText(title ? 'CHAMO ARA' + String.fromCharCode(209) + 'A' : '');
  hud.tag.setText(title ? 'SUBE EL CERRO GUINDAO DE LOS CABLES' : '');
  hud.menu.setText(title ? 'B1 MANTENER: AGARRARTE    B1 SOLTAR: VOLAR\nJOYSTICK: COLUMPIARTE Y SUBIR EL MECATE' : '');
  hud.start.setText(title ? 'START 1: SOLO      START 2: CARRERA DE 2' : '');
  hud.big.setText('');
  hud.sub.setText('');
  if (title) {
    // lo guindamos del primer cable para la pantalla de titulo
    const c = cables[0];
    P.att = { c, t: 0.5, L: 110, want: 110 };
    const a = cablePt(c, 0.5);
    P.x = a.x; P.y = a.y + 110; P.ground = false;
  }
}

// P1: gorra roja y franela vinotinto. P2: gorra azul y franela amarilla.
function mkPlayer(i, x) {
  return {
    i, k: 'P' + (i + 1) + '_', x, y: -22, vx: 0, vy: 0, att: null, a: 0, stun: 0, best: 0,
    ground: true, air: 0, look: 1, tr: null, boost: 0, alive: true, off: 0, grabbed: false,
    bonus: 0, combo: 0, score: 0,
    cap: i ? 0x2f7fe0 : 0xe63946, shirt: i ? 0xf2c14e : 0x7b1e3a, col: i ? '#7fb8ff' : '#ff8a8a',
  };
}

function startGame(m) {
  wins = [0, 0];
  reset(false, m);
}

function leader() {
  let l = null;
  for (const p of PL) if (p.alive && (!l || p.y < l.y)) l = p;
  return l || PL[0];
}

function trailer() {
  let l = null;
  for (const p of PL) if (p.alive && (!l || p.y > l.y)) l = p;
  return l || PL[0];
}

// ---------------------------------------------------------------- mundo

function ensureWorld() {
  const top = S.cameras.main.scrollY;
  // pedazos del barrio (se generan arriba y se borran abajo)
  const k0 = Math.max(-1, Math.floor(-(top + H + 600) / CH)), k1 = Math.floor(-top / CH) + 1;
  for (let k = k0; k <= k1; k++) if (!chunks[k]) chunks[k] = makeChunk(k);
  for (const k in chunks) {
    if (-k * CH > top + H + 900) { destroyChunk(chunks[k]); delete chunks[k]; }
  }
  // capas de fondo y primer plano: cada una con su propio ritmo
  LAYERS.forEach((L, li) => {
    const ft = top * L.f, m = lay[li];
    for (let k = Math.floor(-(ft + H) / CH); k <= Math.ceil(-ft / CH); k++) {
      if (!m[k] && (li < 2 || k >= 0)) m[k] = makeLayer(li, k);
    }
    for (const k in m) {
      if (-k * CH > ft + H + CH * 2 || -(+k + 1) * CH < ft - CH * 3) { m[k].destroy(); delete m[k]; }
    }
  });
  cables = cables.filter((c) => Math.min(c.ay, c.by) < corto + 300);
  bulbs = bulbs.filter((b) => b.y < corto + 200 && !b.got);
  boosts = boosts.filter((b) => b.y < corto + 200 && !b.got);
}

function destroyChunk(ch) {
  ch.g.destroy();
  for (const t of ch.t) t.destroy();
}

function makeChunk(k) {
  const g = S.add.graphics().setDepth(2);
  const ch = { g, t: [] };
  const y0 = -k * CH, y1 = y0 - CH; // y0 abajo, y1 arriba
  NIGHT = nightAt(k * CH / PX_M);
  if (k === -1) {
    street(g, ch);
    return ch;
  }
  // ranchos solo en los lados: el centro queda limpio para los cables
  for (const side of [0, 1]) {
    let y = y0;
    while (y > y1) {
      const w = 90 + Math.random() * 90, h = 60 + Math.random() * 50;
      const x = side ? W - w / 2 - Math.random() * 30 + 10 : w / 2 + Math.random() * 30 - 10;
      house(g, ch, x, y, 1, w, h);
      y -= h + 10 + Math.random() * 20;
    }
  }
  // franjas de cables que cruzan el barrio
  while (nextBand > y1) {
    band(g, nextBand);
    nextBand -= 115 + Math.random() * 50 + Math.min(30, -nextBand / 400);
  }
  return ch;
}

function band(g, y) {
  const ax = 30 + Math.random() * 170, bx = W - 30 - Math.random() * 170;
  const ay = y + (Math.random() - 0.5) * 50, by = y + (Math.random() - 0.5) * 50;
  const c = {
    ax, ay, bx, by,
    sag: Math.min(25 + Math.random() * 45, -110 - Math.max(ay, by)),
    dip: 0, wob: 0,
    hot: -ay > 1600 && Math.random() < Math.min(0.5, -ay / 9000), ph: Math.random() * 5,
  };
  cables.push(c);
  pole(g, ax, ay);
  pole(g, bx, by);
  // a veces un segundo cable enredado entre los mismos postes
  if (Math.random() < 0.45) {
    cables.push({ ax, ay: ay + 6, bx, by: by + 6, sag: Math.min(c.sag + 25 + Math.random() * 30, -120 - Math.max(ay, by)), dip: 0, wob: 0, hot: false, ph: 0 });
  }
  // bombillo para recoger, colgando cerca del cable
  if (Math.random() < 0.55) {
    const p = cablePt(c, 0.25 + Math.random() * 0.5);
    bulbs.push({ x: p.x, y: p.y + 70 + Math.random() * 50, got: false });
  }
  // bombonas de gas (propulsores) a partir de los 120 m; la primera es segura
  if (-y > 120 * PX_M && (!gaveBoost || Math.random() < 0.14)) {
    gaveBoost = true;
    const p = cablePt(c, 0.3 + Math.random() * 0.4);
    boosts.push({ x: p.x, y: p.y - 75, got: false });
  }
}

function pole(g, x, y) {
  g.fillStyle(nt(0x7d7b74));
  g.fillRect(x - 5, y - 16, 10, 190);
  g.fillStyle(nt(0xa9a79f));
  g.fillRect(x - 5, y - 16, 4, 190);
  g.fillStyle(nt(0x5f5d57));
  g.fillRect(x - 24, y - 6, 48, 6);
  if (Math.random() < 0.4) {
    // transformador
    g.fillStyle(nt(0x6e747a));
    g.fillRoundedRect(x + 6, y + 10, 18, 28, 4);
    g.fillStyle(nt(0x4a4f54));
    g.fillRect(x + 6, y + 16, 18, 3);
  }
}

function house(g, ch, x, base, light, w, h) {
  w = w || 70 + Math.random() * 80;
  h = h || 50 + Math.random() * 50;
  const painted = Math.random() < 0.3;
  const col = painted ? PAINT[Math.floor(Math.random() * PAINT.length)] : BRICK[Math.floor(Math.random() * BRICK.length)];
  const L = nt;
  const l = x - w / 2, t = base - h;
  g.fillStyle(L(col));
  g.fillRect(l, t, w, h);
  if (!painted) {
    // lineas de bloques
    g.lineStyle(1, L(0x6b2e18), 0.5);
    for (let yy = t + 8; yy < base; yy += 8) g.lineBetween(l, yy, l + w, yy);
  }
  // ventanas con rejas
  const n = Math.max(1, Math.floor(w / 45));
  for (let i = 0; i < n; i++) {
    const wx = l + (i + 0.5) * w / n - 11, wy = t + h * 0.3;
    const lit = Math.random() < 0.35 + NIGHT * 0.35;
    if (lit && NIGHT > 0.2) {
      // de noche las ventanas encendidas alumbran la pared
      g.fillStyle(0xffb347, 0.14 * NIGHT);
      g.fillCircle(wx + 11, wy + 10, 30);
    }
    g.fillStyle(lit ? 0xffd27a : L(0x2b2230));
    g.fillRect(wx, wy, 22, 20);
    g.lineStyle(2, L(0x222222), 0.9);
    g.lineBetween(wx + 7, wy, wx + 7, wy + 20);
    g.lineBetween(wx + 15, wy, wx + 15, wy + 20);
  }
  // techo: zinc o platabanda con tanque azul
  const r = Math.random();
  if (r < 0.5) {
    g.fillStyle(L(0x8a8f94));
    g.fillRect(l - 6, t - 7, w + 12, 8);
    g.lineStyle(1, L(0x5d6166), 1);
    for (let xx = l - 4; xx < l + w + 6; xx += 6) g.lineBetween(xx, t - 7, xx, t + 1);
  } else {
    g.fillStyle(L(0x8f8a80));
    g.fillRect(l - 3, t - 4, w + 6, 5);
    if (r < 0.85) {
      const tx = l + 10 + Math.random() * (w - 40);
      g.fillStyle(L(0x1f5fbf));
      g.fillRoundedRect(tx, t - 30, 26, 27, 5);
      g.fillStyle(L(0x3f7fe0));
      g.fillRect(tx + 3, t - 27, 5, 20);
    }
    if (Math.random() < 0.4) {
      // antena
      const ax = l + w - 15;
      g.lineStyle(2, L(0x333333), 1);
      g.lineBetween(ax, t - 4, ax, t - 40);
      g.lineBetween(ax - 10, t - 34, ax + 10, t - 34);
      g.lineBetween(ax - 7, t - 26, ax + 7, t - 26);
    }
  }
  // ropa tendida
  if (Math.random() < 0.35) {
    g.lineStyle(1, 0x222222, 1);
    g.lineBetween(l, t + 6, l + w, t + 6);
    for (let xx = l + 8; xx < l + w - 14; xx += 18) {
      g.fillStyle(L(PAINT[Math.floor(Math.random() * PAINT.length)]));
      g.fillRect(xx, t + 6, 12, 14 + Math.random() * 8);
    }
  }
  // banderita
  if (Math.random() < 0.08) flag(g, l + 8, t - 40);
  // cartel pintado a mano
  if (Math.random() < 0.3) {
    const s = S.add.text(x, base - 12, SIGNS[Math.floor(Math.random() * SIGNS.length)], {
      fontFamily: 'Arial Black, Arial', fontSize: '11px', color: '#1a0f08',
      backgroundColor: '#f4ecd8', padding: { x: 3, y: 1 },
    }).setOrigin(0.5).setDepth(2).setAngle((Math.random() - 0.5) * 6);
    ch.t.push(s);
  }
}

function flag(g, x, y) {
  g.lineStyle(2, 0x444444);
  g.lineBetween(x, y, x, y + 36);
  g.fillStyle(0xffcc00); g.fillRect(x + 1, y, 30, 6);
  g.fillStyle(0x0033a0); g.fillRect(x + 1, y + 6, 30, 6);
  g.fillStyle(0xcf142b); g.fillRect(x + 1, y + 12, 30, 6);
  g.fillStyle(0xffffff);
  for (let i = 0; i < 8; i++) {
    const a = Math.PI * (1.15 + i * 0.1);
    g.fillRect(x + 16 + Math.cos(a) * 6, y + 10 + Math.sin(a) * 4, 1.5, 1.5);
  }
}

// La calle de abajo: donde arranca todo.
function street(g, ch) {
  g.fillStyle(0x3a3a3f);
  g.fillRect(0, 0, W, CH);
  g.fillStyle(0x8f8a80);
  g.fillRect(0, 0, W, 10);
  g.lineStyle(4, 0xf2c14e, 0.8);
  for (let x = 20; x < W; x += 80) g.lineBetween(x, 60, x + 40, 60);
  house(g, ch, 120, 0, 1, 200, 120);
  house(g, ch, 680, 0, 1, 200, 110);
  const s = S.add.text(400, -18, 'PETARE', {
    fontFamily: 'Arial Black, Arial', fontSize: '16px', color: '#fff4dc',
    backgroundColor: '#0033a0', padding: { x: 6, y: 2 },
  }).setOrigin(0.5, 1).setDepth(2);
  ch.t.push(s);
  g.fillStyle(0x7d7b74);
  g.fillRect(396, -60, 8, 44);
}

// Que tan de noche es a cierta altura (en metros): 0 atardecer, 1 noche.
function nightAt(m) {
  return Math.min(1, Math.max(0, m / 220));
}

// Color de la capa de juego segun la hora: de noche todo se apaga un poco.
function nt(c) {
  return mix(c, 0x140c1e, NIGHT * 0.55);
}

// Capas de fondo: cerros llenos de ranchos simplificados con lucecitas.
// El lejano tiene islas de casas con cielo entre ellas; el medio cubre los lados.
function makeLayer(li, k) {
  const L = LAYERS[li], g = S.add.graphics().setScrollFactor(L.f).setDepth(L.d);
  const y0 = -k * CH, n = nightAt(k * CH / (L.f * PX_M));
  if (li === 2) {
    foreground(g, y0);
    return g;
  }
  const base = li ? 0x5a3442 : 0x4a3a5c, sc = li ? 1 : 0.55;
  // islas: [centro, medio ancho, arriba, abajo]. Lejos: 1-2 lomas redondeadas; medio: los lados.
  const isl = li ? [[0, 120 + Math.random() * 90, y0 - CH, y0 + 30], [W, 120 + Math.random() * 90, y0 - CH, y0 + 30]]
    : [0, 1].slice(0, 1 + (Math.random() < 0.5)).map(() => {
      const t = y0 - CH * Math.random() * 0.5;
      return [80 + Math.random() * (W - 160), 70 + Math.random() * 70, t, t + CH * (0.45 + Math.random() * 0.4)];
    });
  for (const [cx, r, yt, yb] of isl) {
    // de arriba hacia abajo: las filas de abajo tapan a las de arriba (ladera)
    for (let y = yt + Math.random() * 30; y < yb; y += (22 + Math.random() * 16) * sc) {
      const hw = li ? r : r * Math.sqrt(Math.sin(Math.PI * (y - yt) / (yb - yt)));
      const x1 = cx + hw;
      for (let x = cx - hw + Math.random() * 20; x < x1; ) {
        const w = (40 + Math.random() * 50) * sc, h = (34 + Math.random() * 30) * sc;
        const c = mix(mix(Math.random() < 0.3 ? PAINT[Math.floor(Math.random() * 5)] : BRICK[Math.floor(Math.random() * 5)], base, li ? 0.62 : 0.8), 0x120a1c, n * 0.55);
        g.fillStyle(c);
        g.fillRect(x, y - h, w, h);
        g.fillStyle(mix(c, 0x000000, 0.25));
        g.fillRect(x - 2, y - h - 3 * sc, w + 4, 4 * sc);
        for (let i = 0; i < 3; i++) {
          if (Math.random() < 0.12 + n * 0.45) {
            g.fillStyle(0xffd27a, 0.55 + Math.random() * 0.45);
            g.fillRect(x + 4 * sc + Math.random() * (w - 12 * sc), y - h + (6 + Math.random() * 10) * sc, 6 * sc, 5 * sc);
          }
        }
        x += w + Math.random() * 6;
      }
    }
  }
  if (li) {
    // cables lejanos (finitos, de adorno) que dan profundidad
    g.lineStyle(1.5, mix(base, 0x000000, 0.4), 0.8);
    for (let i = 0; i < 3; i++) {
      const y = y0 - Math.random() * CH, d = 30 + Math.random() * 40;
      g.beginPath();
      for (let j = 0; j <= 16; j++) {
        const t = j / 16, yy = y + d * 4 * t * (1 - t);
        j ? g.lineTo(t * W, yy) : g.moveTo(0, yy);
      }
      g.strokePath();
    }
  }
  return g;
}

// El Avila al fondo: dos crestas que se hunden lento mientras subes.
function avila(g) {
  [[0x6c7a9a, 200, 0.6], [0x3a4d64, 250, 1]].forEach(([c, y, a]) => {
    g.fillStyle(c, a);
    g.beginPath();
    g.moveTo(-200, 3000);
    for (let x = -200; x <= W + 200; x += 40) {
      const t = (x + 200) / (W + 400);
      g.lineTo(x, y + 60 - Math.sin(t * Math.PI) * 110 + Math.sin(x * 0.03 + y) * 12);
    }
    g.lineTo(W + 200, 3000);
    g.closePath();
    g.fillPath();
  });
}

// Primer plano: siluetas casi negras en los bordes (matas y cables colgando).
function foreground(g, y0) {
  const D = 0x0b0610;
  for (let i = 0; i < 2; i++) {
    const right = Math.random() < 0.5, y = y0 - Math.random() * CH, s = right ? -1 : 1;
    const bx = right ? W + 10 : -10;
    g.fillStyle(D, 0.96);
    g.lineStyle(6, D, 0.96);
    if (Math.random() < 0.55) {
      // mata: hojas largas en abanico (cada hoja es un rombo)
      for (let j = 0; j < 6; j++) {
        const a = -0.2 - j * 0.32, L = 60 + Math.random() * 50;
        const ex = bx + Math.cos(a) * L * s, ey = y + Math.sin(a) * L;
        const mx = (bx + ex) / 2, my = (y + ey) / 2, nx = -Math.sin(a) * 9, ny = Math.cos(a) * 9;
        g.fillTriangle(bx, y, mx + nx, my + ny, ex, ey);
        g.fillTriangle(bx, y, mx - nx, my - ny, ex, ey);
      }
      g.fillCircle(bx, y + 10, 26);
    } else {
      // dos cables gruesos que entran desde afuera y cuelgan
      for (let j = 0; j < 2; j++) {
        g.beginPath();
        for (let q = 0; q <= 12; q++) {
          const t = q / 12, x = bx + s * t * (120 + j * 40), yy = y + j * 14 + Math.sin(t * Math.PI) * (60 + j * 20) - t * 40;
          q ? g.lineTo(x, yy) : g.moveTo(x, yy);
        }
        g.strokePath();
      }
    }
  }
}

// Punto de un cable en t (0..1), con la comba y el hundido donde te agarras.
function cablePt(c, t) {
  let x = c.ax + (c.bx - c.ax) * t;
  let y = c.ay + (c.by - c.ay) * t + c.sag * 4 * t * (1 - t);
  if (c.dip || c.wob) {
    const d = (t - (c.dt || 0.5)) / 0.18;
    y += (c.dip + c.wob * Math.sin(clock * 22)) * Math.exp(-d * d);
  }
  return { x, y };
}

// ---------------------------------------------------------------- bucle

function update(time, ms) {
  const dt = Math.min(ms / 1000, 0.04);
  clock += dt;
  Snd.tick();

  if (phase === 'title') {
    titleUpdate(dt);
    if (hit.START1 || hit.P1_1) startGame(1);
    else if (hit.START2 || hit.P2_1) startGame(2);
  } else if (phase === 'play') {
    play(dt);
  } else if (phase === 'round') {
    // el ganador de la ronda sigue guindao un ratico
    for (const p of PL) if (p.alive) { P = p; stepPlayer(dt); }
    stepCables(dt);
    if ((deadT -= dt) <= 0) afterRound();
  } else if (phase === 'dead') {
    deadT += dt;
    stepCables(dt);
    if (deadT > 1.2) {
      if (hit.START1) startGame(1);
      else if (hit.START2) startGame(2);
      else if (hit.P1_1 || hit.P2_1) startGame(mode);
    }
  }

  if (egg) eggStep(dt);
  stepSparks(dt);
  draw();
  hit = {};
}

function titleUpdate(dt) {
  // el chamo se mece solo en la pantalla de titulo
  P = PL[0];
  physics(dt, Math.sin(clock * 2.2), 0);
  stepCables(dt);
}

function play(dt) {
  runT += dt;
  for (const p of PL) if (p.alive) { P = p; stepPlayer(dt); }
  stepCables(dt);
  const lead = leader(), top = S.cameras.main.scrollY;

  // zamuros
  birdT -= dt;
  const h = lead.best / PX_M;
  if (birdT <= 0 && h > 25) {
    birdT = Math.max(1.3, 5 - h / 80) + Math.random() * 2;
    const left = Math.random() < 0.5;
    birds.push({ x: left ? -40 : W + 40, y: top + 80 + Math.random() * 260, vx: (left ? 1 : -1) * (110 + Math.random() * 80 + h * 0.3), ph: Math.random() * 6 });
  }
  for (const b of birds) {
    b.x += b.vx * dt;
    b.ph += dt * 9;
    for (const p of PL) {
      if (p.alive && p.stun <= 0 && p.boost <= 0 && Math.hypot(b.x - p.x, b.y + Math.sin(b.ph) * 6 - p.y) < 26) {
        P = p;
        shock('ZAMURO!');
      }
    }
  }
  birds = birds.filter((b) => b.x > -80 && b.x < W + 80);

  if (mode === 2) bump();

  if (!eggDone && lead.best / PX_M >= 300) {
    eggDone = true;
    egg = { t: 0, b: [], bt: 0, ct: 0, said: false };
  }

  // el corto sube desde abajo, siguiendo al que va de primero
  if (cortoOn) {
    const sp = 16 + Math.min(70, lead.best / 120);
    corto = Math.min(corto - sp * dt, -lead.best + 760);
  }

  // camara: en carrera encuadra a los dos, pero el de adelante manda
  const cam = S.cameras.main;
  let fy = lead.y - H * 0.55;
  if (mode === 2) fy = Math.min(lead.y - 140, (lead.y + trailer().y) / 2 - H / 2 - 30);
  const want2 = Math.min(fy, corto - H + 70);
  cam.scrollY += (want2 - cam.scrollY) * Math.min(1, dt * (lead.boost > 0 ? 12 : 5));

  // eliminaciones: te agarra el corto, o en carrera te quedas fuera de la pantalla
  for (const p of PL) {
    if (!p.alive) continue;
    p.off = mode === 2 && p.y > cam.scrollY + H + 30 ? p.off + dt : 0;
    if (p.y > corto - 8) out(p, 'TE AGARRO EL CORTO!');
    else if (p.off > 0.5) out(p, 'TE QUEDASTE!');
    if (phase !== 'play') return;
  }

  ensureWorld();
  P = PL[0];
  tutorial();
  if (hintT > 0) {
    hintT -= dt;
    hud.tip.setText(hint);
  }

  if (mode === 1) {
    hud.alt.setText(Math.floor(P.best / PX_M) + ' m').setColor('#fff4dc');
    hud.pts.setText(P.score + ' PTS').setColor('#fff4dc');
  } else {
    hud.alt.setText('P1  ' + Math.floor(PL[0].best / PX_M) + ' m').setColor(PL[0].col);
    hud.pts.setText(Math.floor(PL[1].best / PX_M) + ' m  P2').setColor(PL[1].col);
  }
}

// Todo lo de un jugador: control, mecate, bombona, trucos, bombillos.
function stepPlayer(dt) {
  const k = P.k;
  const ix = (down(k + 'R') ? 1 : 0) - (down(k + 'L') ? 1 : 0);
  const iy = (down(k + 'D') ? 1 : 0) - (down(k + 'U') ? 1 : 0);
  if (ix) P.look = ix;

  P.stun -= dt;
  const want = down(k + '1');
  if (P.att && !want) letGo();
  if (!P.att && want && P.stun <= 0 && P.boost <= 0) {
    const tg = target(ix, iy);
    if (tg) grab(tg);
  }

  physics(dt, ix, iy);

  // montado en la bombona: sube disparado y remata con doble voltereta
  if (P.boost > 0) {
    P.boost -= dt;
    P.vy = -1050;
    P.vx *= 0.92;
    P.a = 0;
    sparks.push({ x: P.x + (Math.random() - 0.5) * 12, y: P.y + 56, vx: (Math.random() - 0.5) * 120, vy: 200 + Math.random() * 200, life: 0.35, c: Math.random() < 0.5 ? 0xff9f1c : 0xffd23f });
    if (P.boost <= 0) {
      P.vy = -500;
      trick(0, 2, 0.9);
      pop(P.x, P.y - 50, 'VOLTERETA!', '#ff9f1c');
      P.bonus += 200;
    }
  }
  if (P.tr && (P.tr.t += dt) >= P.tr.d) P.tr = null;

  // shock si estas agarrado de un cable con corriente
  if (P.att && P.att.c.hot && hotOn(P.att.c)) {
    shock('CORRIENTAZO!');
  }

  // bombillos
  for (const b of bulbs) {
    if (!b.got && Math.hypot(b.x - P.x, b.y - P.y) < 28) {
      b.got = true;
      P.bonus += 50;
      Snd.ding();
      pop(b.x, b.y, '+50', '#ffd23f');
      burst(b.x, b.y, 10, 0xffd23f);
    }
  }

  // bombonas
  const top = S.cameras.main.scrollY;
  for (const b of boosts) {
    if (!b.got && Math.hypot(b.x - P.x, b.y - P.y) < 36) {
      b.got = true;
      if (P.att) letGo(true);
      P.boost = 1.3;
      P.tr = null;
      P.bonus += 100;
      Snd.rocket();
      S.cameras.main.shake(300, 0.006);
      pop(b.x, b.y - 40, 'BOMBONAZO!', '#ff9f1c');
    }
    if (!seenBoost && !b.got && b.y > top + 60 && b.y < top + H - 120) {
      seenBoost = true;
      hint = 'TOCA LA BOMBONA PA SALIR VOLANDO!';
      hintT = 3.5;
    }
  }

  // altura y puntos
  if (-P.y > P.best) P.best = -P.y;
  P.score = Math.floor(P.best / PX_M) * 10 + P.bonus;
}

// En carrera los chamos chocan: el que va mas rapido tumba al otro.
function bump() {
  const [a, b] = PL;
  if (!a.alive || !b.alive) return;
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
  if (d > 30 || !d) return;
  const nx = dx / d, ny = dy / d;
  const close = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
  a.x -= nx * (30 - d) / 2; a.y -= ny * (30 - d) / 2;
  b.x += nx * (30 - d) / 2; b.y += ny * (30 - d) / 2;
  if (close <= 0) return;
  if (close > 220 && a.stun <= 0 && b.stun <= 0 && a.boost <= 0 && b.boost <= 0) {
    const fa = Math.hypot(a.vx, a.vy) > Math.hypot(b.vx, b.vy);
    P = fa ? b : a;
    shock('PA FUERA!');
    const n = fa ? 1 : -1;
    P.vx += nx * n * 380;
    P.vy += ny * n * 200;
  } else {
    a.vx -= close * nx; a.vy -= close * ny;
    b.vx += close * nx; b.vy += close * ny;
  }
}

// Un jugador queda fuera. En solo se acaba la partida; en carrera, la ronda.
function out(p, msg) {
  P = p;
  if (p.att) letGo(true);
  p.alive = false;
  burst(p.x, Math.min(p.y, corto), 24, 0x7fe0ff);
  Snd.zap();
  if (mode === 1) {
    die(msg);
    return;
  }
  pop(Phaser.Math.Clamp(p.x, 120, W - 120), Math.min(p.y, corto, S.cameras.main.scrollY + H - 60) - 40, msg, p.col);
  S.cameras.main.shake(250, 0.012);
  const alive = PL.filter((q) => q.alive);
  if (alive.length > 1) return;
  phase = 'round';
  deadT = 2.5;
  hud.tip.setText('');
  if (!alive.length) {
    say('EMPATE!', 'SE FUERON LOS DOS', '#fff4dc');
    return;
  }
  const w = alive[0].i;
  wins[w]++;
  Snd.tune(true);
  say('GANA P' + (w + 1) + '!', 'P1  ' + wins[0] + ' - ' + wins[1] + '  P2', PL[w].col);
}

function afterRound() {
  const w = wins[0] >= 2 ? 0 : wins[1] >= 2 ? 1 : -1;
  if (w < 0) {
    reset(false, 2);
    return;
  }
  phase = 'dead';
  deadT = 0;
  say('P' + (w + 1) + ' GANA LA CARRERA!', 'P1  ' + wins[0] + ' - ' + wins[1] + '  P2\n\nSTART 2: REVANCHA    START 1: SOLO', PL[w].col);
}

function say(big, sub, color) {
  hud.big.setText(big).setColor(color || '#ffd23f').setScale(0.4);
  S.tweens.add({ targets: hud.big, scale: big.length > 14 ? 0.75 : 1, duration: 400, ease: 'Back.Out' });
  hud.sub.setText(sub);
}

function physics(dt, ix, iy) {
  const steps = 3, h = dt / steps;
  for (let s = 0; s < steps; s++) {
    P.vy += GRAV * h;
    if (P.att) {
      const at = P.att;
      // subir o bajar por el mecate
      // el mecate se recoge solo hasta un largo comodo; arriba/abajo lo ajustan
      if (at.L > at.want) at.L = Math.max(at.want, at.L - 650 * h);
      if (iy < 0) at.want = at.L = Math.max(55, at.L - 230 * h);
      if (iy > 0) at.want = at.L = Math.min(300, at.L + 230 * h);
      P.vx += ix * 950 * h;
    } else if (!P.ground) {
      P.vx += ix * 300 * h;
    } else {
      P.vx = ix * 160;
    }
    P.vx *= 1 - 0.15 * h;
    P.x += P.vx * h;
    P.y += P.vy * h;
    if (P.att) {
      const a = cablePt(P.att.c, P.att.t);
      const dx = P.x - a.x, dy = P.y - a.y, r = Math.hypot(dx, dy) || 1;
      if (r > P.att.L) {
        const nx = dx / r, ny = dy / r;
        P.x = a.x + nx * P.att.L;
        P.y = a.y + ny * P.att.L;
        const vr = P.vx * nx + P.vy * ny;
        if (vr > 0) { P.vx -= vr * nx; P.vy -= vr * ny; }
      }
      P.a = Math.atan2(dx, -dy) + Math.PI;
    } else {
      P.a += (Phaser.Math.Clamp(P.vx / 900, -0.6, 0.6) - P.a) * Math.min(1, h * 6);
    }
    // el piso de la calle
    if (P.y > -22 && P.y < 40) {
      P.y = -22;
      if (P.vy > 0) P.vy = 0;
      P.ground = true;
    } else {
      P.ground = false;
    }
    // paredes del barrio
    if (P.x < 16) { P.x = 16; P.vx = Math.abs(P.vx) * 0.4; }
    if (P.x > W - 16) { P.x = W - 16; P.vx = -Math.abs(P.vx) * 0.4; }
  }
  if (!P.att && !P.ground) P.air += dt; else P.air = 0;
  const v = Math.hypot(P.vx, P.vy);
  if (v > 1100) { P.vx *= 1100 / v; P.vy *= 1100 / v; }
}

// Busca el punto de cable mas conveniente: cerca, arriba y hacia donde apuntas.
function target(ix, iy) {
  let dx = ix, dy = iy < 0 ? -1 : iy > 0 ? 0.3 : -0.8;
  if (!ix) dx = Phaser.Math.Clamp(P.vx / 600, -0.8, 0.8);
  const dl = Math.hypot(dx, dy) || 1;
  dx /= dl; dy /= dl;
  let bestS = 1e9, res = null;
  for (const c of cables) {
    for (let i = 1; i < 24; i++) {
      const t = i / 24, p = cablePt(c, t);
      const ex = p.x - P.x, ey = p.y - P.y, d = Math.hypot(ex, ey);
      if (d > REACH || d < 30) continue;
      let sc = d - (ex * dx + ey * dy) / d * 140;
      if (ey > -20) sc += 400; // casi nunca agarrar cables que estan debajo
      if (c.hot && hotOn(c, 0.3)) sc += 600;
      if (sc < bestS) { bestS = sc; res = { c, t, x: p.x, y: p.y, d }; }
    }
  }
  return res;
}

function grab(tg) {
  P.tr = null;
  // largo comodo: hasta 115, y sin raspar la calle al columpiarse
  P.att = { c: tg.c, t: tg.t, L: Math.max(55, tg.d), want: Math.max(55, Math.min(tg.d, 115, -60 - tg.y)) };
  tg.c.dt = tg.t;
  tg.c.wob = 10;
  P.ground = false;
  P.grabbed = true;
  Snd.tone(1800, 0.05, 'square', 0.05, 2600);
  burst(tg.x, tg.y, 5, 0xfff4dc);
  if (!cortoOn) cortoOn = true;
  if (P.air > 0.45 && -P.vy > -200) {
    const c = ++P.combo;
    if (c >= 2) {
      P.bonus += c * 20;
      pop(P.x, P.y - 40, CHEERS[Math.min(c - 2, CHEERS.length - 1)], '#7fe0ff');
      Snd.tone(900 + c * 80, 0.1, 'triangle', 0.05);
    }
  } else if (P.air < 0.15) {
    P.combo = 0;
  }
}

function letGo(quiet) {
  const c = P.att.c, L = P.att.L;
  c.wob = 22;
  c.dip = 0;
  P.att = null;
  if (quiet) return;
  // impulso extra si sueltas con buena velocidad hacia arriba
  if (P.vy < -200) { P.vx *= 1.1; P.vy *= 1.25; }
  Snd.tone(500, 0.18, 'sine', 0.05, 1100);
  // con mecate largo y buen impulso, a veces echa un truco
  if (L > 95 && Math.hypot(P.vx, P.vy) > 600 && P.vy < -150 && Math.random() < 0.65) {
    const k = Phaser.Math.Between(0, 3);
    trick(k, 1, [0.6, 0.65, 0.8, 0.8][k]);
    P.bonus += 100;
    pop(P.x, P.y - 50, TRICKS[k], '#ff9f1c');
    Snd.tone(700, 0.25, 'triangle', 0.05, 1400);
  }
}

function trick(k, n, d) {
  P.tr = { k, n, d, t: 0, s: P.vx >= 0 ? 1 : -1 };
}

function shock(msg) {
  if (P.att) letGo(true);
  P.stun = 0.7;
  P.vy = Math.max(P.vy, 150);
  P.vx *= -0.5;
  P.combo = 0;
  S.cameras.main.shake(180, 0.012);
  Snd.zap();
  burst(P.x, P.y, 16, 0x7fe0ff);
  pop(P.x, P.y - 40, msg, '#ff6b5b');
}

function die(msg) {
  phase = 'dead';
  deadT = 0;
  best = Math.max(best, P.score);
  S.cameras.main.shake(400, 0.02);
  S.cameras.main.flash(250, 160, 230, 255);
  Snd.zap();
  Snd.tune();
  say(msg, Math.floor(P.best / PX_M) + ' METROS   ' + P.score + ' PTS\nRECORD: ' + best + '\n\nSTART 1: OTRA    START 2: CARRERA', '#ffd23f');
  hud.tip.setText('');
}

function stepCables(dt) {
  for (const c of cables) {
    const target = PL.some((p) => p.att && p.att.c === c) ? 14 : 0;
    c.dip += (target - c.dip) * Math.min(1, dt * 10);
    c.wob *= Math.exp(-dt * 3);
  }
}

function hotOn(c, pre) {
  // ciclo: 3s tranquilo, luego 1.3s con corriente; pre adelanta el aviso
  const t = (clock + c.ph) % 4.3;
  return t > 3 - (pre || 0);
}

// Carteles que aparecen solo cuando hacen falta.
function tutorial() {
  let s = '';
  if (mode === 2) {
    s = PL.some((p) => !p.grabbed) ? 'MANTEN  B1  PARA AGARRARTE' : runT < 6 ? 'EL QUE SE QUEDE ATRAS, PIERDE!' : '';
  } else if (tut === 0) {
    s = 'MANTEN  B1  PARA AGARRARTE DEL CABLE';
    if (P.att) tut = 1;
  } else if (tut === 1) {
    s = '<  >  PARA COLUMPIARTE';
    if (!P.att) tut = 0;
    if (Math.abs(P.vx) > 260) tut = 2;
  } else if (tut === 2) {
    s = 'SUELTA  B1  PARA VOLAR';
    if (!P.att) { tut = 3; S.time.delayedCall(2600, () => { if (tut === 3) tut = 4; }); }
  } else if (tut === 3) {
    s = 'SUBE! QUE VIENE EL CORTO!';
  }
  hud.tip.setText(s).setAlpha(0.75 + Math.sin(clock * 6) * 0.25);
}

// ---------------------------------------------------------------- dibujo

function draw() {
  const top = S.cameras.main.scrollY;
  drawSky(-top / PX_M);
  G.clear();

  // cables (gruesos y oscuros para que se lean bien)
  for (const c of cables) {
    if (Math.max(c.ay, c.by) + c.sag < top - 40 || Math.min(c.ay, c.by) > top + H + 40) continue;
    const on = c.hot && hotOn(c), warn = c.hot && hotOn(c, 0.8) && !on;
    G.lineStyle(on ? 5 : 3, on ? 0x7fe0ff : 0x15100c, 1);
    G.beginPath();
    for (let i = 0; i <= 20; i++) {
      const p = cablePt(c, i / 20);
      if (on) p.y += (Math.random() - 0.5) * 6;
      i ? G.lineTo(p.x, p.y) : G.moveTo(p.x, p.y);
    }
    G.strokePath();
    if ((on || warn) && Math.random() < (on ? 0.9 : 0.35)) {
      const p = cablePt(c, Math.random());
      sparks.push({ x: p.x, y: p.y, vx: (Math.random() - 0.5) * 200, vy: -Math.random() * 150, life: 0.3, c: 0x7fe0ff });
    }
  }

  // bombillos
  for (const b of bulbs) {
    if (b.got) continue;
    const y = b.y + Math.sin(clock * 3 + b.x) * 4;
    G.fillStyle(0xffd23f, 0.25);
    G.fillCircle(b.x, y, 16);
    G.fillStyle(0xfff1a8);
    G.fillCircle(b.x, y, 8);
    G.fillStyle(0x8a8f94);
    G.fillRect(b.x - 4, y + 6, 8, 6);
  }

  // bombonas
  for (const b of boosts) {
    if (b.got) continue;
    const y = b.y + Math.sin(clock * 4 + b.x) * 5;
    G.fillStyle(0xff9f1c, 0.2 + Math.sin(clock * 8) * 0.1);
    G.fillCircle(b.x, y, 32);
    bombona(b.x, y);
  }

  for (const p of PL) {
    if (!p.alive) continue;
    P = p;
    // linea punteada hacia el cable que vas a agarrar
    if (phase === 'play' && !P.att && P.boost <= 0) {
      const k = P.k;
      const ix = (down(k + 'R') ? 1 : 0) - (down(k + 'L') ? 1 : 0);
      const iy = (down(k + 'D') ? 1 : 0) - (down(k + 'U') ? 1 : 0);
      const tg = target(ix, iy);
      if (tg) {
        const n = Math.floor(tg.d / 14);
        G.fillStyle(0xffffff, P.stun > 0 ? 0.2 : 0.8);
        for (let i = 1; i < n; i++) {
          G.fillCircle(P.x + (tg.x - P.x) * i / n, P.y - 14 + (tg.y - P.y + 14) * i / n, 2.2);
        }
        G.lineStyle(3, mode === 2 ? P.cap : 0xffd23f, 0.6 + Math.sin(clock * 10) * 0.4);
        G.strokeCircle(tg.x, tg.y, 10);
      }
    }

    // mecate
    if (P.att) {
      const a = cablePt(P.att.c, P.att.t);
      const hx = P.x + Math.sin(P.a) * 22, hy = P.y - Math.cos(P.a) * 22;
      G.lineStyle(2, 0xd8c69a);
      G.lineBetween(hx, hy, a.x, a.y);
      G.fillStyle(0x999999);
      G.fillCircle(a.x, a.y, 4);
    }

    if (P.boost > 0) {
      const fy = P.y + 52, fl = 30 + Math.random() * 24;
      G.fillStyle(0xff6b1c);
      G.fillTriangle(P.x - 10, fy, P.x + 10, fy, P.x, fy + fl);
      G.fillStyle(0xffd23f);
      G.fillTriangle(P.x - 5, fy, P.x + 5, fy, P.x, fy + fl * 0.6);
      bombona(P.x, P.y + 34);
    }
    drawChamo();

    // en carrera, flechita del color de cada jugador
    if (mode === 2) {
      const my = P.y - 48 + Math.sin(clock * 6) * 3;
      G.fillStyle(P.cap);
      G.fillTriangle(P.x - 8, my - 10, P.x + 8, my - 10, P.x, my);
    }
  }

  // zamuros
  for (const b of birds) {
    const y = b.y + Math.sin(b.ph) * 6, f = Math.sin(b.ph * 1.6) * 10, s = b.vx > 0 ? 1 : -1;
    G.lineStyle(4, 0x111111);
    G.lineBetween(b.x - 20, y - f, b.x, y);
    G.lineBetween(b.x + 20, y - f, b.x, y);
    G.fillStyle(0x111111);
    G.fillEllipse(b.x, y + 2, 22, 10);
    G.fillStyle(0xd88a8a);
    G.fillCircle(b.x + s * 12, y, 4);
  }

  for (const s of sparks) {
    G.fillStyle(s.c, Math.min(1, s.life * 3));
    G.fillRect(s.x - 2, s.y - 2, 4, 4);
  }

  // el corto: franja electrica que sube
  if (corto < top + H + 30) {
    G.fillStyle(0x0a1030, 0.92);
    G.fillRect(0, corto, W, top + H - corto + 10);
    G.fillStyle(0x7fe0ff, 0.15);
    G.fillRect(0, corto - 30, W, 30);
    for (let k = 0; k < 2; k++) {
      G.lineStyle(k ? 2 : 5, k ? 0xffffff : 0x7fe0ff, k ? 1 : 0.6);
      G.beginPath();
      for (let x = 0; x <= W; x += 20) {
        const y = corto + (Math.random() - 0.5) * 18;
        x ? G.lineTo(x, y) : G.moveTo(x, y);
      }
      G.strokePath();
    }
  }

  // HUD
  const g = hud.g;
  g.clear();
  if (phase !== 'title') {
    g.fillStyle(0x1a0f08, 0.6);
    g.fillRoundedRect(10, 8, 200, 36, 8);
    g.fillRoundedRect(W - 210, 8, 200, 36, 8);
    // icono de altura: flechita (solo) o rondas ganadas (carrera)
    g.fillStyle(0xffd23f);
    if (mode === 1) {
      g.fillTriangle(30, 16, 22, 30, 38, 30);
      g.fillRect(27, 30, 6, 8);
    } else {
      for (let r = 0; r < 2; r++) {
        g.fillStyle(r < wins[0] ? 0xffd23f : 0x1a0f08, 1);
        g.fillCircle(28 + r * 20, 58, 7);
        g.fillStyle(r < wins[1] ? 0xffd23f : 0x1a0f08, 1);
        g.fillCircle(W - 28 - r * 20, 58, 7);
      }
    }
    // aviso de que tan cerca esta el corto
    const gap = corto - trailer().y;
    if (cortoOn && gap < 260 && phase === 'play') {
      g.fillStyle(0xff3b3b, (1 - gap / 260) * (0.5 + Math.sin(clock * 14) * 0.3));
      g.fillRect(0, H - 8, W, 8);
    }
  }
}

function drawSky(h) {
  // atardecer arriba en la calle; noche cerrada mientras mas subes
  const k = nightAt(h);
  HAZE = mix(0xffd08a, 0x3a1c5c, k);
  // neblina mas espesa abajo (el valle) y mas suave de noche
  fog.forEach((f, i) => {
    f.clear();
    const a = [0.35, 0.55, 0.28][i] * (1 - k * 0.35);
    for (let j = 0; j < 8; j++) {
      f.fillStyle(HAZE, a * (0.35 + 0.65 * j / 7));
      f.fillRect(0, j * H / 8, W, H / 8 + 1);
    }
  });
  sky.clear();
  for (let i = 0; i < 24; i++) {
    sky.fillStyle(mix(mix(0xff8a5c, 0x0a1030, k), mix(0xffd08a, 0x3a1c5c, k), i / 23));
    sky.fillRect(0, i * H / 24, W, H / 24 + 1);
  }
  if (k > 0.4) {
    for (let i = 0; i < 40; i++) {
      sky.fillStyle(0xffffff, (k - 0.4) * 1.6 * (0.4 + 0.6 * Math.abs(Math.sin(i * 7 + clock))));
      sky.fillRect((i * 197) % W, (i * 113) % (H * 0.7), 2, 2);
    }
  }
  // sol que se esconde y luna que sale
  sky.fillStyle(0xffe08a, 1 - k);
  sky.fillCircle(640, 140 + k * 400, 46);
  sky.fillStyle(0xf4f1e8, k);
  sky.fillCircle(150, 110, 30);
  sky.fillStyle(mix(0xff8a5c, 0x0a1030, k), k);
  sky.fillCircle(138, 102, 26);
}

// El chamo: gorra roja, franela vinotinto, jean y cholas.
function drawChamo() {
  // trucos: r = rotacion extra, sx = ancho (el tornillo lo aplasta), cap = gorra al aire
  let r = 0, sx = 1, cap = 0, sup = false;
  const tr = P.tr;
  if (tr) {
    const q = tr.t / tr.d;
    if (tr.k === 0) r = tr.s * Math.PI * 2 * tr.n * q * (2 - q);
    if (tr.k === 1) sx = Math.cos(q * Math.PI * 4);
    if (tr.k === 2) { r = tr.s * Math.PI / 2 * Math.sin(Math.PI * q); sup = true; }
    if (tr.k === 3) cap = Math.sin(Math.PI * q) * 45;
  }
  const a = P.a + r, ux = Math.sin(a), uy = -Math.cos(a), px = -uy * sx, py = ux * sx;
  const x = P.x, y = P.y;
  const at = (u, p) => [x + ux * u + px * p, y + uy * u + py * p];
  const blink = P.stun > 0 && Math.floor(clock * 20) % 2;
  if (blink) return;
  const swing = sup ? 0 : P.att || !P.ground ? Math.sin(clock * 8) * 3 : Math.sin(clock * 12) * Math.min(6, Math.abs(P.vx) / 20);
  const L = (u1, p1, u2, p2, w, c) => {
    G.lineStyle(w, c);
    const [a1, b1] = at(u1, p1), [a2, b2] = at(u2, p2);
    G.lineBetween(a1, b1, a2, b2);
  };
  // piernas
  L(-8, -4, -24, -6 + swing, 6, 0x2f4a7a);
  L(-8, 4, -24, 6 - swing, 6, 0x2f4a7a);
  // brazos (arriba cuando esta guindao o volando)
  const up = P.att || !P.ground;
  if (up) {
    L(8, -5, 22, -3, 5, 0x8d5524);
    L(8, 5, 22, 3, 5, 0x8d5524);
  } else {
    L(8, -6, -4, -9, 5, 0x8d5524);
    L(8, 6, -4, 9, 5, 0x8d5524);
  }
  // franela vinotinto
  L(-9, 0, 9, 0, 13, P.shirt);
  // cabeza y gorra
  const [hx, hy] = at(15, 0), [cx, cy] = at(15 + cap, 0);
  G.fillStyle(0x8d5524);
  G.fillCircle(hx, hy, 7);
  G.fillStyle(P.cap);
  G.slice(cx, cy, 7.5, a - Math.PI, a, false);
  G.fillPath();
  const [vx, vy] = at(17 + cap, 7 * P.look);
  G.fillRect(vx - 3, vy - 2, 6, 4);
}

function stepSparks(dt) {
  for (const s of sparks) {
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.vy += 500 * dt;
    s.life -= dt;
  }
  sparks = sparks.filter((s) => s.life > 0);
}

function burst(x, y, n, c) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.28, v = 60 + Math.random() * 220;
    sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5, c });
  }
}

function pop(x, y, s, color) {
  const t = S.add.text(x, y, s, {
    fontFamily: 'Arial Black, Arial', fontSize: '24px', color,
    stroke: '#1a0f08', strokeThickness: 5,
  }).setOrigin(0.5).setDepth(6);
  S.tweens.add({ targets: t, y: y - 50, alpha: 0, duration: 1000, onComplete: () => t.destroy() });
}

function mix(a, b, t) {
  const r = ((a >> 16) & 255) + (((b >> 16) & 255) - ((a >> 16) & 255)) * t;
  const g = ((a >> 8) & 255) + (((b >> 8) & 255) - ((a >> 8) & 255)) * t;
  const bl = (a & 255) + ((b & 255) - (a & 255)) * t;
  return (r << 16) | (g << 8) | bl;
}


function bombona(x, y) {
  G.fillStyle(0x6d7680);
  G.fillRoundedRect(x - 12, y - 16, 24, 34, 9);
  G.fillStyle(0xa9b2bc);
  G.fillRect(x - 8, y - 12, 5, 26);
  G.fillStyle(0x3f6fb5);
  G.fillRect(x - 12, y + 2, 24, 5);
  G.fillStyle(0x444444);
  G.fillRect(x - 4, y - 23, 8, 8);
  G.lineStyle(3, 0x444444);
  G.strokeRect(x - 9, y - 28, 18, 6);
}

// ---------------------------------------------------------------- easter egg (300 m)

// Helicopteros en el cielo: bombardean a lo lejos y se llevan a un personaje
// de bigote y banda presidencial guindao de un mecate.
function eggStep(dt) {
  const e = egg, g = EG;
  const t = (e.t += dt);
  g.clear();
  if (t > 13) { egg = null; return; }
  const GY = 330;
  const hs = [0, 1, 2].map((i) => {
    let x = Phaser.Math.Linear(W + 100 + i * 90, 230 + i * 170, Math.min(1, t / 2.5));
    if (t > 8.5) x -= (t - 8.5) * (t - 8.5) * 120;
    return [x, 80 + (i % 2) * 40 + Math.sin(t * 2 + i) * 6];
  });

  // ruido de aspas
  if (t < 11 && (e.ct -= dt) <= 0) {
    e.ct = 0.09;
    Snd.hiss(0.06, 0.07, 350, 0, 'lowpass');
  }

  // bombas y explosiones a lo lejos
  if (t > 2.5 && t < 5.5 && (e.bt -= dt) <= 0) {
    e.bt = 0.3;
    const h = hs[Phaser.Math.Between(0, 2)];
    e.b.push({ x: h[0], y: h[1] + 12, v: 0, ex: -1, gy: GY + Math.random() * 40 });
  }
  for (const b of e.b) {
    if (b.ex < 0) {
      b.v += 600 * dt;
      b.y += b.v * dt;
      g.fillStyle(0x111111);
      g.fillEllipse(b.x, b.y, 6, 12);
      if (b.y >= b.gy) {
        b.ex = 0;
        Snd.boom();
        S.cameras.main.shake(150, 0.004);
      }
    } else if (b.ex < 1.2) {
      b.ex += dt;
      const k = b.ex / 1.2, r = 10 + k * 60;
      g.fillStyle(0x333333, (1 - k) * 0.5);
      g.fillCircle(b.x, b.gy - k * 50, r * 0.8);
      g.fillStyle(0xff6b1c, (1 - k) * 0.8);
      g.fillCircle(b.x, b.gy, r);
      g.fillStyle(0xffd23f, 1 - k);
      g.fillCircle(b.x, b.gy, r * 0.55);
    }
  }

  // el mecate baja, lo engancha y se lo llevan
  const [hx, hy] = hs[1];
  if (t > 5) {
    let len = 70;
    if (t < 6.2) len = (GY - hy) * (t - 5) / 1.2;
    else if (t < 8.5) len = Phaser.Math.Linear(GY - hy, 70, (t - 6.2) / 2.3);
    const sw = t > 6.2 ? Math.sin(t * 3) * 0.15 : 0;
    const ex = hx + Math.sin(sw) * len, ey = hy + 10 + Math.cos(sw) * len;
    g.lineStyle(2, 0x222222);
    g.lineBetween(hx, hy + 10, ex, ey);
    if (t > 6.2) {
      g.save();
      g.translateCanvas(ex, ey);
      g.scaleCanvas(1.5, 1.5);
      figure(g, 0, 0, t);
      g.restore();
    }
  }
  if (t > 6.5 && !e.said) {
    e.said = true;
    leader().bonus += 1000;
    const tx = S.add.text(W / 2, 440, 'SE LO LLEVARON!\n+1000', {
      fontFamily: 'Arial Black, Arial', fontSize: '40px', color: '#ffd23f',
      stroke: '#1a0f08', strokeThickness: 7, align: 'center',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(6).setScale(0.3);
    S.tweens.add({ targets: tx, scale: 1, duration: 500, ease: 'Back.Out' });
    S.tweens.add({ targets: tx, alpha: 0, delay: 2500, duration: 600, onComplete: () => tx.destroy() });
    Snd.ding();
  }
  for (const [x, y] of hs) heli(g, x, y, t);
}

function heli(g, x, y, t) {
  g.fillStyle(0x2d3a2a);
  g.fillEllipse(x, y, 56, 24);
  g.fillRect(x + 20, y - 4, 44, 6);
  g.fillRect(x + 58, y - 14, 6, 16);
  g.fillStyle(0x9fd3e6);
  g.fillEllipse(x - 14, y - 2, 20, 12);
  g.lineStyle(2, 0x222222);
  g.lineBetween(x - 18, y + 16, x + 18, y + 16);
  g.lineBetween(x - 10, y + 11, x - 10, y + 16);
  g.lineBetween(x + 10, y + 11, x + 10, y + 16);
  g.lineBetween(x, y - 12, x, y - 17);
  const r = Math.abs(Math.cos(t * 40)) * 44 + 6;
  g.lineStyle(3, 0x111111, 0.8);
  g.lineBetween(x - r, y - 17, x + r, y - 17);
}

// Bigote, mono gris y banda presidencial, pataleando.
function figure(g, x, y, t) {
  const k = Math.sin(t * 14) * 7;
  g.lineStyle(4, 0xc68642);
  g.lineBetween(x - 2, y, x - 8, y + 16);
  g.lineBetween(x + 2, y, x + 8, y + 16);
  g.fillStyle(0x6b6f76);
  g.fillRoundedRect(x - 11, y + 15, 22, 27, 5);
  g.lineStyle(3, 0xffcc00);
  g.lineBetween(x - 10, y + 17, x + 10, y + 35);
  g.lineStyle(3, 0x0033a0);
  g.lineBetween(x - 10, y + 20, x + 10, y + 38);
  g.lineStyle(3, 0xcf142b);
  g.lineBetween(x - 10, y + 23, x + 8, y + 40);
  g.lineStyle(5, 0x6b6f76);
  g.lineBetween(x - 5, y + 40, x - 6 + k, y + 58);
  g.lineBetween(x + 5, y + 40, x + 6 - k, y + 58);
  g.fillStyle(0xc68642);
  g.fillCircle(x, y + 8, 8);
  g.fillStyle(0x111111);
  g.fillRect(x - 8, y - 1, 16, 5);
  g.fillEllipse(x, y + 12, 13, 4);
}

// ---------------------------------------------------------------- sonido

// Todo el audio se sintetiza. La musica es una salsa sencilla:
// clave 3-2, campana, bajo en tumbao y montuno de piano en La menor.
const Snd = {
  ac: null, out: null, noise: null, next: 0, step: 0,
  init(ac) {
    if (!ac) return;
    this.ac = ac;
    this.out = ac.createGain();
    this.out.gain.value = 0.8;
    this.out.connect(ac.destination);
    const len = ac.sampleRate * 0.3;
    this.noise = ac.createBuffer(1, len, ac.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  },
  wake() {
    if (this.ac && this.ac.state === 'suspended') this.ac.resume();
  },
  ok() {
    return this.ac && this.ac.state === 'running';
  },
  tone(f, d, type, v, f2, t) {
    if (!this.ok()) return;
    const ac = this.ac;
    t = t || ac.currentTime;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + d);
  },
  hiss(d, v, freq, t, type) {
    if (!this.ok()) return;
    const ac = this.ac;
    t = t || ac.currentTime;
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = this.noise;
    f.type = type || 'highpass';
    f.frequency.value = freq;
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + d);
    s.connect(f).connect(g).connect(this.out);
    s.start(t);
    s.stop(t + d);
  },
  zap() {
    this.tone(120, 0.35, 'sawtooth', 0.08, 60);
    this.hiss(0.3, 0.2, 3000, 0, 'bandpass');
  },
  rocket() {
    this.tone(150, 1.3, 'sawtooth', 0.06, 900);
    this.hiss(1.2, 0.12, 800, 0, 'bandpass');
  },
  boom() {
    this.tone(90, 0.7, 'sine', 0.16, 30);
    this.hiss(0.6, 0.25, 500, 0, 'lowpass');
  },
  ding() {
    this.tone(1568, 0.25, 'triangle', 0.07);
    this.tone(2093, 0.3, 'triangle', 0.05, 0, this.ac && this.ac.currentTime + 0.06);
  },
  tune() {
    [7, 4, 0, -5].forEach((n, i) => this.tone(midi(69 + n), 0.2, 'square', 0.05, 0, this.ac && this.ac.currentTime + 0.15 + i * 0.14));
  },
  tick() {
    if (!this.ok()) return;
    const ac = this.ac, dur = phase === 'play' ? 0.085 : 0.1;
    if (this.next < ac.currentTime) this.next = ac.currentTime + 0.05;
    while (this.next < ac.currentTime + 0.12) {
      const k = this.step % 16, bar = Math.floor(this.step / 16) % 4, t = this.next;
      const ch = [[57, 60, 64], [62, 65, 69], [56, 59, 62], [57, 60, 64]][bar];
      // clave 3-2
      if ([0, 3, 6, 10, 12].includes(k)) this.tone(2400, 0.03, 'square', 0.035, 0, t);
      // campana en cada negra
      if (k % 4 === 0) { this.tone(830, 0.06, 'square', 0.025, 0, t); this.tone(560, 0.06, 'square', 0.02, 0, t); }
      // bajo tumbao: anticipado en el "y" del 2 y en el 4
      if (k === 6) this.tone(midi(ch[0] - 12 + 7), 0.3, 'triangle', 0.13, 0, t);
      if (k === 12) this.tone(midi(ch[0] - 12), 0.3, 'triangle', 0.13, 0, t);
      // montuno
      const m = [0, -1, 1, 2, -1, 0, -1, 1, 2, -1, 0, 1, -1, 2, 1, -1][k];
      if (m >= 0) this.tone(midi(ch[m] + 12), 0.09, 'triangle', 0.04, 0, t);
      // guiro
      if (k % 2 === 0) this.hiss(0.05, 0.02, 5000, t);
      this.next += dur;
      this.step++;
    }
  },
};

function midi(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

new Phaser.Game({
  type: Phaser.AUTO,
  width: W,
  height: H,
  parent: 'game-root',
  backgroundColor: '#1a0f08',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: { create, update },
});

})();
