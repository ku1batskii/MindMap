import { useState, useEffect, useRef, useCallback } from “react”;

const TFILL   = {idea:”#002a38”,subgoal:”#00210f”,step:”#181e18”,risk:”#280010”,alternative:”#160028”};
const TSTROKE = {idea:”#00d4ff”,subgoal:”#00ff55”,step:”#88bb88”,risk:”#ff2255”,alternative:”#bb66ff”};
const TCOLOR  = {idea:”#33eeff”,subgoal:”#00ffaa”,step:”#aaccaa”,risk:”#ff4477”,alternative:”#cc88ff”};

const NW = 180;          // node width px
const RW = 210, RH = 52;

const TITLE_MAX_CHARS = 17;  // title line ? bold 11px mono, fits ~17 chars safely
const NOTE_MAX_CHARS  = 21;  // note line  ? 10px mono, fits ~21 chars safely

const PAD_TOP  = 9;
const PAD_BOT  = 8;
const TITLE_LH = 16;  // title line height px
const DIV_GAP  = 5;   // gap before divider
const DIV_H    = 1;   // divider height
const NOTE_GAP = 6;   // gap after divider before first note line
const NOTE_LH  = 13;  // note line height px
const BADGE_H  = 14;  // bottom badge row

function wrapText(text, maxChars) {
const words = (text || “”).split(” “);
const lines = [];
let cur = “”;
for (const word of words) {
const candidate = cur ? cur + “ “ + word : word;
if (candidate.length <= maxChars) { cur = candidate; }
else { if (cur) lines.push(cur); cur = word; }
}
if (cur) lines.push(cur);
return lines;
}

function nodeHeight(title, note) {
const titleLines = Math.max(wrapText(title || “”, TITLE_MAX_CHARS).length, 1);
const noteLines  = note ? wrapText(note, NOTE_MAX_CHARS).length : 0;
return (
PAD_TOP +
titleLines * TITLE_LH +
(noteLines > 0 ? DIV_GAP + DIV_H + NOTE_GAP + noteLines * NOTE_LH : DIV_GAP) +
BADGE_H +
PAD_BOT
);
}

function uid() { return “n” + (Date.now() % 1e9) + “_” + Math.floor(Math.random() * 999); }
function trunc(s, n) { return s && s.length > n ? s.slice(0, n) + “…” : s || “”; }

function fallback(input, existing) {
const base = existing.length;
const lines = input.split(/[.\n!?]/).map(l => l.trim()).filter(l => l.length > 2).slice(0, 8);
const src = lines.length ? lines : [input.trim()];
return {
goal: input.slice(0, 50),
nodes: src.map((l, i) => ({
id: “n” + (base + i + 1),
title: l.split(” “).slice(0, 3).join(” “),
note: l,
type: “idea”, confidence: “medium”, parentId: null
}))
};
}

async function fetchMap(input, tree) {
const ids  = tree.nodes.map(n => n.id);
const maxN = ids.reduce((m, id) => {
const n = parseInt(id.replace(/\D/g, “”), 10);
return isNaN(n) ? m : Math.max(m, n);
}, 0);
const compact = {
goal: tree.goal,
nodes: tree.nodes.map(n => ({ id: n.id, title: n.title, note: n.note, type: n.type, parentId: n.parentId }))
};

// – Step 1: extract ideas and notes –––––––––––––––––––
const prompt1 =
“Return ONLY raw JSON, no markdown, no backticks.\n” +
‘Schema: {“goal”:“string”,“nodes”:[{“id”:“n1”,“note”:“1-2 sentences”,“type”:“idea|subgoal|step|risk|alternative”,“confidence”:“high|medium|low”,“parentId”:null}]}\n’ +
“Rules: Extract 4-10 distinct ideas. note=clear summary of this idea 1-2 sentences. “ +
“Keep existing nodes. New IDs from n” + (maxN+1) + “. parentId refs existing id or null. Same language as input.\n” +
“Existing: “ + JSON.stringify(compact) + “\nInput: “ + input;

const res1 = await fetch(”/api/ai”, {
method: “POST”,
headers: { “Content-Type”: “application/json” },
body: JSON.stringify({ model: “claude-haiku-4-5-20251001”, max_tokens: 1600, messages: [{ role: “user”, content: prompt1 }] })
});

const text1 = await res1.text();
let data1;
try { data1 = JSON.parse(text1); } catch(e) { return fallback(input, tree.nodes); }
if (data1.error) throw new Error(data1.error.message || “API error”);

const raw1  = (data1.content?.[0]?.text) || “”;
const m1    = raw1.replace(/`json/gi,"").replace(/`/g,””).trim().match(/{[\s\S]*}/);
if (!m1) return fallback(input, tree.nodes);

let p;
try { p = JSON.parse(m1[0]); } catch(e) { return fallback(input, tree.nodes); }

const VT = [“idea”,“subgoal”,“step”,“risk”,“alternative”], VC = [“high”,“medium”,“low”];
p.goal  = p.goal || tree.goal || input.slice(0,50) || “Map”;
p.nodes = (Array.isArray(p.nodes) ? p.nodes : []).map(n => ({
id:         String(n.id || uid()),
title:      “”,
note:       String(n.note || “”).replace(/”/g,”’”),
type:       VT.includes(n.type) ? n.type : “idea”,
confidence: VC.includes(n.confidence) ? n.confidence : “medium”,
parentId:   n.parentId || null
}));

// – Step 2: generate titles for new nodes only ––––––––––––––
const newNodes = p.nodes.filter(n => !tree.nodes.find(e => e.id === n.id));

if (newNodes.length > 0) {
const notesList = newNodes.map((n, i) => (i+1) + “. “ + n.note).join(”\n”);
const prompt2 =
“For each numbered note, write a 2-3 word title that captures the CORE THEME.\n” +
“Rules:\n” +
“- The title must be a thematic label, like a newspaper headline or book chapter.\n” +
“- NEVER use the first words of the note as the title.\n” +
“- Think: what is the TOPIC of this note? Name the topic, not the content.\n” +
“- Return ONLY a JSON array of strings, one per note, same order. No markdown.\n” +
“- Same language as the notes.\n\n” +
“Notes:\n” + notesList;

```
try {
  const res2 = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 300, messages: [{ role: "user", content: prompt2 }] })
  });
  const data2 = await res2.json();
  const raw2  = (data2.content?.[0]?.text || "").replace(/```json/gi,"").replace(/```/g,"").trim();
  const arr   = JSON.parse(raw2.match(/\[[\s\S]*\]/)?.[0] || "[]");
  newNodes.forEach((n, i) => {
    n.title = String(arr[i] || "").trim() || n.note.split(" ").slice(0,3).join(" ");
  });
} catch(e) {
  newNodes.forEach(n => { n.title = n.note.split(" ").slice(0,3).join(" "); });
}
```

}

// Restore titles of existing nodes
tree.nodes.forEach(old => {
const found = p.nodes.find(n => n.id === old.id);
if (found) found.title = old.title;
});

return p;
}

function computeLayout(tree, pos, W, H) {
const next = { …pos };
const cx = W / 2, cy = H / 2;
if (tree.goal && !next[“ROOT”]) next[“ROOT”] = { x: cx, y: cy - 80 };

const childMap = {}, orphans = [];
tree.nodes.forEach(n => {
if (!n.parentId) orphans.push(n.id);
else { if (!childMap[n.parentId]) childMap[n.parentId] = []; childMap[n.parentId].push(n.id); }
});

orphans.forEach((id, i) => {
if (next[id]) return;
const a = (i / Math.max(orphans.length, 1)) * Math.PI * 2 - Math.PI / 2;
const r = Math.max(230, orphans.length * 40);
next[id] = { x: cx + r * Math.cos(a), y: cy + 80 + r * 0.6 * Math.sin(a) };
});

let queue = […orphans], visited = {}, depth = 1;
orphans.forEach(id => { visited[id] = true; });
while (queue.length) {
const nq = [];
queue.forEach(pid => {
const kids = childMap[pid] || [];
const pp = next[pid] || { x: cx, y: cy };
const pNode = tree.nodes.find(n => n.id === pid);
const pnh = nodeHeight(pNode ? pNode.title : “”, pNode ? pNode.note : “”);
kids.forEach((kid, i) => {
if (!next[kid]) next[kid] = { x: pp.x + (i - (kids.length - 1) / 2) * 210, y: pp.y + pnh / 2 + 80 + depth * 4 };
if (!visited[kid]) { visited[kid] = true; nq.push(kid); }
});
});
queue = nq; depth++;
}
return next;
}

export default function MindMap() {
const [tree, setTree]           = useState({ goal: “”, nodes: [] });
const [pos, setPos]             = useState({});
const [log, setLog]             = useState([
{ c: “s”, t: “MIND MAP – введи текст внизу” },
{ c: “s”, t: “/mock – тест · /clear – сброс” }
]);
const [input, setInput]         = useState(””);
const [busy, setBusy]           = useState(false);
const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });

const svgRef      = useRef(null);
const gRef        = useRef(null);   // the inner <g> we transform directly
const logRef      = useRef(null);
const dragging    = useRef(null);
const treeRef     = useRef(tree);
const posRef      = useRef({});
const transformRef = useRef({ x: 0, y: 0, scale: 1 }); // live value, no re-render
useEffect(() => { treeRef.current = tree; }, [tree]);
useEffect(() => { posRef.current = pos; }, [pos]);

// Apply transform via CSS - runs on compositor thread (GPU), no layout cost
const applyTransform = (t) => {
transformRef.current = t;
if (gRef.current)
gRef.current.style.transform = `translate(${t.x}px,${t.y}px) scale(${t.scale})`;
};

// Flush ref value into React state (called on gesture end / fit / tree change)
const flushTransform = (t) => {
applyTransform(t);
setTransform(t);
};

const lg = useCallback((c, t) => {
setLog(l => { const n = […l, { c, t }]; return n.length > 80 ? n.slice(-80) : n; });
setTimeout(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, 30);
}, []);

useEffect(() => {
const svg = svgRef.current; if (!svg) return;
const { width: W, height: H } = svg.getBoundingClientRect();
const w = W || 600, h = H || 400;
setPos(prev => {
const next = computeLayout(tree, prev, w, h);
const pts = Object.values(next);
if (pts.length) {
const pad = 110;
const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
const x0 = Math.min(…xs) - pad, x1 = Math.max(…xs) + pad;
const y0 = Math.min(…ys) - pad, y1 = Math.max(…ys) + pad;
const sc = Math.min(w / (x1 - x0), h / (y1 - y0), 1.4, 2);
flushTransform({ x: w / 2 - sc * (x0 + x1) / 2, y: h / 2 - sc * (y0 + y1) / 2, scale: sc });
}
return next;
});
}, [tree]);

const fit = useCallback(() => {
const svg = svgRef.current; if (!svg) return;
const { width: W, height: H } = svg.getBoundingClientRect();
setPos(prev => {
const pts = Object.values(prev); if (!pts.length) return prev;
const pad = 110;
const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
const x0 = Math.min(…xs) - pad, x1 = Math.max(…xs) + pad;
const y0 = Math.min(…ys) - pad, y1 = Math.max(…ys) + pad;
const sc = Math.min(W / (x1 - x0), H / (y1 - y0), 1.4, 2);
flushTransform({ x: W / 2 - sc * (x0 + x1) / 2, y: H / 2 - sc * (y0 + y1) / 2, scale: sc });
return prev;
});
}, []);

// – Wheel zoom (desktop) –––––––––––––––––––––––––
useEffect(() => {
const svg = svgRef.current; if (!svg) return;
const onWheel = e => {
e.preventDefault();
const t    = transformRef.current;
const f    = e.deltaY < 0 ? 1.1 : 0.91;
const rect = svg.getBoundingClientRect();
const px   = e.clientX - rect.left;
const py   = e.clientY - rect.top;
const ns   = Math.min(5, Math.max(0.05, t.scale * f));
const sf   = ns / t.scale;
applyTransform({ scale: ns, x: px - sf*(px - t.x), y: py - sf*(py - t.y) });
};
svg.addEventListener(“wheel”, onWheel, { passive: false });
return () => svg.removeEventListener(“wheel”, onWheel);
}, []);

// – Unified pointer handler (mouse + touch via Pointer Events API) ———
// Tracks up to 2 active pointers. 1 pointer = pan. 2 pointers = pinch+pan.
// All transforms go direct to DOM - React state only updated on last pointerup.
useEffect(() => {
const svg = svgRef.current; if (!svg) return;
const pointers = new Map(); // pointerId ? {x, y}

```
const midpoint = () => {
  const pts = [...pointers.values()];
  return { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
};
const pinchDist = () => {
  const pts = [...pointers.values()];
  const dx = pts[0].x - pts[1].x, dy = pts[0].y - pts[1].y;
  return Math.sqrt(dx*dx + dy*dy);
};

let lastMid  = null;
let lastDist = null;
let panStart = null; // {ox, oy, sx, sy} for single-finger pan

let nodeDrag = null; // {id, ox, oy, sx, sy}

const onDown = e => {
  e.preventDefault();
  svg.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  // Check if finger landed on a node (walk up DOM tree)
  if (pointers.size === 1) {
    let el = e.target;
    while (el && el !== svg) {
      if (el.dataset && el.dataset.nodeid) {
        const nid = el.dataset.nodeid;
        // Get current position from pos state via posRef
        const p = posRef.current[nid] || { x: 0, y: 0 };
        nodeDrag = { id: nid, ox: p.x, oy: p.y, sx: e.clientX, sy: e.clientY };
        return;
      }
      el = el.parentElement;
    }
    // Canvas pan
    const t = transformRef.current;
    panStart = { ox: t.x, oy: t.y, sx: e.clientX, sy: e.clientY };
    lastMid  = null;
    lastDist = null;
  } else if (pointers.size === 2) {
    nodeDrag  = null;
    panStart  = null;
    lastMid   = midpoint();
    lastDist  = pinchDist();
  }
};

const onMove = e => {
  if (!pointers.has(e.pointerId)) return;
  e.preventDefault();
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (pointers.size === 1 && nodeDrag) {
    // Node drag - capture nodeDrag snapshot before async setPos
    const drag = nodeDrag;
    const dx = e.clientX - drag.sx;
    const dy = e.clientY - drag.sy;
    setPos(p => ({ ...p, [drag.id]: { x: drag.ox + dx, y: drag.oy + dy } }));

  } else if (pointers.size === 1 && panStart) {
    // Single finger - pan only
    const dx = e.clientX - panStart.sx;
    const dy = e.clientY - panStart.sy;
    applyTransform({ ...transformRef.current, x: panStart.ox + dx, y: panStart.oy + dy });

  } else if (pointers.size === 2 && lastMid && lastDist) {
    // Two fingers - pinch zoom + pan simultaneously
    const t    = transformRef.current;
    const m    = midpoint();
    const d    = pinchDist();
    const rect = svg.getBoundingClientRect();
    const px   = m.x - rect.left;
    const py   = m.y - rect.top;
    const ratio = d / lastDist;
    const ns    = Math.min(5, Math.max(0.05, t.scale * ratio));
    const sf    = ns / t.scale;
    const panDx = m.x - lastMid.x;
    const panDy = m.y - lastMid.y;
    applyTransform({
      scale: ns,
      x: px - sf*(px - t.x) + panDx,
      y: py - sf*(py - t.y) + panDy,
    });
    lastMid  = m;
    lastDist = d;
  }
};

const onUp = e => {
  e.preventDefault();
  pointers.delete(e.pointerId);

  if (pointers.size === 1) {
    // Dropped to 1 finger - reset pan anchor from current position
    const [remainId, remainPos] = [...pointers.entries()][0];
    const t = transformRef.current;
    panStart = { ox: t.x, oy: t.y, sx: remainPos.x, sy: remainPos.y };
    lastMid  = null;
    lastDist = null;
  }

  if (pointers.size === 0) {
    // All fingers lifted - flush final position to React state once
    flushTransform(transformRef.current);
    nodeDrag = null;
    panStart = null;
    lastMid  = null;
    lastDist = null;
  }
};

svg.addEventListener("pointerdown",   onDown, { passive: false });
svg.addEventListener("pointermove",   onMove, { passive: false });
svg.addEventListener("pointerup",     onUp,   { passive: false });
svg.addEventListener("pointercancel", onUp,   { passive: false });
return () => {
  svg.removeEventListener("pointerdown",   onDown);
  svg.removeEventListener("pointermove",   onMove);
  svg.removeEventListener("pointerup",     onUp);
  svg.removeEventListener("pointercancel", onUp);
};
```

}, []);

const edges = [];
if (tree.goal) {
const rp = pos[“ROOT”];
tree.nodes.filter(n => !n.parentId).forEach(n => {
const p = pos[n.id];
const nh = nodeHeight(n.note);
if (rp && p) edges.push({ id: “r-” + n.id, sx: rp.x, sy: rp.y + RH / 2, tx: p.x, ty: p.y - nh / 2 });
});
}
tree.nodes.forEach(n => {
if (!n.parentId) return;
const pp = pos[n.parentId], cp = pos[n.id];
const pNode = tree.nodes.find(x => x.id === n.parentId);
const pnh = nodeHeight(pNode ? pNode.title : “”, pNode ? pNode.note : “”);
const cnh = nodeHeight(n.note);
if (pp && cp) edges.push({ id: n.parentId + “-” + n.id, sx: pp.x, sy: pp.y + pnh / 2, tx: cp.x, ty: cp.y - cnh / 2 });
});

const process = useCallback(async val => {
val = val.trim(); if (!val) return;
if (val === “/clear”) {
setTree({ goal: “”, nodes: [] }); setPos({});
setLog([{ c: “s”, t: “- очищено -” }]); return;
}
if (val === “/mock”) {
const mock = {
goal: “ContentOS SaaS”, nodes: [
{ id: “n1”, title: “три потока”,       note: “Агентство, SaaS и цифровые продукты как три независимых источника дохода”,     type: “subgoal”,    confidence: “high”,   parentId: null },
{ id: “n2”, title: “агентство”,         note: “Быстрый кэшфлоу через клиентские проекты, фундамент для реинвестиций”,         type: “step”,       confidence: “high”,   parentId: “n1” },
{ id: “n3”, title: “SaaS масштаб”,      note: “Платформа ContentOS с подписной моделью, MRR растёт без линейных затрат”,      type: “step”,       confidence: “high”,   parentId: “n1” },
{ id: “n4”, title: “цифровые продукты”, note: “Шаблоны, курсы и ресурсы – пассивный доход через Gumroad и маркетплейсы”,     type: “step”,       confidence: “medium”, parentId: “n1” },
{ id: “n5”, title: “автопостинг”,       note: “Автоматическая публикация в Instagram через API Meta для роста аудитории”,     type: “idea”,       confidence: “medium”, parentId: “n3” },
{ id: “n6”, title: “риск алгоритмов”,   note: “Meta может ограничить API или снизить охват при автоматизированном постинге”,  type: “risk”,       confidence: “high”,   parentId: “n5” },
{ id: “n7”, title: “валидация”,          note: “Лендинг и waitlist для проверки спроса до начала разработки SaaS”,            type: “step”,       confidence: “high”,   parentId: “n3” },
{ id: “n8”, title: “Figma → Gumroad”,   note: “Продажа UI-китов как альтернатива при медленном росте основного SaaS”,        type: “alternative”,confidence: “medium”, parentId: “n4” }
]
};
setTree(mock); setPos({});
lg(“o”, “- mock “ + mock.nodes.length + “ nodes -”); return;
}
if (busy) return;
setBusy(true);
lg(“u”, “› “ + trunc(val, 60));
lg(“s”, “строю карту…”);
try {
const updated = await fetchMap(val, treeRef.current);
setTree(prev => {
const goal = updated.goal || prev.goal;
const ids  = new Set(prev.nodes.map(n => n.id));
const fresh = updated.nodes
.filter(n => !ids.has(n.id))
.map(n => ({ …n, title: n.title || generateTitle(n.note) }));
const merged = […prev.nodes, …fresh];
if (!goal && merged.length) return { goal: merged[0].title, nodes: merged };
return { goal, nodes: merged };
});
lg(“o”, “✓ готово”);
} catch (e) {
lg(“e”, “ERR: “ + e.message);
console.error(“Full error:”, e);
} finally {
setBusy(false);
}
}, [busy, lg]);

const send = () => { if (!input.trim() || busy) return; const v = input; setInput(””); process(v); };
const logColor = { s: “rgba(0,255,136,0.6)”, u: “#00ccee”, e: “#ff5566”, o: “#00ff88” };

return (
<div style={{ background: “#090909”, color: “#00ff88”, fontFamily: “‘Courier New’,monospace”, height: “100vh”, display: “flex”, flexDirection: “column”, overflow: “hidden” }}>
<div style={{ display: “flex”, alignItems: “center”, gap: 10, padding: “7px 14px”, borderBottom: “1px solid #1e4428”, flexShrink: 0 }}>
<span style={{ fontSize: 10, color: “rgba(0,255,136,0.55)”, letterSpacing: 4 }}>MIND MAP</span>
<span style={{ fontSize: 10, color: “#44aa66”, marginLeft: “auto” }}>{tree.nodes.length} nodes</span>
{busy && <span style={{ fontSize: 10, color: “#ffdd44”, animation: “blink 0.5s step-end infinite” }}>…</span>}
<button onClick={fit} style={{ background: “transparent”, border: “1px solid rgba(0,255,136,0.45)”, color: “rgba(0,255,136,0.85)”, fontFamily: “‘Courier New’,monospace”, fontSize: 9, padding: “2px 8px”, cursor: “pointer”, letterSpacing: 2 }}>FIT</button>
</div>

```
  <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
    <svg
      ref={svgRef}
      style={{ width: "100%", height: "100%", position: "absolute", inset: 0, cursor: "grab", touchAction: "none" }}
    >
      <defs>
        <marker id="arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill="rgba(0,220,100,0.45)" />
        </marker>
        <pattern id="dots" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
          <circle cx="14" cy="14" r="0.7" fill="#1a221a" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#dots)" />

      <g ref={gRef} style={{ transform: `translate(${transform.x}px,${transform.y}px) scale(${transform.scale})`, willChange: "transform", transformOrigin: "0 0" }}>
        {edges.map(e => {
          const my = (e.sy + e.ty) / 2;
          return <path key={e.id} d={`M${e.sx},${e.sy} C${e.sx},${my} ${e.tx},${my} ${e.tx},${e.ty}`}
            fill="none" stroke="rgba(0,220,100,0.35)" strokeWidth="1.5" markerEnd="url(#arr)" />;
        })}

        {tree.goal && pos["ROOT"] && (
          <g transform={`translate(${pos["ROOT"].x},${pos["ROOT"].y})`}
            style={{ cursor: "grab" }}
            data-nodeid="ROOT">
            <rect x={-RW / 2} y={-RH / 2} width={RW} height={RH} rx={7} fill="#002210" stroke="#00ff88" strokeWidth={1.5} />
            <text textAnchor="middle" dominantBaseline="middle" fill="#00ff88" fontSize={12} fontFamily="'Courier New',monospace" style={{ pointerEvents: "none" }}>
              {trunc(tree.goal, 28)}
            </text>
          </g>
        )}

        {tree.nodes.map(n => {
          const p = pos[n.id]; if (!p) return null;
          const fill       = TFILL[n.type]   || "#111";
          const stroke     = TSTROKE[n.type] || "#444";
          const color      = TCOLOR[n.type]  || "#aaa";
          const dash       = n.confidence === "low" ? "4 3" : undefined;
          const nh         = nodeHeight(n.title, n.note);
          const titleLines = wrapText(n.title || "", TITLE_MAX_CHARS);
          const noteLines  = wrapText(n.note  || "", NOTE_MAX_CHARS);
          const TOP        = -nh / 2;

          // Build Y positions top-to-bottom
          let curY = TOP + PAD_TOP + TITLE_LH * 0.82; // first title baseline

          return (
            <g key={n.id} transform={`translate(${p.x},${p.y})`}
              style={{ cursor: "grab" }}
              data-nodeid={n.id}>

              <rect x={-NW / 2} y={TOP} width={NW} height={nh} rx={6}
                fill={fill} stroke={stroke} strokeWidth={1.5}
                strokeDasharray={dash} opacity={n.confidence === "low" ? 0.72 : 1} />

              {/* Title -- wrapped, bold */}
              {titleLines.map((line, li) => (
                <text key={"t" + li}
                  x={-NW / 2 + 10} y={curY + li * TITLE_LH}
                  fill={color} fontSize={11} fontWeight="700"
                  fontFamily="'Courier New',monospace"
                  style={{ pointerEvents: "none" }}>
                  {line}
                </text>
              ))}

              {/* Divider */}
              {noteLines.length > 0 && (() => {
                const divY = TOP + PAD_TOP + titleLines.length * TITLE_LH + DIV_GAP;
                return (
                  <line x1={-NW / 2 + 10} y1={divY} x2={NW / 2 - 10} y2={divY}
                    stroke={stroke} strokeWidth={0.5} opacity={0.3} />
                );
              })()}

              {/* Note lines */}
              {noteLines.map((line, li) => {
                const divY   = TOP + PAD_TOP + titleLines.length * TITLE_LH + DIV_GAP + DIV_H;
                const noteY0 = divY + NOTE_GAP + NOTE_LH * 0.82;
                return (
                  <text key={"n" + li}
                    x={-NW / 2 + 10} y={noteY0 + li * NOTE_LH}
                    fill={color} fontSize={10} opacity={0.62}
                    fontFamily="'Courier New',monospace"
                    style={{ pointerEvents: "none" }}>
                    {line}
                  </text>
                );
              })}

              {/* Type badge */}
              <text textAnchor="start" x={-NW / 2 + 8} y={nh / 2 - 3}
                fill={stroke} fontSize={7} opacity={0.4} letterSpacing={1}
                fontFamily="'Courier New',monospace"
                style={{ pointerEvents: "none" }}>
                {n.type.toUpperCase()}
              </text>

              {/* Confidence dot */}
              <circle cx={NW / 2 - 10} cy={nh / 2 - 6} r={2.5}
                fill={n.confidence === "high" ? stroke : "none"}
                stroke={stroke} strokeWidth={1} opacity={0.45}
                style={{ pointerEvents: "none" }} />
            </g>
          );
        })}
      </g>
    </svg>

    <div style={{ position: "absolute", top: 10, right: 12, display: "flex", flexDirection: "column", gap: 4 }}>
      {Object.entries(TSTROKE).map(([t, c]) => (
        <div key={t} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9, opacity: 0.75, color: "#00ff88", letterSpacing: 1 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: TFILL[t], border: `1px solid ${c}`, flexShrink: 0 }} />
          {t.slice(0, 3)}
        </div>
      ))}
    </div>

    <div style={{ position: "absolute", bottom: 10, right: 12, display: "flex", flexDirection: "column", gap: 3 }}>
      {[["＋", 1.25], ["－", 0.8]].map(([lbl, f]) => (
        <button key={lbl} onClick={() => setTransform(t => ({ ...t, scale: Math.min(5, Math.max(0.05, t.scale * f)) }))}
          style={{ width: 26, height: 26, background: "#0a120a", border: "1px solid #1e4428", color: "rgba(0,255,136,0.8)", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {lbl}
        </button>
      ))}
    </div>
  </div>

  <div ref={logRef} style={{ borderTop: "1px solid #1e4428", background: "#060d06", maxHeight: "22vh", overflowY: "auto", padding: "5px 14px", flexShrink: 0 }}>
    {log.map((l, i) => (
      <div key={i} style={{ fontSize: 11, lineHeight: 1.6, color: logColor[l.c] || "#aaa" }}>{l.t}</div>
    ))}
  </div>

  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderTop: "1px solid #1e4428", background: "#060d06", flexShrink: 0 }}>
    <span style={{ color: "rgba(0,255,136,0.6)", fontSize: 14 }}>›</span>
    <input
      value={input}
      onChange={e => setInput(e.target.value)}
      onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
      placeholder="вставь текст или идею…"
      style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#00ff88", fontFamily: "'Courier New',monospace", fontSize: 13, caretColor: "#00ff88" }}
    />
    <button onClick={send} disabled={busy || !input.trim()}
      style={{ background: "transparent", border: "1px solid rgba(0,255,136,0.5)", color: busy ? "rgba(0,255,136,0.25)" : "rgba(0,255,136,0.9)", fontFamily: "'Courier New',monospace", fontSize: 10, padding: "4px 12px", cursor: busy ? "not-allowed" : "pointer", letterSpacing: 2, whiteSpace: "nowrap" }}>
      {busy ? "…" : "SEND"}
    </button>
  </div>

  <style>{"@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}"}</style>
</div>
```

);
}