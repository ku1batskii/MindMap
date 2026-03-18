// ─── Node style constants ─────────────────────────────────────────────────────
export const DARK_STYLE = {
  idea:        { fill:"#002a38", stroke:"#00d4ff", color:"#33eeff" },
  subgoal:     { fill:"#00210f", stroke:"#00ff55", color:"#00ffaa" },
  step:        { fill:"#181e18", stroke:"#88bb88", color:"#aaccaa" },
  risk:        { fill:"#280010", stroke:"#ff2255", color:"#ff4477" },
  alternative: { fill:"#160028", stroke:"#bb66ff", color:"#cc88ff" },
};
export const LIGHT_STYLE = {
  idea:        { fill:"#d6f4ff", stroke:"#007aaa", color:"#004466" },
  subgoal:     { fill:"#d0ffe0", stroke:"#007722", color:"#003d11" },
  step:        { fill:"#ececec", stroke:"#557755", color:"#223322" },
  risk:        { fill:"#ffd6e0", stroke:"#bb1133", color:"#6e0018" },
  alternative: { fill:"#ead6ff", stroke:"#7722cc", color:"#3d0077" },
};

// ─── Layout constants ─────────────────────────────────────────────────────────
export const NW = 158;
export const RW = 196, RH = 46;
export const TITLE_MAX_CHARS = 14;
export const NOTE_MAX_CHARS  = 17;
export const PAD_TOP=8, PAD_BOT=7, TITLE_LH=15;
export const DIV_GAP=4, DIV_H=1, NOTE_GAP=5, NOTE_LH=12, BADGE_H=12;

// ─── Text helpers ─────────────────────────────────────────────────────────────
export function wrapText(text, maxChars) {
  const words = (text || "").split(" ");
  let lines = [], cur = "";
  for (const w of words) {
    const c = cur ? cur + " " + w : w;
    if (c.length <= maxChars) { cur = c; }
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines.map(l => l.length > maxChars ? l.slice(0, maxChars) + "-" : l);
}

export function nodeHeight(title, note) {
  const tl = Math.max(wrapText(title || "", TITLE_MAX_CHARS).length, 1);
  const nl = note ? wrapText(note, NOTE_MAX_CHARS).length : 0;
  return PAD_TOP + tl * TITLE_LH + (nl > 0 ? DIV_GAP + DIV_H + NOTE_GAP + nl * NOTE_LH : DIV_GAP) + BADGE_H + PAD_BOT;
}

export function uid() { return "n" + (Date.now() % 1e9) + "_" + Math.floor(Math.random() * 999); }
export function trunc(s, n) { return s && s.length > n ? s.slice(0, n) + "…" : s || ""; }

export function smartTitle(note) {
  if (!note) return "Идея";
  const stop = new Set(["я","мой","моя","мне","это","как","что","для","все","они","его","или","но","и","в","на","по","от","до"]);
  const words = (note || "").split(" ").filter(w => w.length > 2 && !stop.has(w.toLowerCase()));
  return words.slice(0, 3).join(" ") || note.split(" ").slice(0, 3).join(" ");
}

export function fallback(input) {
  const lines = input.split(/[.\n!?]/).map(l => l.trim()).filter(l => l.length > 2).slice(0, 8);
  const src = lines.length ? lines : [input.trim()];
  return {
    goal: input.slice(0, 50),
    nodes: src.map(l => ({ id: uid(), title: l.split(" ").slice(0, 3).join(" "), note: l, type: "idea", confidence: "medium", parentId: null }))
  };
}

// ─── Radial layout ─────────────────────────────────────────────────────────────
export function computeRadialLayout(tree, W, H) {
  const pos = {}, cx = W / 2, cy = H / 2;
  pos["ROOT"] = { x: cx, y: cy };
  const orphans = tree.nodes.filter(n => !n.parentId);
  if (!orphans.length) return pos;

  const L1R = Math.max(280, (NW + 60) * orphans.length / (2 * Math.PI));

  orphans.forEach((n, i) => {
    const angle = (i / orphans.length) * Math.PI * 2 - Math.PI / 2;
    const nx = cx + L1R * Math.cos(angle);
    const ny = cy + L1R * Math.sin(angle);
    pos[n.id] = { x: nx, y: ny };

    const children = tree.nodes.filter(c => c.parentId === n.id);
    if (!children.length) return;

    const L2R = Math.max(180, (NW + 50) * children.length / (2 * Math.PI * 0.65));
    const sectorMax = orphans.length > 1 ? (2 * Math.PI / orphans.length) * 0.7 : Math.PI * 1.3;
    const fanSpan = Math.min(sectorMax, children.length * 0.55);

    children.forEach((c, j) => {
      const ca = children.length === 1 ? angle : angle - fanSpan / 2 + (fanSpan / (children.length - 1)) * j;
      const cx2 = nx + L2R * Math.cos(ca);
      const cy2 = ny + L2R * Math.sin(ca);
      pos[c.id] = { x: cx2, y: cy2 };

      const gcs = tree.nodes.filter(gc => gc.parentId === c.id);
      if (!gcs.length) return;

      const L3R = Math.max(140, (NW + 40) * gcs.length / (2 * Math.PI * 0.55));
      const gFan = Math.min(fanSpan / Math.max(children.length, 1) * 0.75, gcs.length * 0.42);
      gcs.forEach((gc, k) => {
        const gca = gcs.length === 1 ? ca : ca - gFan / 2 + (gFan / (gcs.length - 1)) * k;
        pos[gc.id] = { x: cx2 + L3R * Math.cos(gca), y: cy2 + L3R * Math.sin(gca) };
      });
    });
  });
  return pos;
}

export function fitAll(posMap, W, H) {
  const pts = Object.values(posMap);
  if (!pts.length) return { x: 0, y: 0, scale: 1 };
  const pad = 110;
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad;
  const y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad;
  const sc = Math.min(W / (x1 - x0), H / (y1 - y0), 1.6, 2.5);
  return { x: W / 2 - sc * (x0 + x1) / 2, y: H / 2 - sc * (y0 + y1) / 2, scale: sc };
}

// ─── Smart anchor ─────────────────────────────────────────────────────────────
export function smartAnchor(px, py, ph, cx, cy, ch) {
  const dx = cx - px, dy = cy - py;
  let sx, sy, tx, ty;
  if (Math.abs(dx) >= Math.abs(dy)) {
    sx = dx >= 0 ? px + NW / 2 : px - NW / 2; sy = py;
    tx = dx >= 0 ? cx - NW / 2 : cx + NW / 2; ty = cy;
  } else {
    sx = px; sy = dy >= 0 ? py + ph / 2 : py - ph / 2;
    tx = cx; ty = dy >= 0 ? cy - ch / 2 : cy + ch / 2;
  }
  return { sx, sy, tx, ty };
}

// ─── Theme palette ────────────────────────────────────────────────────────────
export function getTheme(dark) {
  return dark ? {
    bg:"#090909", bgSub:"#060d06", border:"#1e4428",
    accent:"#00ff88", accentDim:"rgba(0,255,136,0.82)", accentFaint:"rgba(0,255,136,0.2)",
    text:"#00ff88", textDim:"rgba(0,255,136,0.48)", cardBg:"#0a120a", dots:"#131a13",
  } : {
    bg:"#f0f7f0", bgSub:"#e0ede0", border:"#4a8a5a",
    accent:"#006622", accentDim:"rgba(0,80,30,0.82)", accentFaint:"rgba(0,80,30,0.2)",
    text:"#004d18", textDim:"rgba(0,80,30,0.48)", cardBg:"#d0e8d0", dots:"#b0ccb0",
  };
}