import CLIENT_CONFIG from '../config.js';
import { useState, useEffect, useRef, useCallback } from "react";

// ─── Type colors ──────────────────────────────────────────────────────────────
const TFILL   = {idea:"#002a38",subgoal:"#00210f",step:"#181e18",risk:"#280010",alternative:"#160028"};
const TSTROKE = {idea:"#00d4ff",subgoal:"#00ff55",step:"#88bb88",risk:"#ff2255",alternative:"#bb66ff"};
const TCOLOR  = {idea:"#33eeff",subgoal:"#00ffaa",step:"#aaccaa",risk:"#ff4477",alternative:"#cc88ff"};

const NW = 180;
const RW = 210, RH = 52;
const TITLE_MAX_CHARS = 17;
const NOTE_MAX_CHARS  = 21;
const PAD_TOP  = 9;
const PAD_BOT  = 8;
const TITLE_LH = 16;
const DIV_GAP  = 5;
const DIV_H    = 1;
const NOTE_GAP = 6;
const NOTE_LH  = 13;
const BADGE_H  = 14;

// ─── Trending topics ──────────────────────────────────────────────────────────
const TRENDING = [
  { icon: "⚡", label: "AI Startup Strategy" },
  { icon: "🧠", label: "Content Creation System" },
  { icon: "📱", label: "Telegram Mini App Architecture" },
  { icon: "🎯", label: "Personal Brand Building" },
  { icon: "🔗", label: "Web3 & TON Ecosystem" },
  { icon: "🛹", label: "Skateboarding Business Model" },
  { icon: "📊", label: "Unit Economics for SaaS" },
  { icon: "🎨", label: "UI Design Portfolio Strategy" },
];

// ─── Helpers (unchanged) ──────────────────────────────────────────────────────
function wrapText(text, maxChars) {
  const words = (text || "").split(" ");
  let lines = [];
  let cur = "";
  for (const word of words) {
    const candidate = cur ? cur + " " + word : word;
    if (candidate.length <= maxChars) { cur = candidate; }
    else { if (cur) lines.push(cur); cur = word; }
  }
  if (cur) lines.push(cur);
  lines = lines.map(l => l.length > maxChars ? l.slice(0, maxChars) + "-" : l);
  return lines;
}

function nodeHeight(title, note) {
  const titleLines = Math.max(wrapText(title || "", TITLE_MAX_CHARS).length, 1);
  const noteLines  = note ? wrapText(note, NOTE_MAX_CHARS).length : 0;
  return (
    PAD_TOP +
    titleLines * TITLE_LH +
    (noteLines > 0 ? DIV_GAP + DIV_H + NOTE_GAP + noteLines * NOTE_LH : DIV_GAP) +
    BADGE_H +
    PAD_BOT
  );
}

function uid() { return "n" + (Date.now() % 1e9) + "_" + Math.floor(Math.random() * 999); }
function trunc(s, n) { return s && s.length > n ? s.slice(0, n) + "?" : s || ""; }

function fallback(input, existing) {
  const lines = input.split(/[.\n!?]/).map(l => l.trim()).filter(l => l.length > 2).slice(0, 8);
  const src = lines.length ? lines : [input.trim()];
  return {
    goal: input.slice(0, 50),
    nodes: src.map((l) => ({
      id: uid(), title: l.split(" ").slice(0, 3).join(" "),
      note: l, type: "idea", confidence: "medium", parentId: null
    }))
  };
}

function smartTitle(note) {
  if (!note) return "Идея";
  const stop = new Set(["я","мой","моя","мне","это","как","что","для","все","они","его","или","но","и","в","на","по","от","до"]);
  const words = (note || "").split(" ").filter(w => w.length > 2 && !stop.has(w.toLowerCase()));
  return words.slice(0, 3).join(" ") || note.split(" ").slice(0, 3).join(" ");
}

async function fetchMap(input, tree) {
  const ids  = tree.nodes.map(n => n.id);
  const maxN = ids.reduce((m, id) => {
    const n = parseInt(id.replace(/\D/g, ""), 10);
    return isNaN(n) ? m : Math.max(m, n);
  }, 0);
  const compact = {
    goal: tree.goal,
    nodes: tree.nodes.map(n => ({ id: n.id, title: n.title, note: n.note, type: n.type, parentId: n.parentId }))
  };

  const prompt1 =
    "Return ONLY raw JSON, no markdown, no backticks.\n" +
    'Schema: {"goal":"string","nodes":[{"id":"n1","note":"1-2 sentences","type":"idea|subgoal|step|risk|alternative","confidence":"high|medium|low","parentId":null}]}\n' +
    "Rules: Extract 4-10 distinct ideas. note=clear summary of this idea 1-2 sentences. " +
    "Type rules (STRICT): idea=main concept or opportunity (BLUE). subgoal=goal or desired outcome (GREEN). " +
    "step=concrete action to take (GRAY). risk=danger, problem, obstacle, threat - use this for ANYTHING negative (RED). " +
    "alternative=another option or approach (PURPLE). " +
    "When text mentions risk/риск/проблема/опасность/угроза/может упасть/может не работать - ALWAYS use type=risk. " +
    CLIENT_CONFIG.systemContext + " Keep existing nodes. New IDs from n" + (maxN+1) + ". parentId refs existing id or null. Same language as input.\n" +
    "Existing: " + JSON.stringify(compact) + "\nInput: " + input;

  const res1 = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 1600, messages: [{ role: "user", content: prompt1 }] })
  });

  const text1 = await res1.text();
  let data1;
  try { data1 = JSON.parse(text1); } catch(e) { return fallback(input, tree); }
  if (data1.error) throw new Error(data1.error.message || "API error");

  const raw1 = (data1.content?.[0]?.text) || "";
  const m1   = raw1.replace(/```json/gi,"").replace(/```/g,"").trim().match(/\{[\s\S]*\}/);
  if (!m1) return fallback(input, tree);

  let p;
  try { p = JSON.parse(m1[0]); } catch(e) { return fallback(input, tree); }

  const VT = ["idea","subgoal","step","risk","alternative"], VC = ["high","medium","low"];
  p.goal  = p.goal || tree.goal || input.slice(0,50) || "Map";
  p.nodes = (Array.isArray(p.nodes) ? p.nodes : []).map(n => ({
    id:         String(n.id || uid()),
    title:      "",
    note:       String(n.note || "").replace(/"/g,"'"),
    type:       VT.includes(n.type) ? n.type : "idea",
    confidence: VC.includes(n.confidence) ? n.confidence : "medium",
    parentId:   n.parentId || null
  }));

  const newNodes = p.nodes.filter(n => !tree.nodes.find(e => e.id === n.id));

  if (newNodes.length > 0) {
    const notesList = newNodes.map((n, i) => (i+1) + ". " + n.note).join("\n");
    const prompt2 =
      "For each numbered note, write a UNIQUE 2-3 word title. NEVER repeat a title that already exists in the map.\n" +
      "Rules:\n- The title must be a thematic label, like a newspaper headline or book chapter.\n" +
      "- NEVER use the first words of the note as the title.\n" +
      "- Think: what is the TOPIC of this note? Name the topic, not the content.\n" +
      "- Return ONLY a JSON array of strings, one per note, same order. No markdown.\n" +
      "- Same language as the notes.\n\n" +
      "Already used titles (DO NOT repeat): " + tree.nodes.filter(n => n.title).map(n => n.title).join(", ") + "\n\nNotes:\n" + notesList;

    try {
      const res2 = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 800, messages: [{ role: "user", content: prompt2 }] })
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
  }

  tree.nodes.forEach(old => {
    const found = p.nodes.find(n => n.id === old.id);
    if (found) found.title = old.title;
  });

  return p;
}

function smartAnchor(px, py, ph, cx, cy, ch) {
  const dx = cx - px, dy = cy - py;
  let sx, sy, tx, ty;
  if (Math.abs(dx) >= Math.abs(dy)) {
    sx = dx >= 0 ? px + NW/2 : px - NW/2; sy = py;
    tx = dx >= 0 ? cx - NW/2 : cx + NW/2; ty = cy;
  } else {
    sx = px; sy = dy >= 0 ? py + ph/2 : py - ph/2;
    tx = cx; ty = dy >= 0 ? cy - ch/2 : cy + ch/2;
  }
  return { sx, sy, tx, ty };
}

function computeLayout(tree, pos, W, H) {
  const next = { ...pos };
  const cx = W / 2, cy = H / 2;
  if (tree.goal && !next["ROOT"]) next["ROOT"] = { x: cx, y: cy - 80 };

  const childMap = {}, orphans = [];
  tree.nodes.forEach(n => {
    if (!n.parentId) orphans.push(n.id);
    else { if (!childMap[n.parentId]) childMap[n.parentId] = []; childMap[n.parentId].push(n.id); }
  });

  orphans.forEach((id, i) => {
    if (next[id]) return;
    const a = (i / Math.max(orphans.length, 1)) * Math.PI * 2 - Math.PI / 2;
    const r = Math.max(300, orphans.length * 60);
    next[id] = { x: cx + r * Math.cos(a), y: cy + 80 + r * 0.6 * Math.sin(a) };
  });

  let queue = [...orphans], visited = {}, depth = 1;
  orphans.forEach(id => { visited[id] = true; });
  while (queue.length) {
    const nq = [];
    queue.forEach(pid => {
      const kids = childMap[pid] || [];
      const pp = next[pid] || { x: cx, y: cy };
      const pNode = tree.nodes.find(n => n.id === pid);
      const pnh = nodeHeight(pNode ? pNode.title : "", pNode ? pNode.note : "");
      kids.forEach((kid, i) => {
        if (!next[kid]) next[kid] = { x: pp.x + (i - (kids.length - 1) / 2) * 240, y: pp.y + pnh / 2 + 110 + depth * 4 };
        if (!visited[kid]) { visited[kid] = true; nq.push(kid); }
      });
    });
    queue = nq; depth++;
  }
  return next;
}

// ─── Button style helper ──────────────────────────────────────────────────────
function mkBtn(C, disabled = false) {
  return {
    background: "transparent",
    border: `1px solid ${disabled ? C.accentFaint : C.borderBtn}`,
    color: disabled ? C.accentFaint : C.accentDim,
    fontFamily: "'Courier New',monospace",
    fontSize: 10,
    padding: "4px 10px",
    cursor: disabled ? "default" : "pointer",
    letterSpacing: 2,
    whiteSpace: "nowrap",
  };
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function MindMap() {

  // ── View & history ──────────────────────────────────────────────────────────
  const [view, setView]             = useState("home");
  const [homeInput, setHomeInput]   = useState("");
  const [mapHistory, setMapHistory] = useState([]);   // tree snapshots
  const [histIdx, setHistIdx]       = useState(-1);
  const histIdxRef                  = useRef(-1);
  useEffect(() => { histIdxRef.current = histIdx; }, [histIdx]);

  // ── Theme ───────────────────────────────────────────────────────────────────
  const [theme, setTheme] = useState("dark");
  const C = theme === "dark" ? {
    bg: "#090909", bgSub: "#060d06", border: "#1e4428", borderBtn: "rgba(0,255,136,0.5)",
    accent: "#00ff88", accentDim: "rgba(0,255,136,0.85)",
    accentFaint: "rgba(0,255,136,0.25)", text: "#00ff88",
    textDim: "rgba(0,255,136,0.55)", dots: "#1a221a", cardBg: "#0a120a",
  } : {
    bg: "#f0f7f0", bgSub: "#e4f0e4", border: "#5a9a6a", borderBtn: "rgba(0,80,30,0.5)",
    accent: "#006622", accentDim: "rgba(0,80,30,0.85)",
    accentFaint: "rgba(0,80,30,0.25)", text: "#004d18",
    textDim: "rgba(0,80,30,0.55)", dots: "#c0dcc0", cardBg: "#d8ecd8",
  };

  // ── Modals ──────────────────────────────────────────────────────────────────
  const [showReport, setShowReport]   = useState(false);
  const [reportText, setReportText]   = useState("");
  const [showRelated, setShowRelated] = useState(false);
  const [relatedLoad, setRelatedLoad] = useState(false);
  const [relatedList, setRelatedList] = useState([]);

  // ── Existing state ──────────────────────────────────────────────────────────
  const [tree, setTree]             = useState({ goal: "", nodes: [] });
  const [pos, setPos]               = useState({});
  const [log, setLog]               = useState([
    { c: "s", t: "MIND MAP -- введи текст внизу" },
    { c: "s", t: "/mock -- тест · /clear -- сброс" }
  ]);
  const [input, setInput]           = useState("");
  const [busy, setBusy]             = useState(false);
  const [transform, setTransform]   = useState({ x: 0, y: 0, scale: 1 });
  const [newNodeIds, setNewNodeIds] = useState(new Set());
  const [editMode, setEditMode]     = useState(false);
  const [editTarget, setEditTarget] = useState(null);

  // ── Refs ────────────────────────────────────────────────────────────────────
  const svgRef       = useRef(null);
  const gRef         = useRef(null);
  const logRef       = useRef(null);
  const treeRef      = useRef(tree);
  const posRef       = useRef({});
  const transformRef = useRef({ x: 0, y: 0, scale: 1 });
  const editModeRef  = useRef(false);
  useEffect(() => { treeRef.current = tree; }, [tree]);
  useEffect(() => { posRef.current = pos; }, [pos]);
  useEffect(() => { editModeRef.current = editMode; }, [editMode]);

  const applyTransform = (t) => {
    transformRef.current = t;
    if (gRef.current)
      gRef.current.style.transform = `translate(${t.x}px,${t.y}px) scale(${t.scale})`;
  };
  const flushTransform = (t) => { applyTransform(t); setTransform(t); };

  const lg = useCallback((c, t) => {
    setLog(l => { const n = [...l, { c, t }]; return n.length > 80 ? n.slice(-80) : n; });
    setTimeout(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, 30);
  }, []);

  // ── Layout effect ───────────────────────────────────────────────────────────
  useEffect(() => {
    const svg = svgRef.current; if (!svg) return;
    const { width: W, height: H } = svg.getBoundingClientRect();
    const w = W || 600, h = H || 400;
    let newTransform = null;
    setPos(prev => {
      const next = computeLayout(tree, prev, w, h);
      const pts = Object.values(next);
      if (pts.length) {
        const pad = 110;
        const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
        const x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad;
        const y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad;
        const sc = Math.min(w / (x1 - x0), h / (y1 - y0), 1.4, 2);
        newTransform = { x: w/2 - sc*(x0+x1)/2, y: h/2 - sc*(y0+y1)/2, scale: sc };
      }
      return next;
    });
    if (newTransform) flushTransform(newTransform);
  }, [tree]);

  const fit = useCallback(() => {
    const svg = svgRef.current; if (!svg) return;
    const { width: W, height: H } = svg.getBoundingClientRect();
    setPos(prev => {
      const pts = Object.values(prev); if (!pts.length) return prev;
      const pad = 110;
      const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
      const x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad;
      const y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad;
      const sc = Math.min(W/(x1-x0), H/(y1-y0), 1.4, 2);
      flushTransform({ x: W/2-sc*(x0+x1)/2, y: H/2-sc*(y0+y1)/2, scale: sc });
      return prev;
    });
  }, []);

  // ── Wheel zoom — re-attach when view changes ────────────────────────────────
  useEffect(() => {
    const svg = svgRef.current; if (!svg) return;
    const onWheel = e => {
      e.preventDefault();
      const t = transformRef.current, f = e.deltaY < 0 ? 1.1 : 0.91;
      const rect = svg.getBoundingClientRect();
      const px = e.clientX - rect.left, py = e.clientY - rect.top;
      const ns = Math.min(5, Math.max(0.05, t.scale * f));
      const sf = ns / t.scale;
      applyTransform({ scale: ns, x: px - sf*(px-t.x), y: py - sf*(py-t.y) });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [view]);

  // ── Pointer events — re-attach when view changes ────────────────────────────
  useEffect(() => {
    const svg = svgRef.current; if (!svg) return;
    const pointers = new Map();
    const midpoint = () => { const p=[...pointers.values()]; return {x:(p[0].x+p[1].x)/2,y:(p[0].y+p[1].y)/2}; };
    const pinchDist = () => { const p=[...pointers.values()]; const dx=p[0].x-p[1].x,dy=p[0].y-p[1].y; return Math.sqrt(dx*dx+dy*dy); };
    let lastMid=null, lastDist=null, panStart=null, nodeDrag=null;

    const onDown = e => {
      e.preventDefault(); svg.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        let el = e.target;
        while (el && el !== svg) {
          if (el.dataset?.nodeid) {
            const nid = el.dataset.nodeid;
            if (editModeRef.current) {
              const rect = svg.getBoundingClientRect();
              setEditTarget({ id: nid, x: e.clientX-rect.left, y: e.clientY-rect.top }); return;
            }
            const p = posRef.current[nid] || { x: 0, y: 0 };
            nodeDrag = { id: nid, ox: p.x, oy: p.y, sx: e.clientX, sy: e.clientY }; return;
          }
          el = el.parentElement;
        }
        if (editModeRef.current) { setEditTarget(null); return; }
        const t = transformRef.current;
        panStart = { ox: t.x, oy: t.y, sx: e.clientX, sy: e.clientY };
        lastMid = null; lastDist = null;
      } else if (pointers.size === 2) {
        nodeDrag = null; panStart = null; lastMid = midpoint(); lastDist = pinchDist();
      }
    };
    const onMove = e => {
      if (!pointers.has(e.pointerId)) return; e.preventDefault();
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size===1 && nodeDrag) {
        const d = nodeDrag;
        setPos(p => ({...p, [d.id]: {x: d.ox+(e.clientX-d.sx), y: d.oy+(e.clientY-d.sy)}}));
      } else if (pointers.size===1 && panStart) {
        applyTransform({...transformRef.current, x: panStart.ox+(e.clientX-panStart.sx), y: panStart.oy+(e.clientY-panStart.sy)});
      } else if (pointers.size===2 && lastMid && lastDist) {
        const t=transformRef.current, m=midpoint(), d=pinchDist(), rect=svg.getBoundingClientRect();
        const px=m.x-rect.left, py=m.y-rect.top, ratio=d/lastDist;
        const ns=Math.min(5,Math.max(0.05,t.scale*ratio)), sf=ns/t.scale;
        applyTransform({ scale:ns, x:px-sf*(px-t.x)+(m.x-lastMid.x), y:py-sf*(py-t.y)+(m.y-lastMid.y) });
        lastMid=m; lastDist=d;
      }
    };
    const onUp = e => {
      e.preventDefault(); pointers.delete(e.pointerId);
      if (pointers.size===1) {
        const [,rp]=[...pointers.entries()][0];
        const t=transformRef.current;
        panStart={ox:t.x,oy:t.y,sx:rp.x,sy:rp.y}; lastMid=null; lastDist=null;
      }
      if (pointers.size===0) { flushTransform(transformRef.current); nodeDrag=null; panStart=null; lastMid=null; lastDist=null; }
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
  }, [view]);

  // ── Process (AI generation + history) ──────────────────────────────────────
  const process = useCallback(async val => {
    val = val.trim(); if (!val) return;

    if (val === "/clear") {
      setTree({ goal: "", nodes: [] }); setPos({});
      setMapHistory([]); setHistIdx(-1); histIdxRef.current = -1;
      setLog([{ c: "s", t: "- очищено -" }]); return;
    }
    if (val === "/mock") {
      const mock = {
        goal: "ContentOS SaaS", nodes: [
          { id:"n1", title:"three streams",   note:"Agency, SaaS and digital products as three independent revenue streams",     type:"subgoal",     confidence:"high",   parentId:null },
          { id:"n2", title:"agency",           note:"Fast cashflow through client projects, foundation for reinvestment",         type:"step",        confidence:"high",   parentId:"n1" },
          { id:"n3", title:"SaaS scale",       note:"ContentOS platform with subscription model, MRR grows without linear costs",type:"step",        confidence:"high",   parentId:"n1" },
          { id:"n4", title:"digital products", note:"Templates, courses and resources -- passive income via Gumroad",            type:"step",        confidence:"medium", parentId:"n1" },
          { id:"n5", title:"autoposting",      note:"Automatic Instagram publishing via Meta API for audience growth",           type:"idea",        confidence:"medium", parentId:"n3" },
          { id:"n6", title:"algo risk",        note:"Meta may restrict API or reduce reach with automated posting",              type:"risk",        confidence:"high",   parentId:"n5" },
          { id:"n7", title:"validation",       note:"Landing page and waitlist to validate demand before SaaS development",      type:"step",        confidence:"high",   parentId:"n3" },
          { id:"n8", title:"Figma → Gumroad", note:"Selling UI kits as alternative when main SaaS grows slowly",               type:"alternative", confidence:"medium", parentId:"n4" }
        ]
      };
      setTree(mock); setPos({});
      setMapHistory([mock]); setHistIdx(0); histIdxRef.current = 0;
      lg("o", "- mock " + mock.nodes.length + " nodes -"); return;
    }
    if (busy) return;
    setBusy(true);
    lg("u", "▸ " + trunc(val, 60));
    lg("b", "строю карту…");
    try {
      const updated = await fetchMap(val, treeRef.current);
      const prevIds = new Set(treeRef.current.nodes.map(n => n.id));
      const fresh   = updated.nodes
        .filter(n => !prevIds.has(n.id))
        .map(n => ({ ...n, title: n.title || smartTitle(n.note) }));

      // Compute merged tree deterministically (same logic as setState callback)
      const baseNodes = treeRef.current.nodes;
      const goal      = updated.goal || treeRef.current.goal;
      const ids       = new Set(baseNodes.map(n => n.id));
      const freshFiltered = fresh.filter(n => !ids.has(n.id));
      const merged    = [...baseNodes, ...freshFiltered];
      const savedTree = !goal && merged.length
        ? { goal: merged[0].title, nodes: merged }
        : { goal, nodes: merged };

      setTree(savedTree);

      // Push snapshot to history, cut forward states
      setMapHistory(prev => {
        const cut = prev.slice(0, histIdxRef.current + 1);
        return [...cut, savedTree];
      });
      setHistIdx(prev => {
        const newIdx = prev + 1;
        histIdxRef.current = newIdx;
        return newIdx;
      });

      // Animate new nodes
      const freshIds = fresh.map(n => n.id);
      if (freshIds.length > 0) {
        setNewNodeIds(new Set(freshIds));
        setTimeout(() => setNewNodeIds(new Set()), 600);
      }

      setLog(l => l.filter(item => item.c !== "b"));
      lg("o", "✓ готово");
    } catch (e) {
      lg("e", "ERR: " + e.message);
      console.error("Full error:", e);
    } finally {
      setBusy(false);
    }
  }, [busy, lg]);

  // ── History navigation ───────────────────────────────────────────────────────
  const navBack = useCallback(() => {
    if (histIdxRef.current <= 0) return;
    const newIdx = histIdxRef.current - 1;
    setTree(mapHistory[newIdx]);
    setPos({});
    setHistIdx(newIdx);
    histIdxRef.current = newIdx;
  }, [mapHistory]);

  const navForward = useCallback(() => {
    if (histIdxRef.current >= mapHistory.length - 1) return;
    const newIdx = histIdxRef.current + 1;
    setTree(mapHistory[newIdx]);
    setPos({});
    setHistIdx(newIdx);
    histIdxRef.current = newIdx;
  }, [mapHistory]);

  // ── Save ────────────────────────────────────────────────────────────────────
  const saveMap = useCallback(async () => {
    if (!tree.nodes.length) return;
    try {
      const res  = await fetch("/api/save", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tree, pos })
      });
      const data = await res.json();
      const url  = window.location.origin + "/view/" + data.slug;
      lg("o", "✓ сохранено: /view/" + data.slug);
      try { await navigator.clipboard.writeText(url); } catch(e) {}
    } catch(e) { lg("e", "ERR save: " + e.message); }
  }, [tree, pos, lg]);

  // ── Export SVG ──────────────────────────────────────────────────────────────
  const exportSVG = useCallback(() => {
    const svg = svgRef.current; if (!svg) return;
    const str  = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([str], { type: "image/svg+xml" });
    const a    = document.createElement("a");
    a.href     = URL.createObjectURL(blob);
    a.download = (tree.goal || "mindmap").replace(/\s+/g, "_") + ".svg";
    a.click();
    URL.revokeObjectURL(a.href);
  }, [tree.goal]);

  // ── Related topics ──────────────────────────────────────────────────────────
  const fetchRelated = useCallback(async () => {
    if (!tree.goal) return;
    setShowRelated(true); setRelatedLoad(true); setRelatedList([]);
    try {
      const prompt = `Given the mind map topic "${tree.goal}", suggest 7 related topics the user might explore next. Return ONLY a JSON array of short strings (max 6 words each). Same language as topic.`;
      const res = await fetch("/api/ai", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 300, messages: [{ role: "user", content: prompt }] })
      });
      const data = await res.json();
      const raw  = (data.content?.[0]?.text || "").replace(/```json|```/g,"").trim();
      const arr  = JSON.parse(raw.match(/\[[\s\S]*\]/)?.[0] || "[]");
      setRelatedList(arr.slice(0, 7));
    } catch(e) {}
    setRelatedLoad(false);
  }, [tree.goal]);

  // ── Start session from home ─────────────────────────────────────────────────
  const startSession = useCallback((val) => {
    setView("map");
    setTimeout(() => process(val), 80);
  }, [process]);

  // ── Edges ───────────────────────────────────────────────────────────────────
  const edges = [];
  if (tree.goal) {
    const rp = pos["ROOT"];
    tree.nodes.filter(n => !n.parentId).forEach(n => {
      const p = pos[n.id], nh = nodeHeight(n.title, n.note);
      if (rp && p) { const a = smartAnchor(rp.x,rp.y,RH,p.x,p.y,nh); edges.push({ id:"r-"+n.id, ...a }); }
    });
  }
  tree.nodes.forEach(n => {
    if (!n.parentId) return;
    const pp=pos[n.parentId], cp=pos[n.id];
    const pNode=tree.nodes.find(x=>x.id===n.parentId);
    const pnh=nodeHeight(pNode?.title,pNode?.note), cnh=nodeHeight(n.title,n.note);
    if (pp && cp) { const a=smartAnchor(pp.x,pp.y,pnh,cp.x,cp.y,cnh); edges.push({ id:n.parentId+"-"+n.id, ...a }); }
  });

  const logColor   = { b:"#ffdd44", s:"rgba(0,255,136,0.6)", u:"#00ccee", e:"#ff5566", o:"#00ff88" };
  const editBtnSt  = { background:C.cardBg, border:`1px solid ${C.border}`, color:C.accentDim, fontFamily:"'Courier New',monospace", fontSize:10, padding:"3px 8px", cursor:"pointer", letterSpacing:1, borderRadius:3 };
  const canBack    = histIdx > 0;
  const canForward = histIdx < mapHistory.length - 1;

  // ══════════════════════════════════════════════════════════════════════════════
  // HOME SCREEN
  // ══════════════════════════════════════════════════════════════════════════════
  if (view === "home") {
    return (
      <div style={{ background:C.bg, color:C.text, fontFamily:"'Courier New',monospace", height:"100dvh", display:"flex", flexDirection:"column", overflow:"hidden" }}>

        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 14px", borderBottom:`1px solid ${C.border}`, flexShrink:0 }}>
          <span style={{ fontSize:10, color:C.textDim, letterSpacing:4 }}>{CLIENT_CONFIG.appTitle}</span>
          <button onClick={() => setTheme(t => t==="dark"?"light":"dark")} style={mkBtn(C)}>
            {theme === "dark" ? "☀ LIGHT" : "☾ DARK"}
          </button>
        </div>

        <div style={{ flex:1, overflowY:"auto", padding:"24px 16px 24px" }}>

          {/* Hero */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize:22, fontWeight:700, letterSpacing:2, lineHeight:1.2, marginBottom:4 }}>
              MIND MAP
            </div>
            <div style={{ fontSize:9, color:C.textDim, letterSpacing:4 }}>
              STRUCTURED THINKING ENGINE
            </div>
          </div>

          {/* Search input */}
          <div style={{ display:"flex", gap:8, marginBottom:36 }}>
            <input
              value={homeInput}
              onChange={e => setHomeInput(e.target.value)}
              onKeyDown={e => { if (e.key==="Enter" && homeInput.trim()) startSession(homeInput); }}
              placeholder={CLIENT_CONFIG.placeholder}
              autoFocus
              style={{
                flex:1, background:C.cardBg, border:`1px solid ${C.border}`,
                color:C.text, fontFamily:"'Courier New',monospace", fontSize:13,
                padding:"11px 12px", outline:"none",
              }}
            />
            <button
              onClick={() => { if (homeInput.trim()) startSession(homeInput); }}
              style={{
                background:"transparent", border:`1px solid ${C.accentDim}`,
                color:C.accent, fontFamily:"'Courier New',monospace",
                fontSize:18, padding:"0 18px", cursor:"pointer",
              }}>
              →
            </button>
          </div>

          {/* Trending */}
          <div style={{ fontSize:9, color:C.textDim, letterSpacing:4, marginBottom:12 }}>🔥 TRENDING</div>
          {TRENDING.map((t, i) => (
            <button key={i}
              onClick={() => startSession(t.label)}
              style={{
                display:"flex", alignItems:"center", justifyContent:"space-between",
                width:"100%", padding:"13px 0", background:"none", border:"none",
                borderBottom:`1px solid ${C.border}`, cursor:"pointer",
                color:C.text, fontSize:12, fontFamily:"'Courier New',monospace", textAlign:"left",
              }}>
              <span>{t.icon}&nbsp;&nbsp;{t.label}</span>
              <span style={{ color:C.accentDim, fontSize:16 }}>→</span>
            </button>
          ))}
        </div>

        <style>{`*{box-sizing:border-box;} input::placeholder{color:${C.textDim};}`}</style>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // MAP SCREEN
  // ══════════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ background:C.bg, color:C.text, fontFamily:"'Courier New',monospace", height:"100dvh", display:"flex", flexDirection:"column", overflow:"hidden" }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 14px", borderBottom:`1px solid ${C.border}`, flexShrink:0 }}>
        {/* Back to home */}
        <button onClick={() => setView("home")}
          style={{ background:"transparent", border:"none", color:C.accentDim, fontSize:20, cursor:"pointer", padding:"0 2px", lineHeight:1 }}>
          ←
        </button>
        <span style={{ fontSize:10, color:C.textDim, letterSpacing:4 }}>{CLIENT_CONFIG.appTitle}</span>
        <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:7, flexWrap:"wrap" }}>
          <span style={{ fontSize:10, color:"#44aa66" }}>{tree.nodes.length} nodes</span>
          <button onClick={exportSVG}                           style={mkBtn(C)}>↓ SVG</button>
          <button onClick={() => setTheme(t => t==="dark"?"light":"dark")} style={mkBtn(C)}>{theme==="dark"?"☀":"☾"}</button>
          <button onClick={() => setShowReport(true)}           style={mkBtn(C)}>⚠</button>
          <button onClick={() => setEditMode(m => !m)}
            style={{ ...mkBtn(C), border: editMode ? `1px solid ${C.accent}` : `1px solid ${C.borderBtn}`, color: editMode ? C.accent : C.accentDim }}>
            EDIT
          </button>
          <button onClick={saveMap} disabled={!tree.nodes.length} style={mkBtn(C, !tree.nodes.length)}>SAVE</button>
        </div>
      </div>

      {/* ── SVG canvas ──────────────────────────────────────────────────────── */}
      <div style={{ flex:1, overflow:"hidden", position:"relative" }}>
        <svg
          ref={svgRef}
          style={{ width:"100%", height:"100%", position:"absolute", inset:0, cursor:editMode?"crosshair":"grab", touchAction:"none" }}
        >
          <defs>
            <marker id="arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill="rgba(0,220,100,0.45)" />
            </marker>
            <pattern id="dots" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
              <circle cx="14" cy="14" r="0.7" fill={C.dots} />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#dots)" />

          <g ref={gRef} style={{ transform:`translate(${transform.x}px,${transform.y}px) scale(${transform.scale})`, willChange:"transform", transformOrigin:"0 0" }}>

            {edges.map(e => {
              const isH = Math.abs(e.tx-e.sx) >= Math.abs(e.ty-e.sy);
              const mx=(e.sx+e.tx)/2, my=(e.sy+e.ty)/2;
              const d = isH
                ? `M${e.sx},${e.sy} C${mx},${e.sy} ${mx},${e.ty} ${e.tx},${e.ty}`
                : `M${e.sx},${e.sy} C${e.sx},${my} ${e.tx},${my} ${e.tx},${e.ty}`;
              return <path key={e.id} d={d} fill="none" stroke="rgba(0,220,100,0.35)" strokeWidth="1.5" markerEnd="url(#arr)" />;
            })}

            {tree.goal && pos["ROOT"] && (
              <g transform={`translate(${pos["ROOT"].x},${pos["ROOT"].y})`} style={{ cursor:"grab" }} data-nodeid="ROOT">
                <rect x={-RW/2} y={-RH/2} width={RW} height={RH} rx={7} fill={C.cardBg} stroke={C.accent} strokeWidth={1.5} />
                <text textAnchor="middle" dominantBaseline="middle" fill={C.accent} fontSize={12} fontFamily="'Courier New',monospace" style={{ pointerEvents:"none" }}>
                  {trunc(tree.goal, 28)}
                </text>
              </g>
            )}

            {tree.nodes.map(n => {
              const p = pos[n.id]; if (!p) return null;
              const fill=TFILL[n.type]||"#111", stroke=TSTROKE[n.type]||"#444", color=TCOLOR[n.type]||"#aaa";
              const dash = n.confidence==="low" ? "4 3" : undefined;
              const nh   = nodeHeight(n.title, n.note);
              const titleLines = wrapText(n.title||"", TITLE_MAX_CHARS);
              const noteLines  = wrapText(n.note||"",  NOTE_MAX_CHARS);
              const TOP  = -nh/2;
              const isNew = newNodeIds.has(n.id);

              return (
                <g key={n.id} transform={`translate(${p.x},${p.y})`}
                  style={{ cursor:editMode?"pointer":"grab", ...(isNew?{animation:"nodeIn 0.3s ease-out"}:{}) }}
                  data-nodeid={n.id}>
                  <rect x={-NW/2} y={TOP} width={NW} height={nh} rx={6}
                    fill={fill} stroke={editMode?"rgba(0,255,136,0.6)":stroke}
                    strokeWidth={editMode?2:1.5} strokeDasharray={dash}
                    opacity={n.confidence==="low"?0.72:1} />
                  {titleLines.map((line, li) => (
                    <text key={"t"+li} x={-NW/2+10} y={TOP+PAD_TOP+TITLE_LH*0.82+li*TITLE_LH}
                      fill={color} fontSize={11} fontWeight="700"
                      fontFamily="'Courier New',monospace" style={{ pointerEvents:"none" }}>
                      {line}
                    </text>
                  ))}
                  {noteLines.length > 0 && (
                    <line
                      x1={-NW/2+10} y1={TOP+PAD_TOP+titleLines.length*TITLE_LH+DIV_GAP}
                      x2={NW/2-10}  y2={TOP+PAD_TOP+titleLines.length*TITLE_LH+DIV_GAP}
                      stroke={stroke} strokeWidth={0.5} opacity={0.3} />
                  )}
                  {noteLines.map((line, li) => {
                    const divY  = TOP+PAD_TOP+titleLines.length*TITLE_LH+DIV_GAP+DIV_H;
                    const noteY = divY+NOTE_GAP+NOTE_LH*0.82;
                    return (
                      <text key={"n"+li} x={-NW/2+10} y={noteY+li*NOTE_LH}
                        fill={color} fontSize={10} opacity={0.62}
                        fontFamily="'Courier New',monospace" style={{ pointerEvents:"none" }}>
                        {line}
                      </text>
                    );
                  })}
                  <text textAnchor="start" x={-NW/2+8} y={nh/2-3}
                    fill={stroke} fontSize={7} opacity={0.4} letterSpacing={1}
                    fontFamily="'Courier New',monospace" style={{ pointerEvents:"none" }}>
                    {n.type.toUpperCase()}
                  </text>
                  <circle cx={NW/2-10} cy={nh/2-6} r={2.5}
                    fill={n.confidence==="high"?stroke:"none"} stroke={stroke}
                    strokeWidth={1} opacity={0.45} style={{ pointerEvents:"none" }} />
                </g>
              );
            })}
          </g>
        </svg>

        {/* Edit menu */}
        {editTarget && (
          <div style={{
            position:"absolute",
            left:Math.min(editTarget.x,(svgRef.current?.clientWidth||400)-160),
            top:Math.min(editTarget.y,(svgRef.current?.clientHeight||300)-60),
            background:C.cardBg, border:`1px solid ${C.border}`, borderRadius:6,
            padding:"6px 8px", display:"flex", gap:6, zIndex:100, boxShadow:"0 4px 16px rgba(0,0,0,0.8)"
          }}>
            <button onClick={() => {
              const node = treeRef.current.nodes.find(n => n.id===editTarget.id);
              if (node) {
                setTree(prev => ({ ...prev, nodes: prev.nodes.filter(n=>n.id!==editTarget.id).map(n=>n.parentId===editTarget.id?{...n,parentId:node.parentId}:n) }));
                setPos(prev => { const p={...prev}; delete p[editTarget.id]; return p; });
              }
              setEditTarget(null);
            }} style={editBtnSt}>DEL</button>
            <button onClick={() => {
              const node = treeRef.current.nodes.find(n => n.id===editTarget.id);
              const newNote = prompt("Редактировать:", node?.note || "");
              if (newNote !== null) setTree(prev => ({ ...prev, nodes: prev.nodes.map(n=>n.id===editTarget.id?{...n,note:newNote}:n) }));
              setEditTarget(null);
            }} style={editBtnSt}>NOTE</button>
            <button onClick={() => setEditTarget(null)} style={editBtnSt}>✕</button>
          </div>
        )}

        {/* Legend */}
        <div style={{ position:"absolute", top:10, right:12, display:"flex", flexDirection:"column", gap:4 }}>
          {Object.entries(TSTROKE).map(([t, c]) => (
            <div key={t} style={{ display:"flex", alignItems:"center", gap:5, fontSize:9, opacity:0.75, color:C.text, letterSpacing:1 }}>
              <div style={{ width:8, height:8, borderRadius:2, background:TFILL[t], border:`1px solid ${c}`, flexShrink:0 }} />
              {t.slice(0,3)}
            </div>
          ))}
        </div>

        {/* Zoom panel */}
        <div style={{ position:"absolute", bottom:10, right:12, display:"flex", flexDirection:"column", gap:3 }}>
          {[["\uFF0B", 1.25], ["\uFF0D", 0.8]].map(([lbl, f]) => (
            <button key={lbl}
              onClick={() => { const t=transformRef.current; const ns=Math.min(5,Math.max(0.05,t.scale*f)); const s={...t,scale:ns}; applyTransform(s); setTransform(s); }}
              style={{ width:26, height:26, background:C.cardBg, border:`1px solid ${C.border}`, color:C.accentDim, fontSize:14, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
              {lbl}
            </button>
          ))}
          <button onClick={fit}
            style={{ width:26, height:26, background:C.cardBg, border:`1px solid ${C.border}`, color:C.accentDim, fontFamily:"'Courier New',monospace", fontSize:7, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", letterSpacing:1 }}>
            FIT
          </button>
        </div>

        {/* Related button */}
        <button onClick={fetchRelated}
          style={{ position:"absolute", bottom:10, left:12, ...mkBtn(C), fontSize:9, letterSpacing:2, padding:"5px 12px" }}>
          RELATED →
        </button>
      </div>

      {/* ── Log ─────────────────────────────────────────────────────────────── */}
      <div ref={logRef} style={{ borderTop:`1px solid ${C.border}`, background:C.bgSub, maxHeight:"18vh", overflowY:"auto", padding:"5px 14px", flexShrink:0 }}>
        {log.map((l, i) => (
          <div key={i} style={{ fontSize:11, lineHeight:1.6, color:logColor[l.c]||"#aaa" }}>
            {l.t}{l.c==="b" && <span style={{ animation:"blink 0.5s step-end infinite" }}> ...</span>}
          </div>
        ))}
      </div>

      {/* ── Input bar ───────────────────────────────────────────────────────── */}
      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 14px calc(8px + env(safe-area-inset-bottom)) 14px", borderTop:`1px solid ${C.border}`, background:C.bgSub, flexShrink:0 }}>
        {/* History navigation */}
        <button onClick={navBack} disabled={!canBack}
          style={{ background:"transparent", border:"none", color:canBack?C.accentDim:C.accentFaint, fontSize:18, cursor:canBack?"pointer":"default", padding:"0 2px", lineHeight:1 }}>
          ←
        </button>
        <button onClick={navForward} disabled={!canForward}
          style={{ background:"transparent", border:"none", color:canForward?C.accentDim:C.accentFaint, fontSize:18, cursor:canForward?"pointer":"default", padding:"0 2px", lineHeight:1 }}>
          →
        </button>

        <span style={{ color:C.accentDim, fontSize:14, flexShrink:0 }}>▸</span>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key==="Enter" && !e.shiftKey) { e.preventDefault(); if (!input.trim()||busy) return; const v=input; setInput(""); process(v); } }}
          placeholder="ask follow-up…"
          style={{ flex:1, background:"transparent", border:"none", outline:"none", color:C.text, fontFamily:"'Courier New',monospace", fontSize:13, caretColor:C.accent }}
        />
        <button
          onClick={() => { if (!input.trim()||busy) return; const v=input; setInput(""); process(v); }}
          disabled={busy||!input.trim()}
          style={mkBtn(C, busy||!input.trim())}>
          {busy ? "…" : "SEND"}
        </button>
      </div>

      {/* ══ RELATED PANEL ═══════════════════════════════════════════════════════ */}
      {showRelated && (
        <div style={{ position:"fixed", inset:0, zIndex:200, background:"rgba(0,0,0,0.65)", display:"flex", alignItems:"flex-end" }}
          onClick={e => { if (e.target===e.currentTarget) setShowRelated(false); }}>
          <div style={{ width:"100%", background:C.bg, border:`1px solid ${C.border}`, borderRadius:"14px 14px 0 0", padding:"20px 16px calc(24px + env(safe-area-inset-bottom))", maxHeight:"65vh", overflowY:"auto" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
              <span style={{ fontSize:9, letterSpacing:4, color:C.textDim }}>RELATED TOPICS</span>
              <button onClick={() => setShowRelated(false)} style={{ background:"none", border:"none", color:C.accentDim, fontSize:20, cursor:"pointer", lineHeight:1 }}>✕</button>
            </div>
            {relatedLoad && (
              <div style={{ fontSize:11, color:C.textDim }}>
                <span style={{ animation:"blink 0.5s step-end infinite" }}>generating…</span>
              </div>
            )}
            {relatedList.map((topic, i) => (
              <button key={i}
                onClick={() => { setShowRelated(false); setTimeout(() => process(topic), 50); }}
                style={{ display:"flex", alignItems:"center", justifyContent:"space-between", width:"100%", padding:"13px 0", background:"none", border:"none", borderBottom:`1px solid ${C.border}`, cursor:"pointer", color:C.text, fontSize:12, fontFamily:"'Courier New',monospace", textAlign:"left" }}>
                <span>{topic}</span>
                <span style={{ color:C.accentDim, fontSize:16 }}>→</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ══ REPORT MODAL ════════════════════════════════════════════════════════ */}
      {showReport && (
        <div style={{ position:"fixed", inset:0, zIndex:200, background:"rgba(0,0,0,0.65)", display:"flex", alignItems:"flex-end" }}
          onClick={e => { if (e.target===e.currentTarget) setShowReport(false); }}>
          <div style={{ width:"100%", background:C.bg, border:`1px solid ${C.border}`, borderRadius:"14px 14px 0 0", padding:"24px 16px calc(28px + env(safe-area-inset-bottom))" }}>
            <div style={{ fontSize:13, fontWeight:700, letterSpacing:2, marginBottom:6, color:C.accent }}>MIND MAP ISSUE?</div>
            <div style={{ fontSize:11, color:C.textDim, marginBottom:16, letterSpacing:1 }}>Describe what went wrong and we'll look into it.</div>
            <textarea
              value={reportText}
              onChange={e => setReportText(e.target.value)}
              placeholder="Describe the issue…"
              rows={4}
              style={{ width:"100%", background:C.cardBg, border:`1px solid ${C.border}`, color:C.text, fontFamily:"'Courier New',monospace", fontSize:12, padding:"10px 12px", outline:"none", resize:"none", boxSizing:"border-box" }}
            />
            <div style={{ display:"flex", gap:10, marginTop:14 }}>
              <button onClick={() => setShowReport(false)}
                style={{ flex:1, ...mkBtn(C), padding:"11px 0", textAlign:"center" }}>
                CANCEL
              </button>
              <button onClick={() => { setShowReport(false); setReportText(""); lg("o","✓ report sent"); }}
                style={{ flex:1, background:"transparent", border:`1px solid ${C.accent}`, color:C.accent, fontFamily:"'Courier New',monospace", fontSize:10, padding:"11px 0", cursor:"pointer", letterSpacing:2 }}>
                SUBMIT
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes nodeIn { from{opacity:0;transform:scale(0.6)} to{opacity:1;transform:scale(1)} }
        * { box-sizing: border-box; }
        input::placeholder, textarea::placeholder { color: ${C.textDim}; }
      `}</style>
    </div>
  );
}