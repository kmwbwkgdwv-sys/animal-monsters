// アニモン・人物のプロシージャルモデル（手足がはっきり動く）
import { Node, PRIM, initPrims, hexToRgb, shiftHue, mixRgb } from '../engine/gl3d.js';
import { SPECIES } from '../data/species.js';
import { TYPE_BODY } from '../data/types.js';
import { mulberry32 } from '../engine/util.js';

const EYE_W = [1, 1, 1], EYE_B = [0.08, 0.07, 0.12];

function P(parent, geo, color, pos, scl, rot, o = {}) {
  const n = new Node(geo, { color, ...o });
  if (pos) n.setPos(pos[0], pos[1], pos[2]);
  if (scl) n.setScale(scl[0], scl[1] ?? scl[0], scl[2] ?? scl[0]);
  if (rot) n.setRot(rot[0], rot[1], rot[2]);
  parent.add(n);
  return n;
}
function J(parent, pos, rot) { const n = new Node(); n.setPos(...pos); if (rot) n.setRot(...rot); parent.add(n); return n; }

export function speciesColors(sp, shiny) {
  const tb = TYPE_BODY[sp.types[0]];
  let c1 = hexToRgb(sp.color ? sp.color[0] : tb[0]);
  let c2 = hexToRgb(sp.color ? sp.color[1] : (sp.types[1] ? TYPE_BODY[sp.types[1]][0] : tb[1]));
  if (shiny) {
    c1 = shiftHue(c1, 0.43, 0.12, 0.02); c2 = shiftHue(c2, 0.5, 0.1, 0.04);
    if (Math.abs(c1[0] - c1[1]) < 0.05 && Math.abs(c1[1] - c1[2]) < 0.05) c1 = [0.95, 0.8, 0.3]; // 無彩色は金色に
  }
  return { c1, c2, dark: mixRgb(c1, [0, 0, 0], 0.45), light: mixRgb(c1, [1, 1, 1], 0.45) };
}

// ---------------- アニモン ----------------
export function buildAnimon(spId, shiny = false) {
  initPrims();
  const sp = SPECIES[spId];
  const f = sp.feats || {};
  const ex = new Set(f.extra || []);
  const { c1, c2, dark, light } = speciesColors(sp, shiny);
  const r = mulberry32(spId * 977);
  const root = new Node();           // 位置・向き（外部制御）
  const pivot = new Node(); root.add(pivot); // アニメーション用
  const M = { root, pivot, legs: [], arms: [], wings: [], tails: [], fins: [], segs: [], plan: sp.plan, sp, floating: false, height: 1 };
  const plan = sp.plan;
  const glowCol = sp.types.includes('fire') ? [1, 0.55, 0.15] : sp.types.includes('electric') ? [1, 0.95, 0.3] : sp.types.includes('ghost') ? [0.6, 0.5, 1] : sp.types.includes('psychic') ? [1, 0.5, 0.85] : [0.6, 0.9, 1];

  let body, head, headR = 0.36, headPos = [0, 1.2, 0.4];
  const addEyes = (h, r0, spread = 0.38, y = 0.12, z = 0.82, size = 0.24) => {
    for (const s of [-1, 1]) {
      P(h, PRIM.sphereLo, EYE_W, [s * spread * r0, y * r0, z * r0], [size * r0, size * r0 * 1.15, size * r0 * 0.6]);
      P(h, PRIM.sphereLo, EYE_B, [s * spread * r0, y * r0 + 0.01, z * r0 + size * r0 * 0.45], [size * r0 * 0.6, size * r0 * 0.75, size * r0 * 0.4]);
      P(h, PRIM.sphereLo, [1, 1, 1], [s * spread * r0 + 0.03 * r0, y * r0 + size * r0 * 0.35, z * r0 + size * r0 * 0.62], [size * r0 * 0.22]);
    }
    if (ex.has('mask')) P(h, PRIM.box, dark, [0, y * r0, z * r0 - 0.04 * r0], [r0 * 1.7, size * r0 * 1.6, r0 * 0.3]);
  };
  const limb = (parent, pos, len, rad, col, foot = null, rot = null) => {
    const j = J(parent, pos, rot);
    P(j, PRIM.taperDown, col, [0, 0, 0], [rad, len, rad]);
    if (foot) P(j, PRIM.sphereLo, foot, [0, -len, rad * 0.4], [rad * 1.25, rad * 0.8, rad * 1.5]);
    j.len = len;
    return j;
  };

  // ---- 胴体の構築 ----
  if (plan === 'quad' || plan === 'dragon' || plan === 'turtle') {
    const long = plan === 'dragon' ? 1.15 : 1;
    const bh = plan === 'turtle' ? 0.42 : 0.66;
    body = P(pivot, PRIM.sphere, c1, [0, bh, 0], [0.5, plan === 'turtle' ? 0.32 : 0.4, 0.68 * long]);
    if (!ex.has('nobelly')) P(body, PRIM.sphere, c2, [0, -0.35, 0.15], [0.78, 0.55, 0.75]);
    const legLen = plan === 'turtle' ? 0.3 : (plan === 'dragon' ? 0.52 : 0.5);
    const legR = plan === 'turtle' ? 0.14 : 0.11;
    const lx = 0.3, lz = 0.42 * long;
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) M.legs.push(limb(pivot, [sx * lx, bh - 0.05, sz * lz], legLen + (bh - 0.05 - legLen - 0.0), legR, c1, dark));
    if (plan === 'dragon') {
      const neck = J(pivot, [0, bh + 0.15, 0.55 * long], [-0.6, 0, 0]);
      P(neck, PRIM.cyl, c1, [0, 0, 0], [0.16, 0.6, 0.16]);
      head = P(neck, PRIM.sphere, c1, [0, 0.7, 0.05], [0.34, 0.3, 0.42]); head.rot[0] = 0.6; headR = 0.34;
      P(head, PRIM.sphere, c1, [0, -0.08, 0.9], [0.55, 0.42, 0.7]);
      M.neck = neck;
      addEyes(head, 0.9, 0.45, 0.35, 0.55, 0.2);
    } else if (plan === 'turtle') {
      head = P(pivot, PRIM.sphere, light, [0, bh + 0.08, 0.75], [0.27, 0.25, 0.3]); headR = 0.27;
      addEyes(head, 1, 0.5, 0.2, 0.75, 0.25);
    } else {
      head = P(pivot, PRIM.sphere, c1, [0, bh + 0.38, 0.6], [0.38, 0.36, 0.36]); headR = 0.38;
      addEyes(head, 1);
    }
    M.tailBase = [0, bh + 0.1, -0.62 * long];
  } else if (plan === 'biped' || plan === 'plant' || plan === 'golem') {
    const g = plan === 'golem';
    const hipY = g ? 0.6 : 0.55;
    for (const s of [-1, 1]) M.legs.push(g ? (() => { const j = J(pivot, [s * 0.24, hipY, 0]); P(j, PRIM.box, dark, [0, -hipY / 2, 0], [0.28, hipY, 0.3]); P(j, PRIM.box, dark, [0, -hipY + 0.06, 0.06], [0.32, 0.14, 0.42]); return j; })()
      : limb(pivot, [s * 0.2, hipY, 0], hipY - 0.02, 0.12, plan === 'plant' ? dark : c1, plan === 'plant' ? dark : dark));
    body = g ? P(pivot, PRIM.box, c1, [0, hipY + 0.42, 0], [0.8, 0.8, 0.55]) : P(pivot, PRIM.sphere, c1, [0, hipY + 0.42, 0], [0.42, 0.5, 0.36]);
    if (!g) P(body, PRIM.sphere, c2, [0, -0.05, 0.4], [0.7, 0.75, 0.62]);
    const shY = hipY + (g ? 0.7 : 0.66);
    for (const s of [-1, 1]) {
      const a = g ? (() => { const j = J(pivot, [s * 0.52, shY, 0], [0, 0, s * 0.15]); P(j, PRIM.box, c1, [0, -0.3, 0], [0.26, 0.6, 0.28]); P(j, PRIM.box, dark, [0, -0.66, 0.02], [0.34, 0.2, 0.34]); return j; })()
        : limb(pivot, [s * 0.42, shY, 0.02], 0.48, 0.09, plan === 'plant' ? [0.4, 0.75, 0.3] : c1, plan === 'plant' ? null : c1, [0, 0, s * 0.25]);
      if (plan === 'plant') P(a, PRIM.sphere, [0.35, 0.72, 0.3], [0, -0.5, 0], [0.18, 0.06, 0.12]);
      M.arms.push(a);
    }
    head = g ? P(pivot, PRIM.box, c1, [0, shY + 0.3, 0.05], [0.5, 0.42, 0.45]) : P(pivot, PRIM.sphere, c1, [0, shY + 0.36, 0.02], [0.38, 0.36, 0.36]);
    headR = g ? 0.42 : 0.38;
    if (g) addEyes(head, 0.55, 0.38, 0.1, 1.0, 0.25); else addEyes(head, 1);
    M.tailBase = [0, hipY + 0.25, -0.3];
  } else if (plan === 'bird') {
    body = P(pivot, PRIM.sphere, c1, [0, 0.75, 0], [0.42, 0.42, 0.52]);
    P(body, PRIM.sphere, c2, [0, -0.2, 0.3], [0.75, 0.7, 0.6]);
    head = P(pivot, PRIM.sphere, c1, [0, 1.18, 0.25], [0.3, 0.3, 0.3]); headR = 0.3;
    addEyes(head, 1, 0.45, 0.2, 0.78, 0.26);
    for (const s of [-1, 1]) M.legs.push(limb(pivot, [s * 0.14, 0.42, 0.05], 0.4, 0.045, [0.95, 0.65, 0.2], [0.95, 0.65, 0.2]));
    for (const s of [-1, 1]) {
      const w = J(pivot, [s * 0.36, 0.86, 0], [0, 0, 0]);
      P(w, PRIM.wing, c1, [0, 0, 0], [0.75, 1, 0.5], [0, s > 0 ? 0 : Math.PI, 0]);
      P(w, PRIM.wing, c2, [0, 0.02, 0], [0.5, 1, 0.3], [0, s > 0 ? 0 : Math.PI, 0]);
      w.side = s; M.wings.push(w);
    }
    if (!f.face) f.face = 'beak';
    M.tailBase = [0, 0.75, -0.45];
  } else if (plan === 'fish' || plan === 'leviathan') {
    M.floating = true;
    if (plan === 'fish') {
      body = P(pivot, PRIM.sphere, c1, [0, 0.8, 0], [0.42, 0.4, 0.82]);
      P(body, PRIM.sphere, c2, [0, -0.35, 0.05], [0.8, 0.6, 0.9]);
      head = J(pivot, [0, 0.85, 0.5]); headR = 0.38;
      addEyes(head, 0.42, 0.75, 0.15, 0.55, 0.3);
      const tf = J(pivot, [0, 0.82, -0.75]);
      P(tf, PRIM.wing, c2, [0, 0, 0], [0.55, 1, 0.75], [0, Math.PI / 2, Math.PI / 2]);
      M.tails.push(tf);
      for (const s of [-1, 1]) { const fn = J(pivot, [s * 0.36, 0.7, 0.15]); P(fn, PRIM.wing, c2, [0, 0, 0], [0.4, 1, 0.3], [0, s > 0 ? 0.4 : Math.PI - 0.4, -0.4 * s]); fn.side = s; M.fins.push(fn); }
    } else {
      // 伝説の海竜（ナルメクシア）
      for (let i = 0; i < 9; i++) {
        const sz = 0.42 - i * 0.03;
        const seg = P(pivot, PRIM.sphere, i % 2 ? c1 : mixRgb(c1, c2, 0.15), [0, 1.2, -i * 0.42], [sz, sz * 0.9, sz * 1.2]);
        P(seg, PRIM.cone, c2, [0, 0.7, 0], [0.25, 0.7, 0.25]);
        M.segs.push(seg);
      }
      body = M.segs[1];
      head = P(pivot, PRIM.sphere, c1, [0, 1.45, 0.45], [0.42, 0.36, 0.5]); headR = 0.42;
      P(head, PRIM.sphere, c2, [0, -0.3, 0.6], [0.6, 0.4, 0.6]);
      addEyes(head, 1, 0.5, 0.25, 0.7, 0.22);
      const tf = J(M.segs[8], [0, 0, -0.6]);
      P(tf, PRIM.wing, c2, [0, 0, 0], [1.8, 1, 1.5], [0, Math.PI / 2, Math.PI / 2], { emis: [0.05, 0.12, 0.2] });
      M.tails.push(tf);
      for (const s of [-1, 1]) {
        const w = J(pivot, [s * 0.3, 1.4, -0.3]);
        P(w, PRIM.wing, c2, [0, 0, 0], [2.4, 1, 1.4], [0, s > 0 ? 0 : Math.PI, 0]);
        P(w, PRIM.wing, light, [0, 0.03, 0], [1.6, 1, 0.9], [0, s > 0 ? 0 : Math.PI, 0]);
        w.side = s; M.wings.push(w);
      }
    }
  } else if (plan === 'serpent') {
    const n = sp.short ? 3 : 6;
    for (let i = 0; i < n; i++) {
      const sz = (sp.short ? 0.42 : 0.34) - i * (sp.short ? 0.06 : 0.035);
      const seg = P(pivot, PRIM.sphere, i % 2 ? c1 : mixRgb(c1, c2, 0.2), [0, sz, -i * sz * 1.25], [sz, sz * 0.95, sz * (sp.short ? 1.3 : 1.05)]);
      M.segs.push(seg);
    }
    body = M.segs[0];
    head = P(pivot, PRIM.sphere, c1, [0, 0.62, 0.32], [0.33, 0.3, 0.36]); headR = 0.33;
    addEyes(head, 1, 0.45, 0.25, 0.75, 0.25);
    M.tailBase = [0, 0.15, -n * 0.33];
  } else if (plan === 'bug') {
    body = P(pivot, PRIM.sphere, c1, [0, 0.5, -0.38], [0.36, 0.3, 0.46]);
    const thor = P(pivot, PRIM.sphere, dark, [0, 0.52, 0.08], [0.24, 0.22, 0.24]);
    head = P(pivot, PRIM.sphere, c1, [0, 0.6, 0.42], [0.26, 0.25, 0.26]); headR = 0.26;
    addEyes(head, 1, 0.5, 0.2, 0.75, 0.3);
    for (const s of [-1, 1]) for (const z of [0.2, 0.05, -0.12]) {
      const l = J(pivot, [s * 0.18, 0.5, z], [0, 0, s * 1.0]);
      P(l, PRIM.taperDown, dark, [0, 0, 0], [0.04, 0.42, 0.04]);
      l.side = s; M.legs.push(l);
    }
    if (ex.has('stripes')) for (let i = 0; i < 3; i++) P(body, PRIM.torus, [0.15, 0.12, 0.1], [0, 0, -0.3 + i * 0.3], [0.9 - Math.abs(i - 1) * 0.15, 1.2, 0.9 - Math.abs(i - 1) * 0.15], [Math.PI / 2, 0, 0]);
    M.tailBase = [0, 0.5, -0.82];
    void thor;
  } else { // blob
    M.floating = !ex.has('wraps');
    body = P(pivot, PRIM.sphere, c1, [0, 0.72, 0], [0.55, 0.52, 0.5]);
    P(body, PRIM.sphere, c2, [0, -0.25, 0.35], [0.7, 0.6, 0.55]);
    head = body; headR = 0.55;
    addEyes(body, 1, 0.38, 0.15, 0.8, 0.22);
    for (const s of [-1, 1]) { const a = J(pivot, [s * 0.5, 0.65, 0.1], [0, 0, s * 0.7]); P(a, PRIM.sphere, c1, [0, -0.15, 0], [0.12, 0.2, 0.12]); M.arms.push(a); }
    M.tailBase = [0, 0.5, -0.4];
  }
  M.body = body; M.head = head;

  // ---- 顔のパーツ ----
  const face = f.face;
  const hz = headR;
  if (face === 'beak') { const bk = P(head, PRIM.cone, [0.98, 0.7, 0.2], [0, -0.05 * 1, 0.9], [0.22, 0.45, 0.2], [Math.PI / 2, 0, 0]); void bk; }
  if (face === 'snout') { P(head, PRIM.sphere, light, [0, -0.25, 0.8], [0.45, 0.35, 0.35]); P(head, PRIM.sphereLo, EYE_B, [0, -0.15, 1.12], [0.12, 0.09, 0.08]); }
  if (face === 'whiskers') for (const s of [-1, 1]) for (const k of [-1, 1]) P(head, PRIM.box, [0.2, 0.2, 0.2], [s * 0.6, -0.25 + k * 0.08, 0.75], [0.5, 0.025, 0.025], [0, s * 0.25, k * 0.15]);
  if (face === 'tusks') for (const s of [-1, 1]) P(head, PRIM.cone, [1, 0.98, 0.9], [s * 0.35, -0.45, 0.8], [0.1, 0.6, 0.1], [2.2, 0, s * 0.3]);
  if (face === 'trunk') { P(head, PRIM.cyl, c1, [0, -0.3, 0.85], [0.14, 0.7, 0.14], [2.6, 0, 0]); }
  if (face === 'longjaw') { P(head, PRIM.box, c1, [0, -0.25, 1.0], [0.75, 0.35, 1.1]); for (let i = 0; i < 4; i++) for (const s of [-1, 1]) P(head, PRIM.cone, [1, 1, 1], [s * 0.3, -0.4, 0.6 + i * 0.25], [0.05, 0.15, 0.05], [Math.PI, 0, 0]); }
  if (face === 'teeth') for (const s of [-1, 1]) P(head, PRIM.box, [1, 1, 1], [s * 0.12, -0.45, 0.85], [0.18, 0.22, 0.06]);
  if (face === 'pincers') for (const s of [-1, 1]) {
    const pc = J(head, [s * 0.5, -0.2, 0.7], [0, s * 0.4, 0]);
    P(pc, PRIM.sphere, c2, [0, 0, 0.45], [0.25, 0.18, 0.55]); P(pc, PRIM.cone, c2, [0, 0, 0.9], [0.12, 0.35, 0.12], [Math.PI / 2, 0, 0]);
    M.pincers = M.pincers || []; M.pincers.push(pc);
  }
  // ---- 耳 ----
  const ears = f.ears;
  if (ears && ears !== 'none') for (const s of [-1, 1]) {
    const e = J(head, [s * 0.55, 0.7, 0], [0, 0, -s * 0.3]);
    if (ears === 'pointy') { P(e, PRIM.cone, c1, [0, 0, 0], [0.22, 0.55, 0.15]); P(e, PRIM.cone, [1, 0.75, 0.8], [0, 0.05, 0.05], [0.13, 0.4, 0.06]); }
    if (ears === 'big') { P(e, PRIM.cone, c1, [0, 0, 0], [0.35, 0.8, 0.12]); P(e, PRIM.cone, [1, 0.78, 0.8], [0, 0.05, 0.04], [0.22, 0.6, 0.06]); }
    if (ears === 'round') P(e, PRIM.sphere, c1, [0, 0.1, 0], [0.24, 0.24, 0.1]);
    if (ears === 'long') { e.setRot(0, 0, -s * 0.12); P(e, PRIM.sphere, c1, [0, 0.55, 0], [0.16, 0.6, 0.08]); P(e, PRIM.sphere, [1, 0.8, 0.85], [0, 0.55, 0.04], [0.09, 0.45, 0.05]); }
    if (ears === 'tuft') P(e, PRIM.cone, dark, [0, 0, 0], [0.12, 0.35, 0.1]);
    M.ears = M.ears || []; M.ears.push(e);
  }
  // ---- 角 ----
  const hornN = f.horn || 0, hs = f.hornStyle || 'cone';
  const hornCol = sp.types.includes('steel') ? [0.85, 0.88, 0.92] : sp.types.includes('fire') ? [1, 0.85, 0.4] : [0.98, 0.94, 0.82];
  const hornAt = (x, z, big) => {
    if (hs === 'antler') { const a = J(head, [x, 0.75, z], [0, 0, x > 0 ? -0.4 : 0.4]); P(a, PRIM.cyl, [0.6, 0.45, 0.3], [0, 0, 0], [0.05, 0.7, 0.05]); for (let i = 0; i < 2; i++) P(a, PRIM.cyl, [0.6, 0.45, 0.3], [0, 0.3 + i * 0.25, 0], [0.04, 0.35, 0.04], [0, 0, (i ? 1 : -1) * 0.8]); }
    else if (hs === 'curl') { const a = J(head, [x, 0.55, z - 0.1]); for (let i = 0; i < 4; i++) P(a, PRIM.sphereLo, hornCol, [Math.sign(x) * (0.15 + Math.sin(i * 1.2) * 0.25), Math.cos(i * 1.2) * 0.25, -0.1 - i * 0.05], [0.14 - i * 0.015]); }
    else if (hs === 'unicorn') P(head, PRIM.cone, hornCol, [x, 0.75, z + 0.35], [0.12, big ? 1.0 : 0.7, 0.12], [0.5, 0, 0]);
    else P(head, PRIM.cone, hornCol, [x, 0.8, z], [0.14, big ? 0.7 : 0.5, 0.14], [-0.25, 0, -x * 0.6]);
  };
  if (hornN === 1) hornAt(0, 0.2, true);
  if (hornN >= 2) { hornAt(-0.4, 0, false); hornAt(0.4, 0, false); }
  if (hornN >= 3) hornAt(0, 0.25, true);

  // ---- 尻尾 ----
  const tb = M.tailBase;
  const tailT = f.tail;
  if (tb && tailT && tailT !== 'none') {
    const t = J(pivot, tb, [0.5, 0, 0]);
    M.tails.push(t);
    const flame = (n, s = 1) => { P(n, PRIM.cone, [1, 0.45, 0.1], [0, 0, 0], [0.22 * s, 0.6 * s, 0.22 * s], null, { emis: [0.6, 0.2, 0] }); P(n, PRIM.cone, [1, 0.9, 0.3], [0, 0.05, 0], [0.13 * s, 0.42 * s, 0.13 * s], null, { emis: [0.6, 0.5, 0.1] }); };
    if (tailT === 'short') P(t, PRIM.sphere, c1, [0, 0, -0.1], [0.15]);
    if (tailT === 'long' || tailT === 'twin') {
      const reps = tailT === 'twin' ? [-0.25, 0.25] : [0];
      for (const rz of reps) { const tt = J(t, [0, 0, 0], [0, 0, rz]); P(tt, PRIM.cyl, c1, [0, 0, 0], [0.07, 0.7, 0.07], [-2.2, 0, 0]); P(tt, PRIM.sphere, c2, [0, 0.42, -0.55], [0.1]); if (ex.has('ghostfire')) P(tt, PRIM.sphere, [0.6, 0.7, 1], [0, 0.5, -0.65], [0.13], null, { emis: [0.3, 0.4, 0.8] }); }
    }
    if (tailT === 'fluffy') P(t, PRIM.sphere, c1, [0, 0.25, -0.3], [0.3, 0.42, 0.3]);
    if (tailT === 'flame') { P(t, PRIM.cyl, c1, [0, 0, 0], [0.07, 0.4, 0.07], [-2.3, 0, 0]); const fl = J(t, [0, 0.3, -0.3]); flame(fl, 1); M.flame = fl; }
    if (tailT === 'leaf') P(t, PRIM.wing, [0.45, 0.8, 0.3], [0, 0.1, -0.1], [0.8, 1, 0.5], [0, Math.PI / 2, 1.2]);
    if (tailT === 'spike' || tailT === 'stinger') {
      for (let i = 0; i < 3; i++) P(t, PRIM.sphere, c1, [0, i * 0.18, -0.1 - i * 0.12], [0.1 - i * 0.015]);
      P(t, PRIM.cone, [0.3, 0.2, 0.3], [0, 0.55, -0.4], [0.08, 0.3, 0.08], [-0.8, 0, 0]);
    }
    if (tailT === 'fin') P(t, PRIM.wing, c2, [0, 0, -0.1], [0.55, 1, 0.55], [0, Math.PI / 2, Math.PI / 2 + 0.4]);
    if (tailT === 'feather') for (const k of [-0.35, 0, 0.35]) P(t, PRIM.wing, c2, [0, 0, 0], [0.5, 1, 0.22], [0, -Math.PI / 2 + k, -0.2]);
    if (tailT === 'bolt') { const col = sp.types.includes('electric') ? [1, 0.85, 0.15] : c2; P(t, PRIM.box, col, [0, 0.15, -0.1], [0.08, 0.35, 0.12], [0, 0, 0.6]); P(t, PRIM.box, col, [0, 0.38, -0.15], [0.08, 0.3, 0.2], [0, 0, -0.6]); P(t, PRIM.box, col, [0, 0.6, -0.2], [0.08, 0.3, 0.3], [0, 0, 0.5]); }
    if (tailT === 'ghost') { t.setRot(1.6, 0, 0); P(t, PRIM.cone, c1, [0, 0, 0], [0.3, 0.6, 0.3], [Math.PI, 0, 0]); }
    if (tailT === 'paddle') P(t, PRIM.box, dark, [0, 0, -0.25], [0.35, 0.06, 0.45], [-0.5, 0, 0]);
  }
  // ---- 背中 ----
  const back = f.back;
  const bAnchor = body;
  if (back === 'spikes') for (let i = 0; i < 4; i++) P(bAnchor, PRIM.cone, c2, [0, 0.9, 0.4 - i * 0.3], [0.15, 0.45, 0.15]);
  if (back === 'shell') { P(bAnchor, PRIM.sphere, c2, [0, 0.4, 0], [1.1, 0.9, 1.05], null, {}); if (ex.has('spikes')) for (let i = 0; i < 5; i++) P(bAnchor, PRIM.cone, dark, [Math.sin(i) * 0.5, 1.15, Math.cos(i * 1.7) * 0.5], [0.12, 0.35, 0.12]); }
  if (back === 'leaf' || back === 'bush' || back === 'tree') {
    if (back === 'leaf') for (const s of [-1, 1]) P(bAnchor, PRIM.wing, [0.45, 0.82, 0.32], [0, 0.95, 0], [0.9, 1, 0.6], [0, s > 0 ? 0.3 : Math.PI - 0.3, s * 0.6]);
    if (back === 'bush') for (let i = 0; i < 5; i++) P(bAnchor, PRIM.sphereLo, [0.35, 0.7 + i * 0.03, 0.3], [Math.sin(i * 2.4) * 0.35, 1.0 + (i % 2) * 0.15, Math.cos(i * 2.4) * 0.35], [0.38]);
    if (back === 'tree') { P(bAnchor, PRIM.cyl, [0.5, 0.35, 0.2], [0, 0.6, 0], [0.18, 1.6, 0.18]); for (let i = 0; i < 6; i++) P(bAnchor, PRIM.sphereLo, [0.3, 0.65 + (i % 3) * 0.06, 0.28], [Math.sin(i * 2.1) * 0.55, 2.2 + (i % 2) * 0.3, Math.cos(i * 2.1) * 0.55], [0.6]); }
  }
  if (back === 'wings' || back === 'batwings') {
    for (const s of [-1, 1]) {
      const w = J(pivot, [s * 0.3, (plan === 'biped' ? 1.35 : plan === 'blob' ? 0.9 : plan === 'bug' ? 0.72 : 0.95), plan === 'bug' ? 0 : -0.15]);
      const wc = back === 'batwings' ? dark : (plan === 'bug' ? [0.85, 0.95, 1] : (sp.types.includes('fairy') ? [1, 0.9, 1] : c2));
      const big = plan === 'dragon' ? 1.8 : plan === 'quad' ? 1.2 : plan === 'blob' ? 0.8 : 1;
      P(w, PRIM.wing, wc, [0, 0, 0], [0.9 * big, 1, 0.7 * big], [0, s > 0 ? -0.3 : Math.PI + 0.3, 0.4], { alpha: plan === 'bug' ? 0.75 : 1 });
      if (plan === 'bug') P(w, PRIM.wing, wc, [0, -0.05, -0.1], [0.75, 1, 0.5], [0, s > 0 ? -0.7 : Math.PI + 0.7, 0.3], { alpha: 0.7 });
      w.side = s; M.wings.push(w);
    }
  }
  if (back === 'flame') for (let i = 0; i < 3; i++) P(bAnchor, PRIM.cone, [1, 0.5 + i * 0.12, 0.1], [0, 0.85, 0.3 - i * 0.35], [0.22, 0.6, 0.22], null, { emis: [0.6, 0.25, 0] });
  if (back === 'crystal') for (let i = 0; i < 4; i++) P(bAnchor, PRIM.gem, [0.75, 0.92, 1], [Math.sin(i * 1.7) * 0.3, 0.95, 0.35 - i * 0.25], [0.15, 0.4, 0.15], [0, i, 0.2 * Math.sin(i)], { emis: [0.1, 0.2, 0.3] });
  if (back === 'mane') { const mp = plan === 'quad' || plan === 'dragon' ? head : bAnchor; const col = sp.types.includes('fire') ? [1, 0.55, 0.15] : c2; for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; P(mp, PRIM.cone, col, [Math.cos(a) * 0.75, Math.sin(a) * 0.6 + 0.1, -0.35], [0.25, 0.55, 0.25], [Math.PI / 2 + 0.3, 0, a - Math.PI / 2], sp.types.includes('fire') ? { emis: [0.4, 0.15, 0] } : {}); } }
  if (back === 'flowers') for (let i = 0; i < 5; i++) P(bAnchor, PRIM.sphereLo, [1, 0.6 + (i % 2) * 0.3, 0.75], [Math.sin(i * 2) * 0.4, 0.9, Math.cos(i * 2) * 0.4], [0.13]);
  if (back === 'mushroom') { P(body, PRIM.sphere, c2, [0, 0.85, 0], [1.25, 0.6, 1.25]); for (let i = 0; i < 5; i++) P(body, PRIM.sphereLo, [1, 1, 1], [Math.sin(i * 1.3) * 0.7, 1.25, Math.cos(i * 1.3) * 0.7], [0.12]); }
  if (back === 'fins' || back === 'fin' || back === 'sail') { const cnt = back === 'fin' ? 1 : 3; for (let i = 0; i < cnt; i++) P(bAnchor, PRIM.wing, c2, [0, 0.85, 0.3 - i * 0.35], [back === 'sail' ? 0.9 : 0.55, 1, 0.45], [0, Math.PI / 2, Math.PI / 2 + 0.3]); }
  if (back === 'wool' || back === 'cloud') for (let i = 0; i < 9; i++) P(bAnchor, PRIM.sphereLo, back === 'cloud' ? [1, 1, 1] : [1, 0.98, 0.95], [Math.sin(i * 2.3) * 0.65, 0.55 + (i % 3) * 0.2, Math.cos(i * 2.3) * 0.7], [0.38]);
  if (back === 'humps') for (const z of [0.3, -0.3]) P(bAnchor, PRIM.sphere, c1, [0, 0.85, z], [0.45, 0.55, 0.38]);
  if (back === 'clam') { P(pivot, PRIM.sphere, c2, [0, 0.5, -0.05], [0.75, 0.3, 0.7]); const top = P(pivot, PRIM.sphere, c2, [0, 1.15, -0.25], [0.75, 0.3, 0.7], [0.5, 0, 0]); M.clam = top; }
  if (back === 'lily') P(head, PRIM.cylinder || PRIM.cyl, [0.35, 0.72, 0.35], [0, 0.85, 0], [1.4, 0.06, 1.4]);
  if (back === 'volcano') { P(bAnchor, PRIM.cone, [0.35, 0.28, 0.25], [0, 0.55, 0], [0.6, 0.9, 0.6]); P(bAnchor, PRIM.sphereLo, [1, 0.4, 0.1], [0, 1.4, 0], [0.2, 0.1, 0.2], null, { emis: [0.9, 0.3, 0] }); }

  // ---- 追加パーツ ----
  if (ex.has('antenna')) for (const s of [-1, 1]) { const a = J(head, [s * 0.3, 0.8, 0.2], [-0.3, 0, -s * 0.3]); P(a, PRIM.cyl, dark, [0, 0, 0], [0.025, 0.6, 0.025]); P(a, PRIM.sphereLo, c2, [0, 0.62, 0], [0.08]); }
  if (ex.has('crown')) { const cr = P(head, PRIM.cyl, [1, 0.82, 0.2], [0, 0.85, 0], [0.38, 0.18, 0.38], null, { emis: [0.2, 0.15, 0] }); for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; P(cr, PRIM.cone, [1, 0.82, 0.2], [Math.cos(a) * 0.9, 1, Math.sin(a) * 0.9], [0.25, 1.6, 0.25]); } }
  if (ex.has('halo')) P(head, PRIM.torus, [1, 0.95, 0.5], [0, 1.25, 0], [0.55, 0.6, 0.55], null, { emis: [0.5, 0.45, 0.2] });
  if (ex.has('scarf')) P(body, PRIM.torus, [0.85, 0.15, 0.2], [0, 0.75, 0.15], [0.62, 1.2, 0.62], [0.3, 0, 0]);
  if (ex.has('gem')) P(head, PRIM.gem, [0.4, 0.9, 1], [0, 0.45, 0.85], [0.14, 0.2, 0.14], [Math.PI / 2, 0, 0], { emis: [0.1, 0.3, 0.45] });
  if (ex.has('star')) P(body, PRIM.star, [1, 0.95, 0.4], [0, 0.1, 1.02], [0.35], null, { emis: [0.5, 0.45, 0.1], unlit: true });
  if (ex.has('spots')) for (let i = 0; i < 4; i++) P(body, PRIM.sphereLo, dark, [Math.sin(i * 2.1) * 0.75, 0.4 + (i % 2) * 0.2, Math.cos(i * 2.1) * 0.6], [0.14, 0.14, 0.08]);
  if (ex.has('armor')) { P(body, PRIM.sphere, [0.75, 0.78, 0.85], [0, 0.35, 0], [1.05, 0.7, 1.05]); }
  if (ex.has('helmet')) P(head, PRIM.sphere, [0.7, 0.72, 0.8], [0, 0.35, -0.05], [1.08, 0.8, 1.08]);
  if (ex.has('cape')) P(body, PRIM.box, [0.75, 0.15, 0.25], [0, -0.1, -0.95], [1.3, 1.6, 0.06], [0.15, 0, 0]);
  if (ex.has('belt')) P(body, PRIM.torus, [0.25, 0.2, 0.18], [0, -0.35, 0], [1.0, 1, 1.0]);
  if (ex.has('tentacles')) for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const tn = J(body, [Math.cos(a) * 0.6, -0.6, Math.sin(a) * 0.6]); P(tn, PRIM.taperDown, c2, [0, 0, 0], [0.08, 0.9, 0.08]); M.tails.push(tn); }
  if (ex.has('lantern')) { P(body, PRIM.box, [0.25, 0.2, 0.15], [0, 1.0, 0], [0.8, 0.15, 0.8]); P(body, PRIM.sphereLo, [1, 0.75, 0.3], [0, 0, 0.3], [0.45], null, { emis: [0.8, 0.45, 0.1] }); }
  if (ex.has('glow') || ex.has('lava') || ex.has('runes')) { body.emis = glowCol.map(v => v * 0.15); }
  if (ex.has('lava')) for (let i = 0; i < 5; i++) P(body, PRIM.box, [1, 0.45, 0.1], [Math.sin(i * 1.9) * 0.85, (i % 3 - 1) * 0.3, Math.cos(i * 1.9) * 0.85], [0.08, 0.35, 0.08], [0, 0, i], { emis: [0.9, 0.35, 0], unlit: true });
  if (ex.has('runes')) for (let i = 0; i < 4; i++) P(body, PRIM.box, [0.5, 1, 0.95], [Math.sin(i * 1.6) * 0.9, (i % 2) * 0.3, Math.cos(i * 1.6) * 0.9], [0.18, 0.04, 0.04], null, { emis: [0.2, 0.8, 0.7], unlit: true });
  if (ex.has('wraps')) for (let i = 0; i < 4; i++) P(body, PRIM.torus, [0.95, 0.92, 0.82], [0, -0.6 + i * 0.4, 0], [1.02, 1.3, 1.02], [0.15 * (i % 2 ? 1 : -1), 0, 0.1]);
  if (ex.has('flowerhead')) for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; P(head, PRIM.sphereLo, c2, [Math.cos(a) * 0.9, 0.45 + Math.sin(a) * 0.9, -0.15], [0.35, 0.35, 0.12]); }
  if (ex.has('crest')) for (let i = 0; i < 3; i++) P(head, PRIM.cone, c2, [0, 0.8, 0.1 - i * 0.25], [0.1, 0.5 - i * 0.1, 0.1], [-0.4 - i * 0.3, 0, 0]);
  if (ex.has('sword')) { const a = M.arms[1]; if (a) { P(a, PRIM.box, [0.85, 0.88, 0.95], [0, -0.5, 0.45], [0.06, 0.08, 1.0], null, { emis: [0.1, 0.1, 0.2] }); P(a, PRIM.box, [0.6, 0.45, 0.2], [0, -0.5, -0.05], [0.25, 0.08, 0.08]); } }
  if (ex.has('hammer')) { const a = M.arms[1]; if (a) { P(a, PRIM.cyl, [0.5, 0.35, 0.2], [0, -0.45, 0], [0.04, 0.6, 0.04], [Math.PI / 2, 0, 0]); P(a, PRIM.box, [0.5, 0.5, 0.55], [0, -0.45, 0.6], [0.3, 0.3, 0.2]); } }
  if (ex.has('claws')) for (const l of M.legs.slice(0, 2)) for (let i = -1; i <= 1; i++) P(l, PRIM.cone, [0.95, 0.95, 0.9], [i * 0.06, -l.len, 0.15], [0.03, 0.15, 0.03], [Math.PI / 2, 0, 0]);
  if (ex.has('beard')) P(head, PRIM.cone, light, [0, -0.6, 0.6], [0.15, 0.4, 0.15], [Math.PI, 0, 0]);
  if (ex.has('headdress')) { P(head, PRIM.box, [0.95, 0.8, 0.3], [0, 0.3, -0.2], [1.3, 0.7, 0.9]); for (const s of [-1, 1]) P(head, PRIM.box, [0.2, 0.35, 0.8], [s * 0.6, -0.2, -0.2], [0.12, 0.9, 0.6]); }
  if (ex.has('sunball')) P(pivot, PRIM.sphere, [1, 0.6, 0.15], [0, 0.5, 0.95], [0.38], null, { emis: [0.8, 0.35, 0.05] });
  if (ex.has('bubbles')) for (let i = 0; i < 4; i++) P(body, PRIM.sphereLo, light, [Math.sin(i * 2) * 0.9, 0.8 + i * 0.1, Math.cos(i * 2) * 0.7], [0.12], null, { alpha: 0.6 });
  if (ex.has('hood')) P(head, PRIM.sphere, c2, [0, 0, -0.3], [1.5, 1.2, 0.5]);
  if (ex.has('stripes') && plan !== 'bug') for (let i = 0; i < 3; i++) P(body, PRIM.box, dark, [0, 0.75, 0.4 - i * 0.4], [0.2, 0.06, 0.12]);
  if (ex.has('belly')) P(body, PRIM.sphere, light, [0, -0.2, 0.45], [0.75, 0.7, 0.5]);
  if (ex.has('scar')) P(head, PRIM.box, [0.6, 0.2, 0.2], [0.3, 0.35, 0.92], [0.06, 0.4, 0.04], [0, 0, 0.6]);
  if (ex.has('whiskers') && face !== 'whiskers') for (const s of [-1, 1]) P(head, PRIM.cyl, c2, [s * 0.4, -0.2, 0.8], [0.03, 0.9, 0.03], [1.2, 0, s * 1.2]);

  // サイズ（段階・種族ごと）
  const st = sp.legend ? 1 : sp.stages === 1 ? 1.08 : [0.78, 1.02, 1.3][sp.stage - 1] * (sp.stages === 2 && sp.stage === 2 ? 1.12 : 1);
  M.size = st * (sp.scale || 1);
  pivot.setScale(M.size);
  // 高さの概算（カメラ・UI用）
  M.height = (plan === 'biped' || plan === 'golem' || plan === 'plant' ? 2.0 : plan === 'dragon' ? 1.9 : plan === 'leviathan' ? 2.2 : 1.5) * M.size;
  M.t = r() * 10;
  return M;
}

// アニモンのアニメーション
export function animateAnimon(M, dt, state = 'idle', speed = 1) {
  M.t += dt * speed;
  const t = M.t, p = M.pivot;
  const walk = state === 'walk' || state === 'run';
  const w = walk ? (state === 'run' ? 14 : 9) : 0;
  const plan = M.plan;
  p.pos[1] = M.floating ? 0.25 * M.size + Math.sin(t * 2) * 0.08 * M.size : (walk ? Math.abs(Math.sin(t * w)) * 0.06 * M.size : 0);
  if (state === 'fly') p.pos[1] = 0.2 * M.size + Math.sin(t * 3) * 0.1;
  const breathe = 1 + Math.sin(t * 2.2) * 0.025;
  if (M.body && M.body.scl) M.body._s0 = M.body._s0 || M.body.scl.slice();
  if (M.body && M.body._s0) M.body.scl[1] = M.body._s0[1] * breathe;
  // 脚
  M.legs.forEach((l, i) => {
    if (plan === 'bug') { l.rot[0] = walk ? Math.sin(t * w + i * 1.3) * 0.5 : Math.sin(t * 2 + i) * 0.05; return; }
    const ph = plan === 'quad' || plan === 'dragon' || plan === 'turtle' ? ((i === 0 || i === 3) ? 0 : Math.PI) : i * Math.PI;
    l.rot[0] = walk ? Math.sin(t * w + ph) * 0.65 : 0;
  });
  M.arms.forEach((a, i) => { a.rot[0] = walk ? -Math.sin(t * w + i * Math.PI) * 0.6 : Math.sin(t * 2 + i) * 0.08; });
  // 翼
  const flapSp = state === 'fly' ? 9 : (plan === 'bird' || plan === 'bug' ? 3.5 : 2);
  const flapAmp = state === 'fly' ? 0.7 : (plan === 'bug' ? 0.4 : 0.25);
  M.wings.forEach(wg => { wg.rot[2] = wg.side * (Math.sin(t * flapSp) * flapAmp + (plan === 'bird' ? -0.2 : 0)); });
  M.fins.forEach(fn => { fn.rot[2] = fn.side * Math.sin(t * 4) * 0.3; });
  // 尻尾
  M.tails.forEach((tl, i) => { tl.rot[1] = Math.sin(t * (walk ? 6 : 2.5) + i) * 0.35; });
  // ヘビ型のうねり
  if (M.segs.length) M.segs.forEach((s, i) => { s.pos[0] = Math.sin(t * (walk ? 6 : 2) - i * 0.8) * 0.12 * (i + 1) * 0.5; });
  if (M.head && M.head !== M.body && M.head.rot) M.head.rot[1] = Math.sin(t * 0.8) * 0.12;
  if (M.flame) { const s = 1 + Math.sin(t * 15) * 0.12; M.flame.setScale(s, s * (1 + Math.sin(t * 11) * 0.1), s); }
}

// ---------------- 人物 ----------------
export const SKIN = ['#ffe0c8', '#f5c9a3', '#e0a77a', '#b97a52', '#8a5636', '#5c3a24'];
export const HAIR_COL = ['#2a1e1a', '#5a3a22', '#a8642a', '#e8c060', '#e8e8f0', '#d04040', '#3a6ad0', '#4ab070', '#d070c0', '#7a5ad0'];
export const CLOTH = ['#e04848', '#3a7ae0', '#48b060', '#f0b030', '#9050d0', '#2a2a36', '#ffffff', '#f07ab0', '#30b0b0', '#8a5a3a'];
export const HAIR_STYLES = ['short', 'spiky', 'long', 'ponytail', 'bob', 'buzz'];
export const HAIR_JA = { short: 'ショート', spiky: 'ツンツン', long: 'ロング', ponytail: 'ポニーテール', bob: 'ボブ', buzz: 'ぼうず' };
export const HATS = ['none', 'cap', 'beanie', 'hat'];
export const HAT_JA = { none: 'なし', cap: 'キャップ', beanie: 'ニット帽', hat: 'ぼうし' };
export const BOTTOMS = ['pants', 'shorts', 'skirt'];
export const BOTTOM_JA = { pants: 'ズボン', shorts: '短パン', skirt: 'スカート' };

export function defaultLook() {
  return { skin: 0, hair: 'short', hairCol: 0, shirt: 0, pants: 5, shoes: 6, hat: 'cap', hatCol: 0, bottom: 'pants' };
}

export function buildHuman(look) {
  initPrims();
  const skin = hexToRgb(SKIN[look.skin] || SKIN[0]);
  const hairC = hexToRgb(HAIR_COL[look.hairCol] || HAIR_COL[0]);
  const shirt = hexToRgb(CLOTH[look.shirt] ?? CLOTH[0]);
  const pants = hexToRgb(CLOTH[look.pants] ?? CLOTH[5]);
  const shoes = hexToRgb(CLOTH[look.shoes] ?? CLOTH[6]);
  const root = new Node(); const pivot = new Node(); root.add(pivot);
  const H = { root, pivot, legs: [], arms: [], t: 0 };
  const hipY = 0.92;
  // 脚
  for (const s of [-1, 1]) {
    const j = J(pivot, [s * 0.14, hipY, 0]);
    const legCol = look.bottom === 'pants' ? pants : skin;
    P(j, PRIM.taperDown, legCol, [0, 0, 0], [0.11, 0.8, 0.11]);
    if (look.bottom === 'shorts') P(j, PRIM.cylDown, pants, [0, 0.02, 0], [0.125, 0.32, 0.125]);
    P(j, PRIM.box, shoes, [0, -0.84, 0.05], [0.17, 0.12, 0.3]);
    H.legs.push(j);
  }
  // 体
  const torso = P(pivot, PRIM.box, shirt, [0, hipY + 0.32, 0], [0.48, 0.62, 0.28]);
  if (look.bottom === 'skirt') P(pivot, PRIM.cylinder || PRIM.cyl, pants, [0, hipY - 0.28, 0], [0.32, 0.36, 0.24]);
  else P(pivot, PRIM.box, pants, [0, hipY + 0.02, 0], [0.46, 0.14, 0.27]);
  P(torso, PRIM.box, mixRgb(shirt, [1, 1, 1], 0.35), [0, 0.38, 0.1], [0.5, 0.15, 0.5]);
  // バッグ
  P(torso, PRIM.box, [0.55, 0.35, 0.2], [0, 0.05, -0.62], [0.65, 0.65, 0.4]);
  // 腕
  for (const s of [-1, 1]) {
    const j = J(pivot, [s * 0.31, hipY + 0.58, 0], [0, 0, s * 0.08]);
    P(j, PRIM.taperDown, shirt, [0, 0, 0], [0.085, 0.32, 0.085]);
    P(j, PRIM.taperDown, skin, [0, -0.3, 0], [0.07, 0.32, 0.07]);
    P(j, PRIM.sphereLo, skin, [0, -0.66, 0], [0.085]);
    H.arms.push(j);
  }
  // 頭
  const head = P(pivot, PRIM.sphere, skin, [0, hipY + 0.9, 0.02], [0.27, 0.28, 0.26]);
  H.head = head;
  for (const s of [-1, 1]) {
    P(head, PRIM.sphereLo, EYE_B, [s * 0.36, 0.05, 0.86], [0.11, 0.16, 0.08]);
    P(head, PRIM.sphereLo, [1, 1, 1], [s * 0.36 + 0.03, 0.12, 0.92], [0.04]);
    P(head, PRIM.sphereLo, [1, 0.6, 0.6], [s * 0.55, -0.22, 0.72], [0.1, 0.06, 0.05], null, { alpha: 0.6 });
  }
  P(head, PRIM.box, [0.6, 0.25, 0.25], [0, -0.38, 0.9], [0.18, 0.03, 0.04]);
  // 髪
  const hs = look.hair;
  if (hs !== 'buzz') P(head, PRIM.sphere, hairC, [0, 0.18, -0.1], [1.08, 0.92, 1.08]);
  else P(head, PRIM.sphere, hairC, [0, 0.25, -0.08], [1.03, 0.8, 1.03]);
  if (hs === 'short' || hs === 'bob' || hs === 'long' || hs === 'ponytail') P(head, PRIM.box, hairC, [0, 0.62, 0.62], [1.6, 0.35, 0.5], [0.3, 0, 0]);
  if (hs === 'spiky') for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; P(head, PRIM.cone, hairC, [Math.cos(a) * 0.55, 0.75, Math.sin(a) * 0.5 - 0.1], [0.22, 0.6, 0.22], [Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7]); }
  if (hs === 'long') P(head, PRIM.box, hairC, [0, -0.45, -0.45], [1.85, 1.7, 0.6]);
  if (hs === 'bob') P(head, PRIM.sphere, hairC, [0, -0.1, -0.1], [1.15, 0.85, 1.12]);
  if (hs === 'ponytail') { P(head, PRIM.sphere, hairC, [0, 0.1, -1.05], [0.32, 0.32, 0.3]); const pt = J(head, [0, 0.05, -1.15], [0.5, 0, 0]); P(pt, PRIM.taperDown, hairC, [0, 0, 0], [0.22, 1.2, 0.22]); H.pony = pt; }
  // 帽子
  const hatC = hexToRgb(CLOTH[look.hatCol ?? look.shirt] ?? CLOTH[0]);
  if (look.hat === 'cap') { P(head, PRIM.sphere, hatC, [0, 0.38, -0.05], [1.1, 0.72, 1.1]); P(head, PRIM.box, hatC, [0, 0.42, 1.0], [1.3, 0.08, 0.7]); P(head, PRIM.box, [1, 1, 1], [0, 0.9, 0.55], [0.4, 0.3, 0.1], [0.4, 0, 0]); }
  if (look.hat === 'beanie') { P(head, PRIM.sphere, hatC, [0, 0.4, -0.05], [1.1, 0.8, 1.1]); P(head, PRIM.sphereLo, [1, 1, 1], [0, 1.2, -0.05], [0.25]); }
  if (look.hat === 'hat') { P(head, PRIM.cyl, hatC, [0, 0.55, 0], [1.6, 0.06, 1.6]); P(head, PRIM.cyl, hatC, [0, 0.55, 0], [0.95, 0.6, 0.95]); P(head, PRIM.cyl, [0.9, 0.2, 0.2], [0, 0.6, 0], [0.98, 0.12, 0.98]); }
  pivot.setScale(1.05);
  return H;
}

export function animateHuman(H, dt, state = 'idle', speed = 1) {
  H.t += dt * speed;
  const t = H.t;
  const run = state === 'run', walk = state === 'walk' || run;
  const f = run ? 13 : 9, amp = run ? 0.9 : 0.6;
  H.legs.forEach((l, i) => { l.rot[0] = walk ? Math.sin(t * f + i * Math.PI) * amp : 0; });
  H.arms.forEach((a, i) => { a.rot[0] = walk ? -Math.sin(t * f + i * Math.PI) * amp * 0.9 : Math.sin(t * 1.8 + i) * 0.04; });
  H.pivot.pos[1] = walk ? Math.abs(Math.sin(t * f)) * (run ? 0.1 : 0.06) : Math.sin(t * 2) * 0.01;
  if (state === 'ride') { H.legs.forEach((l, i) => { l.rot[0] = -1.3; l.rot[2] = (i ? 1 : -1) * 0.35; }); H.arms.forEach(a => { a.rot[0] = -0.6; }); H.pivot.pos[1] = 0; }
  else H.legs.forEach(l => { l.rot[2] = 0; });
  if (state === 'wave') { H.arms[1].rot[2] = 2.6 + Math.sin(t * 8) * 0.3; H.arms[1].rot[0] = 0; } else if (H.arms[1]) H.arms[1].rot[2] = 0.08;
  if (H.pony) H.pony.rot[0] = 0.5 + (walk ? Math.sin(t * f) * 0.15 : 0);
  if (H.head) H.head.rot[1] = walk ? 0 : Math.sin(t * 0.7) * 0.1;
}

export function randomLook(r) {
  return {
    skin: Math.floor(r() * 4), hair: HAIR_STYLES[Math.floor(r() * HAIR_STYLES.length)], hairCol: Math.floor(r() * HAIR_COL.length),
    shirt: Math.floor(r() * CLOTH.length), pants: Math.floor(r() * CLOTH.length), shoes: Math.floor(r() * CLOTH.length),
    hat: r() < 0.6 ? 'none' : HATS[1 + Math.floor(r() * 3)], hatCol: Math.floor(r() * CLOTH.length), bottom: BOTTOMS[Math.floor(r() * 3)],
  };
}
