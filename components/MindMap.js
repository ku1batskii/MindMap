import CLIENT_CONFIG from '../config.js';
import { useState, useEffect, useRef, useCallback } from "react";

// ─── Node colors — theme-aware ────────────────────────────────────────────────
const DARK_STYLE = {
  idea:        { fill:"#002a38", stroke:"#00d4ff", color:"#33eeff" },
  subgoal:     { fill:"#00210f", stroke:"#00ff55", color:"#00ffaa" },
  step:        { fill:"#181e18", stroke:"#88bb88", color:"#aaccaa" },
  risk:        { fill:"#280010", stroke:"#ff2255", color:"#ff4477" },
  alternative: { fill:"#160028", stroke:"#bb66ff", color:"#cc88ff" },
};
const LIGHT_STYLE = {
  idea:        { fill:"#d6f4ff", stroke:"#007aaa", color:"#004466" },
  subgoal:     { fill:"#d0ffe0", stroke:"#007722", color:"#003d11" },
  step:        { fill:"#ececec", stroke:"#557755", color:"#223322" },
  risk:        { fill:"#ffd6e0", stroke:"#bb1133", color:"#6e0018" },
  alternative: { fill:"#ead6ff", stroke:"#7722cc", color:"#3d0077" },
};

const NW = 158;
const RW = 196, RH = 46;
const TITLE_MAX_CHARS = 14;
const NOTE_MAX_CHARS  = 17;
const PAD_TOP  = 8, PAD_BOT = 7;
const TITLE_LH = 15, DIV_GAP = 4, DIV_H = 1;
const NOTE_GAP = 5, NOTE_LH = 12, BADGE_H = 12;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function wrapText(text, maxChars) {
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
function nodeHeight(title, note) {
  const tl = Math.max(wrapText(title || "", TITLE_MAX_CHARS).length, 1);
  const nl = note ? wrapText(note, NOTE_MAX_CHARS).length : 0;
  return PAD_TOP + tl*TITLE_LH + (nl > 0 ? DIV_GAP+DIV_H+NOTE_GAP+nl*NOTE_LH : DIV_GAP) + BADGE_H + PAD_BOT;
}
function uid() { return "n" + (Date.now() % 1e9) + "_" + Math.floor(Math.random() * 999); }
function trunc(s, n) { return s && s.length > n ? s.slice(0, n) + "?" : s || ""; }
function fallback(input, tree) {
  const lines = input.split(/[.\n!?]/).map(l => l.trim()).filter(l => l.length > 2).slice(0, 8);
  const src = lines.length ? lines : [input.trim()];
  return { goal: input.slice(0, 50), nodes: src.map(l => ({ id: uid(), title: l.split(" ").slice(0, 3).join(" "), note: l, type: "idea", confidence: "medium", parentId: null })) };
}
function smartTitle(note) {
  if (!note) return "Идея";
  const stop = new Set(["я","мой","моя","мне","это","как","что","для","все","они","его","или","но","и","в","на","по","от","до"]);
  const words = (note || "").split(" ").filter(w => w.length > 2 && !stop.has(w.toLowerCase()));
  return words.slice(0, 3).join(" ") || note.split(" ").slice(0, 3).join(" ");
}

// ─── Radial layout ─────────────────────────────────────────────────────────────
function computeRadialLayout(tree, W, H) {
  const pos = {};
  const cx = W / 2, cy = H / 2;
  pos["ROOT"] = { x: cx, y: cy };
  const orphans = tree.nodes.filter(n => !n.parentId);
  if (!orphans.length) return pos;
  const L1R = Math.max(220, orphans.length * 42);
  orphans.forEach((n, i) => {
    const angle = (i / orphans.length) * Math.PI * 2 - Math.PI / 2;
    const nx = cx + L1R * Math.cos(angle);
    const ny = cy + L1R * Math.sin(angle);
    pos[n.id] = { x: nx, y: ny };
    const children = tree.nodes.filter(c => c.parentId === n.id);
    if (!children.length) return;
    const L2R = 150, fanSpan = Math.min(Math.PI * 0.62, children.length * 0.36);
    children.forEach((c, j) => {
      const ca = children.length === 1 ? angle : angle - fanSpan/2 + (fanSpan/(children.length-1))*j;
      const cx2 = nx + L2R * Math.cos(ca), cy2 = ny + L2R * Math.sin(ca);
      pos[c.id] = { x: cx2, y: cy2 };
      const gcs = tree.nodes.filter(gc => gc.parentId === c.id);
      if (!gcs.length) return;
      const L3R = 110, gFan = Math.min(Math.PI * 0.32, gcs.length * 0.2);
      gcs.forEach((gc, k) => {
        const gca = gcs.length === 1 ? ca : ca - gFan/2 + (gFan/(gcs.length-1))*k;
        pos[gc.id] = { x: cx2 + L3R * Math.cos(gca), y: cy2 + L3R * Math.sin(gca) };
      });
    });
  });
  return pos;
}
function fitAll(posMap, W, H) {
  const pts = Object.values(posMap);
  if (!pts.length) return { x: 0, y: 0, scale: 1 };
  const pad = 110;
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const x0 = Math.min(...xs)-pad, x1 = Math.max(...xs)+pad;
  const y0 = Math.min(...ys)-pad, y1 = Math.max(...ys)+pad;
  const sc = Math.min(W/(x1-x0), H/(y1-y0), 1.6, 2.5);
  return { x: W/2 - sc*(x0+x1)/2, y: H/2 - sc*(y0+y1)/2, scale: sc };
}

// ─── API ───────────────────────────────────────────────────────────────────────
async function fetchMap(input, tree) {
  const ids = tree.nodes.map(n => n.id);
  const maxN = ids.reduce((m, id) => { const n = parseInt(id.replace(/\D/g,""),10); return isNaN(n)?m:Math.max(m,n); }, 0);
  const compact = { goal: tree.goal, nodes: tree.nodes.map(n => ({ id:n.id, title:n.title, note:n.note, type:n.type, parentId:n.parentId })) };
  const p1 =
    "Return ONLY raw JSON, no markdown, no backticks.\n" +
    'Schema: {"goal":"string","nodes":[{"id":"n1","note":"1-2 sentences","type":"idea|subgoal|step|risk|alternative","confidence":"high|medium|low","parentId":null}]}\n' +
    "Rules: Extract 4-10 distinct ideas. note=clear summary 1-2 sentences. type: idea=concept, subgoal=goal, step=action, risk=danger/problem, alternative=other option. risk for ANYTHING negative. " +
    CLIENT_CONFIG.systemContext + " Keep existing nodes. New IDs from n"+(maxN+1)+". parentId refs existing or null. Same language as input.\n" +
    "Existing: " + JSON.stringify(compact) + "\nInput: " + input;
  const r1 = await fetch("/api/ai", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ model:"claude-haiku-4-5-20251001", max_tokens:1600, messages:[{role:"user",content:p1}] }) });
  const t1 = await r1.text();
  let d1; try { d1 = JSON.parse(t1); } catch(e) { return fallback(input, tree); }
  if (d1.error) throw new Error(d1.error.message || "API error");
  const raw1 = (d1.content?.[0]?.text) || "";
  const m1 = raw1.replace(/```json/gi,"").replace(/```/g,"").trim().match(/\{[\s\S]*\}/);
  if (!m1) return fallback(input, tree);
  let p; try { p = JSON.parse(m1[0]); } catch(e) { return fallback(input, tree); }
  const VT = ["idea","subgoal","step","risk","alternative"], VC = ["high","medium","low"];
  p.goal = p.goal || tree.goal || input.slice(0,50) || "Map";
  p.nodes = (Array.isArray(p.nodes)?p.nodes:[]).map(n => ({
    id: String(n.id||uid()), title:"", note:String(n.note||"").replace(/"/g,"'"),
    type: VT.includes(n.type)?n.type:"idea", confidence:VC.includes(n.confidence)?n.confidence:"medium", parentId:n.parentId||null
  }));
  const newNodes = p.nodes.filter(n => !tree.nodes.find(e => e.id===n.id));
  if (newNodes.length > 0) {
    const notesList = newNodes.map((n,i) => (i+1)+". "+n.note).join("\n");
    const p2 = "For each numbered note, write a UNIQUE 2-3 word title.\nRules:\n- Thematic label, like chapter title.\n- NEVER use first words of note.\n- Return ONLY JSON array of strings. No markdown. Same language.\n\nAlready used: "+tree.nodes.filter(n=>n.title).map(n=>n.title).join(", ")+"\n\nNotes:\n"+notesList;
    try {
      const r2 = await fetch("/api/ai",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-haiku-4-5-20251001",max_tokens:800,messages:[{role:"user",content:p2}]})});
      const d2 = await r2.json();
      const raw2 = (d2.content?.[0]?.text||"").replace(/```json/gi,"").replace(/```/g,"").trim();
      const arr = JSON.parse(raw2.match(/\[[\s\S]*\]/)?.[0]||"[]");
      newNodes.forEach((n,i) => { n.title = String(arr[i]||"").trim()||n.note.split(" ").slice(0,3).join(" "); });
    } catch(e) { newNodes.forEach(n => { n.title = n.note.split(" ").slice(0,3).join(" "); }); }
  }
  tree.nodes.forEach(old => { const f = p.nodes.find(n => n.id===old.id); if(f) f.title = old.title; });
  return p;
}

// ─── Anchor ───────────────────────────────────────────────────────────────────
function smartAnchor(px,py,ph,cx,cy,ch) {
  const dx=cx-px, dy=cy-py; let sx,sy,tx,ty;
  if (Math.abs(dx)>=Math.abs(dy)) {
    sx=dx>=0?px+NW/2:px-NW/2; sy=py; tx=dx>=0?cx-NW/2:cx+NW/2; ty=cy;
  } else {
    sx=px; sy=dy>=0?py+ph/2:py-ph/2; tx=cx; ty=dy>=0?cy-ch/2:cy+ch/2;
  }
  return {sx,sy,tx,ty};
}

// ─── Matrix Rain ──────────────────────────────────────────────────────────────
function MatrixRain({ opacity = 1 }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let animId;
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener("resize", resize);
    const cols = Math.floor(canvas.width / 13);
    const drops = Array(cols).fill(0).map(() => Math.random() * canvas.height / 13);
    const draw = () => {
      ctx.fillStyle = "rgba(0,0,0,0.055)";
      ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.font = "12px 'Courier New', monospace";
      drops.forEach((y, i) => {
        const bright = Math.random() > 0.92;
        ctx.fillStyle = bright ? "rgba(180,255,180,0.95)" : "rgba(0,255,65,0.52)";
        ctx.fillText(Math.random()>0.5?"1":"0", i*13, y*13);
        if (y*13 > canvas.height && Math.random()>0.975) drops[i]=0;
        drops[i] += 0.55 + Math.random()*0.45;
      });
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(animId); window.removeEventListener("resize",resize); };
  }, []);
  return <canvas ref={canvasRef} style={{ position:"absolute", inset:0, width:"100%", height:"100%", pointerEvents:"none", zIndex:0, opacity }} />;
}

// ─── Input Modal (Matrix) — used as home AND follow-up ────────────────────────
function InputModal({ value, onChange, onSubmit, onClose, busy, isHome, theme }) {
  const textareaRef = useRef(null);
  useEffect(() => { setTimeout(() => textareaRef.current?.focus(), 120); }, []);
  const dark = theme === "dark";
  const accentColor = dark ? "#00ff88" : "#00cc66";
  const faintAccent = dark ? "rgba(0,255,136,0.22)" : "rgba(0,180,80,0.3)";
  const btnActive   = dark ? "rgba(0,255,136,0.78)" : "rgba(0,160,60,0.9)";
  const bgOverlay   = dark ? "rgba(0,0,0,0.82)" : "rgba(200,240,210,0.82)";
  const matrixOpacity = dark ? 1 : 0.18;

  return (
    <div style={{ position:"fixed", inset:0, zIndex:300, background: dark?"#000":"#e8f5ec", display:"flex", flexDirection:"column", overflow:"hidden" }}>
      <MatrixRain opacity={matrixOpacity} />

      {/* Header */}
      <div style={{ position:"relative", zIndex:1, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 16px", borderBottom:`1px solid ${faintAccent}`, flexShrink:0 }}>
        <span style={{ fontSize:9, color:dark?"rgba(0,255,136,0.45)":"rgba(0,100,40,0.6)", letterSpacing:4, fontFamily:"'Courier New',monospace" }}>
          {isHome ? "MIND MAP" : "INPUT"}
        </span>
        {!isHome && (
          <button onClick={onClose}
            style={{ background:"transparent", border:`1px solid ${faintAccent}`, color:dark?"rgba(0,255,136,0.7)":"rgba(0,120,50,0.8)", fontFamily:"'Courier New',monospace", fontSize:9, padding:"4px 12px", cursor:"pointer", letterSpacing:2, borderRadius:4 }}>
            ✕ CLOSE
          </button>
        )}
      </div>

      {/* Textarea area */}
      <div style={{ position:"relative", zIndex:1, flex:1, display:"flex", flexDirection:"column", padding:"20px 16px 16px", gap:14 }}>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => { if (e.key==="Enter" && !e.shiftKey && !e.metaKey) { e.preventDefault(); onSubmit(); } }}
          placeholder={CLIENT_CONFIG.placeholder}
          style={{
            flex:1,
            background: dark?"rgba(0,0,0,0.72)":"rgba(255,255,255,0.72)",
            border:`1px solid ${faintAccent}`,
            color: dark?"#00ff88":"#003d18",
            fontFamily:"'Courier New',monospace",
            fontSize:15, lineHeight:1.65,
            padding:"16px", outline:"none", resize:"none",
            caretColor: accentColor,
            borderRadius:6,
          }}
        />
        <button
          onClick={onSubmit}
          disabled={busy || !value.trim()}
          style={{
            background:"transparent",
            border:`1px solid ${busy||!value.trim() ? faintAccent : accentColor}`,
            color: busy||!value.trim() ? faintAccent : (dark?"#00ff88":"#003d18"),
            fontFamily:"'Courier New',monospace",
            fontSize:11, padding:"14px",
            cursor: busy||!value.trim() ? "default" : "pointer",
            letterSpacing:3, borderRadius:6,
          }}>
          {busy ? "ГЕНЕРИРУЮ…" : "↳ GENERATE MAP"}
        </button>
      </div>
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────
export default function MindMap() {
  const [view, setView]           = useState("input"); // "input" | "map"
  const [inputText, setInputText] = useState("");
  const [theme, setTheme]         = useState("dark");
  const dark = theme === "dark";

  // Theme palette
  const C = dark ? {
    bg:"#090909", bgSub:"#060d06", border:"#1e4428",
    accent:"#00ff88", accentDim:"rgba(0,255,136,0.82)", accentFaint:"rgba(0,255,136,0.2)",
    text:"#00ff88", textDim:"rgba(0,255,136,0.48)", cardBg:"#0a120a", dots:"#131a13",
  } : {
    bg:"#f0f7f0", bgSub:"#e0ede0", border:"#4a8a5a",
    accent:"#006622", accentDim:"rgba(0,80,30,0.82)", accentFaint:"rgba(0,80,30,0.2)",
    text:"#004d18", textDim:"rgba(0,80,30,0.48)", cardBg:"#d0e8d0", dots:"#b0ccb0",
  };
  const NS = dark ? DARK_STYLE : LIGHT_STYLE;

  // Map state
  const [tree, setTree]             = useState({ goal:"", nodes:[] });
  const [pos, setPos]               = useState({});
  const [log, setLog]               = useState([
    { c:"s", t:"MIND MAP -- введи текст" },
    { c:"s", t:"/mock -- тест · /clear -- сброс" }
  ]);
  const [busy, setBusy]             = useState(false);
  const [transform, setTransform]   = useState({ x:0, y:0, scale:1 });
  const [newNodeIds, setNewNodeIds] = useState(new Set());
  const [editMode, setEditMode]     = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  // History
  const [mapHistory, setMapHistory] = useState([]);
  const [histIdx, setHistIdx]       = useState(-1);
  const histIdxRef                  = useRef(-1);
  useEffect(() => { histIdxRef.current = histIdx; }, [histIdx]);

  // Follow-up modal
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [followText, setFollowText]     = useState("");

  // Report
  const [showReport, setShowReport] = useState(false);
  const [reportText, setReportText] = useState("");

  // Related
  const [showRelated, setShowRelated] = useState(false);
  const [relatedLoad, setRelatedLoad] = useState(false);
  const [relatedList, setRelatedList] = useState([]);

  // Refs
  const svgRef      = useRef(null), gRef = useRef(null), logRef = useRef(null);
  const treeRef     = useRef(tree), posRef = useRef({});
  const transformRef= useRef({ x:0, y:0, scale:1 }), editModeRef = useRef(false);
  useEffect(() => { treeRef.current = tree; }, [tree]);
  useEffect(() => { posRef.current = pos; }, [pos]);
  useEffect(() => { editModeRef.current = editMode; }, [editMode]);

  const applyTransform = t => { transformRef.current=t; if(gRef.current) gRef.current.style.transform=`translate(${t.x}px,${t.y}px) scale(${t.scale})`; };
  const flushTransform = t => { applyTransform(t); setTransform(t); };

  const lg = useCallback((c, t) => {
    setLog(l => { const n=[...l,{c,t}]; return n.length>80?n.slice(-80):n; });
    setTimeout(() => { if(logRef.current) logRef.current.scrollTop=logRef.current.scrollHeight; }, 30);
  }, []);

  // Recompute layout on tree change
  useEffect(() => {
    const svg = svgRef.current; if (!svg || view!=="map") return;
    const { width:W, height:H } = svg.getBoundingClientRect();
    const w = W||360, h = H||600;
    const newPos = computeRadialLayout(tree, w, h);
    setPos(newPos);
    flushTransform(fitAll(newPos, w, h));
  }, [tree, view]);

  const fit = useCallback(() => {
    const svg = svgRef.current; if (!svg) return;
    const {width:W,height:H} = svg.getBoundingClientRect();
    flushTransform(fitAll(posRef.current, W, H));
  }, []);

  // Node navigation
  const getNavOrder = useCallback(() => {
    const order=[], visited=new Set();
    const bfs = ids => {
      if (!ids.length) return;
      const next=[];
      ids.forEach(id => { if(visited.has(id))return; visited.add(id); order.push(id); treeRef.current.nodes.filter(c=>c.parentId===id).forEach(c=>next.push(c.id)); });
      bfs(next);
    };
    bfs(treeRef.current.nodes.filter(n=>!n.parentId).map(n=>n.id));
    return order;
  }, []);

  const focusNode = useCallback(id => {
    const svg=svgRef.current; if(!svg)return;
    const p=posRef.current[id]; if(!p)return;
    const {width:W,height:H}=svg.getBoundingClientRect();
    const sc=1.55;
    flushTransform({ x:W/2-sc*p.x, y:H/2-sc*p.y, scale:sc });
    setSelectedId(id);
  }, []);

  const navNode = useCallback(dir => {
    const order=getNavOrder(); if(!order.length)return;
    const cur=order.indexOf(selectedId);
    const next=cur===-1?(dir>0?0:order.length-1):(cur+dir+order.length)%order.length;
    focusNode(order[next]);
  }, [getNavOrder, selectedId, focusNode]);

  // Wheel zoom
  useEffect(() => {
    const svg=svgRef.current; if(!svg)return;
    const onWheel=e=>{
      e.preventDefault();
      const t=transformRef.current, f=e.deltaY<0?1.1:0.91;
      const rect=svg.getBoundingClientRect();
      const px=e.clientX-rect.left, py=e.clientY-rect.top;
      const ns=Math.min(5,Math.max(0.05,t.scale*f));
      applyTransform({scale:ns, x:px-(ns/t.scale)*(px-t.x), y:py-(ns/t.scale)*(py-t.y)});
    };
    svg.addEventListener("wheel",onWheel,{passive:false});
    return ()=>svg.removeEventListener("wheel",onWheel);
  }, [view]);

  // Pointer events
  useEffect(() => {
    const svg=svgRef.current; if(!svg)return;
    const ptrs=new Map();
    const mid=()=>{const p=[...ptrs.values()];return{x:(p[0].x+p[1].x)/2,y:(p[0].y+p[1].y)/2};};
    const pdist=()=>{const p=[...ptrs.values()];const dx=p[0].x-p[1].x,dy=p[0].y-p[1].y;return Math.sqrt(dx*dx+dy*dy);};
    let lastMid=null,lastDist=null,panStart=null,nodeDrag=null;
    const onDown=e=>{
      e.preventDefault(); svg.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(ptrs.size===1){
        let el=e.target;
        while(el&&el!==svg){
          if(el.dataset?.nodeid){
            const nid=el.dataset.nodeid;
            if(editModeRef.current){const r=svg.getBoundingClientRect();setEditTarget({id:nid,x:e.clientX-r.left,y:e.clientY-r.top});return;}
            const p=posRef.current[nid]||{x:0,y:0};
            nodeDrag={id:nid,ox:p.x,oy:p.y,sx:e.clientX,sy:e.clientY};return;
          }
          el=el.parentElement;
        }
        if(editModeRef.current){setEditTarget(null);return;}
        const t=transformRef.current;
        panStart={ox:t.x,oy:t.y,sx:e.clientX,sy:e.clientY};lastMid=null;lastDist=null;
      } else if(ptrs.size===2){nodeDrag=null;panStart=null;lastMid=mid();lastDist=pdist();}
    };
    const onMove=e=>{
      if(!ptrs.has(e.pointerId))return; e.preventDefault();
      ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(ptrs.size===1&&nodeDrag){const d=nodeDrag;setPos(p=>({...p,[d.id]:{x:d.ox+(e.clientX-d.sx),y:d.oy+(e.clientY-d.sy)}}));}
      else if(ptrs.size===1&&panStart){applyTransform({...transformRef.current,x:panStart.ox+(e.clientX-panStart.sx),y:panStart.oy+(e.clientY-panStart.sy)});}
      else if(ptrs.size===2&&lastMid&&lastDist){
        const t=transformRef.current,m=mid(),d=pdist(),r=svg.getBoundingClientRect();
        const px=m.x-r.left,py=m.y-r.top,ratio=d/lastDist;
        const ns=Math.min(5,Math.max(0.05,t.scale*ratio)),sf=ns/t.scale;
        applyTransform({scale:ns,x:px-sf*(px-t.x)+(m.x-lastMid.x),y:py-sf*(py-t.y)+(m.y-lastMid.y)});
        lastMid=m;lastDist=d;
      }
    };
    const onUp=e=>{
      e.preventDefault(); ptrs.delete(e.pointerId);
      if(ptrs.size===1){const[,rp]=[...ptrs.entries()][0];const t=transformRef.current;panStart={ox:t.x,oy:t.y,sx:rp.x,sy:rp.y};lastMid=null;lastDist=null;}
      if(ptrs.size===0){flushTransform(transformRef.current);nodeDrag=null;panStart=null;lastMid=null;lastDist=null;}
    };
    svg.addEventListener("pointerdown",onDown,{passive:false});
    svg.addEventListener("pointermove",onMove,{passive:false});
    svg.addEventListener("pointerup",onUp,{passive:false});
    svg.addEventListener("pointercancel",onUp,{passive:false});
    return ()=>{
      svg.removeEventListener("pointerdown",onDown);svg.removeEventListener("pointermove",onMove);
      svg.removeEventListener("pointerup",onUp);svg.removeEventListener("pointercancel",onUp);
    };
  }, [view]);

  // Process
  const process = useCallback(async val => {
    val=val.trim(); if(!val)return;
    if(val==="/clear"){setTree({goal:"",nodes:[]});setPos({});setMapHistory([]);setHistIdx(-1);histIdxRef.current=-1;setLog([{c:"s",t:"- очищено -"}]);return;}
    if(val==="/mock"){
      const mock={goal:"ContentOS SaaS",nodes:[
        {id:"n1",title:"3 streams",    note:"Agency, SaaS and digital products as independent revenue streams",type:"subgoal",    confidence:"high",  parentId:null},
        {id:"n2",title:"agency",       note:"Fast cashflow through client projects",                           type:"step",       confidence:"high",  parentId:"n1"},
        {id:"n3",title:"SaaS scale",   note:"ContentOS subscription model, MRR grows without linear costs",   type:"step",       confidence:"high",  parentId:"n1"},
        {id:"n4",title:"dig products", note:"Templates, courses — passive income via Gumroad",                type:"step",       confidence:"medium",parentId:"n1"},
        {id:"n5",title:"autoposting",  note:"Automatic Instagram publishing via Meta API",                    type:"idea",       confidence:"medium",parentId:"n3"},
        {id:"n6",title:"algo risk",    note:"Meta may restrict API or reduce reach",                          type:"risk",       confidence:"high",  parentId:"n5"},
        {id:"n7",title:"validation",   note:"Landing + waitlist before dev",                                  type:"step",       confidence:"high",  parentId:"n3"},
        {id:"n8",title:"UI kits",      note:"Selling Figma kits as alternative if SaaS slow",                type:"alternative",confidence:"medium",parentId:"n4"},
      ]};
      setTree(mock);setPos({});setMapHistory([mock]);setHistIdx(0);histIdxRef.current=0;
      lg("o","- mock "+mock.nodes.length+" nodes -"); return;
    }
    if(busy)return;
    setBusy(true);lg("u","▸ "+trunc(val,60));lg("b","строю карту…");
    try {
      const updated=await fetchMap(val, treeRef.current);
      const prevIds=new Set(treeRef.current.nodes.map(n=>n.id));
      const fresh=updated.nodes.filter(n=>!prevIds.has(n.id)).map(n=>({...n,title:n.title||smartTitle(n.note)}));
      const base=treeRef.current.nodes, goal=updated.goal||treeRef.current.goal;
      const ids=new Set(base.map(n=>n.id));
      const merged=[...base,...fresh.filter(n=>!ids.has(n.id))];
      const saved=!goal&&merged.length?{goal:merged[0].title,nodes:merged}:{goal,nodes:merged};
      setTree(saved);
      setMapHistory(prev=>[...prev.slice(0,histIdxRef.current+1),saved]);
      setHistIdx(prev=>{const ni=prev+1;histIdxRef.current=ni;return ni;});
      const freshIds=fresh.map(n=>n.id);
      if(freshIds.length){setNewNodeIds(new Set(freshIds));setTimeout(()=>setNewNodeIds(new Set()),600);}
      setLog(l=>l.filter(i=>i.c!=="b")); lg("o","✓ готово");
    } catch(e){lg("e","ERR: "+e.message);}
    finally{setBusy(false);}
  }, [busy, lg]);

  const navBack    = useCallback(()=>{if(histIdxRef.current<=0)return;const ni=histIdxRef.current-1;setTree(mapHistory[ni]);setPos({});setHistIdx(ni);histIdxRef.current=ni;},[mapHistory]);
  const navForward = useCallback(()=>{if(histIdxRef.current>=mapHistory.length-1)return;const ni=histIdxRef.current+1;setTree(mapHistory[ni]);setPos({});setHistIdx(ni);histIdxRef.current=ni;},[mapHistory]);

  const saveMap = useCallback(async()=>{
    if(!tree.nodes.length)return;
    try{const res=await fetch("/api/save",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tree,pos})});const data=await res.json();lg("o","✓ /view/"+data.slug);try{await navigator.clipboard.writeText(window.location.origin+"/view/"+data.slug);}catch(e){}}
    catch(e){lg("e","ERR save: "+e.message);}
  },[tree,pos,lg]);

  const exportSVG = useCallback(()=>{
    const svg=svgRef.current;if(!svg)return;
    const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)],{type:"image/svg+xml"}));a.download=(tree.goal||"mindmap").replace(/\s+/g,"_")+".svg";a.click();URL.revokeObjectURL(a.href);
  },[tree.goal]);

  const fetchRelated=useCallback(async()=>{
    if(!tree.goal)return;
    setShowRelated(true);setRelatedLoad(true);setRelatedList([]);
    try{
      const prompt=`Given mind map topic "${tree.goal}", suggest 7 related topics. Return ONLY a JSON array of short strings (max 6 words each). Same language.`;
      const res=await fetch("/api/ai",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-haiku-4-5-20251001",max_tokens:300,messages:[{role:"user",content:prompt}]})});
      const data=await res.json();
      const raw=(data.content?.[0]?.text||"").replace(/```json|```/g,"").trim();
      setRelatedList(JSON.parse(raw.match(/\[[\s\S]*\]/)?.[0]||"[]").slice(0,7));
    }catch(e){}
    setRelatedLoad(false);
  },[tree.goal]);

  // ── Home: input screen ────────────────────────────────────────────────────
  if (view === "input") {
    return (
      <>
        <InputModal
          value={inputText}
          onChange={setInputText}
          onSubmit={() => {
            if (!inputText.trim() || busy) return;
            const v = inputText;
            setInputText("");
            setView("map");
            setTimeout(() => process(v), 80);
          }}
          onClose={null}
          busy={busy}
          isHome={true}
          theme={theme}
        />
        {/* Theme toggle — top-right icon */}
        <button
          onClick={() => setTheme(t => t === "dark" ? "light" : "dark")}
          style={{
            position:"fixed", top:14, right:16, zIndex:400,
            width:34, height:34, borderRadius:6,
            background: dark?"rgba(0,0,0,0.55)":"rgba(255,255,255,0.55)",
            backdropFilter:"blur(8px)", WebkitBackdropFilter:"blur(8px)",
            border:`1px solid ${dark?"rgba(0,255,136,0.25)":"rgba(0,100,40,0.25)"}`,
            color:dark?"rgba(0,255,136,0.7)":"rgba(0,80,30,0.75)",
            cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center",
          }}>
          {dark
            ? <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
            : <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
          }
        </button>
        <style>{`*{box-sizing:border-box;} textarea::placeholder{color:${dark?"rgba(0,255,136,0.3)":"rgba(0,100,40,0.4)"};}`}</style>
      </>
    );
  }

  // ── Edges ─────────────────────────────────────────────────────────────────
  const edges=[];
  if(tree.goal){
    const rp=pos["ROOT"];
    tree.nodes.filter(n=>!n.parentId).forEach(n=>{
      const p=pos[n.id],nh=nodeHeight(n.title,n.note);
      if(rp&&p){const a=smartAnchor(rp.x,rp.y,RH,p.x,p.y,nh);edges.push({id:"r-"+n.id,...a});}
    });
  }
  tree.nodes.forEach(n=>{
    if(!n.parentId)return;
    const pp=pos[n.parentId],cp=pos[n.id];
    const pN=tree.nodes.find(x=>x.id===n.parentId);
    const pnh=nodeHeight(pN?.title,pN?.note),cnh=nodeHeight(n.title,n.note);
    if(pp&&cp){const a=smartAnchor(pp.x,pp.y,pnh,cp.x,cp.y,cnh);edges.push({id:n.parentId+"-"+n.id,...a});}
  });

  const logColor={b:"#ffdd44",s:"rgba(0,255,136,0.6)",u:"#00ccee",e:"#ff5566",o:"#00ff88"};
  const canBack=histIdx>0, canFwd=histIdx<mapHistory.length-1;

  // Pill button
  const pillBtn=(disabled=false,active=false)=>({
    width:40,height:40,borderRadius:6,
    background:active?(dark?"rgba(0,255,136,0.1)":"rgba(0,80,30,0.1)"):"none",
    border:"none",cursor:disabled?"default":"pointer",
    color:disabled?C.accentFaint:(active?C.accent:C.accentDim),
    display:"flex",alignItems:"center",justifyContent:"center",
    opacity:disabled?0.3:1,transition:"all 0.15s",flexShrink:0,
  });

  // Small icon button for top toolbar
  const iconBtn=()=>({
    width:28,height:28,borderRadius:5,background:"none",border:"none",
    cursor:"pointer",color:C.accentDim,display:"flex",alignItems:"center",justifyContent:"center",
  });

  // ── MAP SCREEN ────────────────────────────────────────────────────────────
  return (
    <div style={{ background:C.bg, color:C.text, fontFamily:"'Courier New',monospace", height:"100dvh", display:"flex", flexDirection:"column", overflow:"hidden" }}>

      {/* Floating top controls */}
      <div style={{ position:"absolute", top:0, left:0, right:0, zIndex:30, display:"flex", alignItems:"flex-start", justifyContent:"space-between", padding:"14px 14px 0", pointerEvents:"none" }}>
        {/* Back to input */}
        <button onClick={()=>setView("input")}
          style={{ width:36,height:36,borderRadius:6, background:dark?"rgba(9,9,9,0.88)":"rgba(240,247,240,0.88)", backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)", border:`1px solid ${C.border}`,color:C.accentDim, fontSize:18,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"all" }}>
          ‹
        </button>

        {/* Top-right toolbar */}
        <div style={{ display:"flex",gap:1, background:dark?"rgba(9,9,9,0.88)":"rgba(240,247,240,0.88)", backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)", border:`1px solid ${C.border}`,borderRadius:6,padding:"4px 5px",pointerEvents:"all" }}>
          <button onClick={exportSVG}    style={iconBtn()}>
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
          </button>
          <button onClick={()=>setTheme(t=>t==="dark"?"light":"dark")} style={iconBtn()}>
            {dark
              ? <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
              : <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
            }
          </button>
          <button onClick={()=>setShowReport(true)} style={iconBtn()}>
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </button>
          <button onClick={saveMap} disabled={!tree.nodes.length}
            style={{...iconBtn(), color:tree.nodes.length?C.accentDim:C.accentFaint, cursor:tree.nodes.length?"pointer":"default"}}>
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17,21 17,13 7,13 7,21"/><polyline points="7,3 7,8 15,8"/></svg>
          </button>
        </div>
      </div>

      {/* SVG canvas */}
      <div style={{ flex:1, overflow:"hidden", position:"relative" }}>
        <svg ref={svgRef} style={{ width:"100%",height:"100%",position:"absolute",inset:0,cursor:editMode?"crosshair":"grab",touchAction:"none" }}>
          <defs>
            <marker id="arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill={dark?"rgba(0,220,100,0.38)":"rgba(0,100,40,0.4)"}/>
            </marker>
            <pattern id="dots" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
              <circle cx="14" cy="14" r="0.7" fill={C.dots}/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#dots)"/>
          <g ref={gRef} style={{ transform:`translate(${transform.x}px,${transform.y}px) scale(${transform.scale})`, willChange:"transform", transformOrigin:"0 0" }}>

            {edges.map(e=>{
              const isH=Math.abs(e.tx-e.sx)>=Math.abs(e.ty-e.sy);
              const mx=(e.sx+e.tx)/2,my=(e.sy+e.ty)/2;
              const d=isH?`M${e.sx},${e.sy} C${mx},${e.sy} ${mx},${e.ty} ${e.tx},${e.ty}`:`M${e.sx},${e.sy} C${e.sx},${my} ${e.tx},${my} ${e.tx},${e.ty}`;
              return <path key={e.id} d={d} fill="none" stroke={dark?"rgba(0,220,100,0.28)":"rgba(0,100,40,0.3)"} strokeWidth="1.2" markerEnd="url(#arr)"/>;
            })}

            {tree.goal&&pos["ROOT"]&&(
              <g transform={`translate(${pos["ROOT"].x},${pos["ROOT"].y})`} data-nodeid="ROOT" style={{cursor:"grab"}}>
                <rect x={-RW/2} y={-RH/2} width={RW} height={RH} rx={6} fill={C.cardBg} stroke={C.accent} strokeWidth={1.5}/>
                <text textAnchor="middle" dominantBaseline="middle" fill={C.accent} fontSize={11} fontFamily="'Courier New',monospace" style={{pointerEvents:"none"}}>{trunc(tree.goal,25)}</text>
              </g>
            )}

            {tree.nodes.map(n=>{
              const p=pos[n.id]; if(!p)return null;
              const ns=NS[n.type]||NS.idea;
              const nh=nodeHeight(n.title,n.note);
              const tl=wrapText(n.title||"",TITLE_MAX_CHARS);
              const nl=wrapText(n.note||"",NOTE_MAX_CHARS);
              const TOP=-nh/2;
              const isNew=newNodeIds.has(n.id), isSel=selectedId===n.id;
              return (
                <g key={n.id} transform={`translate(${p.x},${p.y})`}
                  style={{cursor:editMode?"pointer":"grab",...(isNew?{animation:"nodeIn 0.35s ease-out"}:{})}}
                  data-nodeid={n.id}>
                  {isSel&&<rect x={-NW/2-3} y={TOP-3} width={NW+6} height={nh+6} rx={7} fill="none" stroke={C.accent} strokeWidth={1.5} opacity={0.5}/>}
                  <rect x={-NW/2} y={TOP} width={NW} height={nh} rx={6}
                    fill={ns.fill} stroke={editMode?"rgba(0,255,136,0.55)":ns.stroke}
                    strokeWidth={editMode?2:1.5}
                    strokeDasharray={n.confidence==="low"?"4 3":undefined}
                    opacity={n.confidence==="low"?0.75:1}/>
                  {tl.map((line,li)=>(
                    <text key={"t"+li} x={-NW/2+9} y={TOP+PAD_TOP+TITLE_LH*0.82+li*TITLE_LH}
                      fill={ns.color} fontSize={11} fontWeight="700" fontFamily="'Courier New',monospace" style={{pointerEvents:"none"}}>{line}</text>
                  ))}
                  {nl.length>0&&<line x1={-NW/2+9} y1={TOP+PAD_TOP+tl.length*TITLE_LH+DIV_GAP} x2={NW/2-9} y2={TOP+PAD_TOP+tl.length*TITLE_LH+DIV_GAP} stroke={ns.stroke} strokeWidth={0.5} opacity={0.3}/>}
                  {nl.map((line,li)=>{
                    const dy=TOP+PAD_TOP+tl.length*TITLE_LH+DIV_GAP+DIV_H+NOTE_GAP+NOTE_LH*0.82;
                    return <text key={"n"+li} x={-NW/2+9} y={dy+li*NOTE_LH} fill={ns.color} fontSize={9.5} opacity={dark?0.62:0.75} fontFamily="'Courier New',monospace" style={{pointerEvents:"none"}}>{line}</text>;
                  })}
                  <text textAnchor="start" x={-NW/2+7} y={nh/2-3}
                    fill={ns.stroke} fontSize={6.5} opacity={0.4} letterSpacing={1}
                    fontFamily="'Courier New',monospace" style={{pointerEvents:"none"}}>{n.type.toUpperCase()}</text>
                  <circle cx={NW/2-9} cy={nh/2-6} r={2.5}
                    fill={n.confidence==="high"?ns.stroke:"none"} stroke={ns.stroke} strokeWidth={1} opacity={0.4} style={{pointerEvents:"none"}}/>
                </g>
              );
            })}
          </g>
        </svg>

        {/* Edit menu */}
        {editTarget&&(
          <div style={{position:"absolute",left:Math.min(editTarget.x,(svgRef.current?.clientWidth||400)-160),top:Math.min(editTarget.y,(svgRef.current?.clientHeight||300)-60),background:C.cardBg,border:`1px solid ${C.border}`,borderRadius:6,padding:"6px 8px",display:"flex",gap:6,zIndex:100,boxShadow:"0 4px 16px rgba(0,0,0,0.8)"}}>
            {[["DEL",()=>{const nd=treeRef.current.nodes.find(n=>n.id===editTarget.id);if(nd){setTree(prev=>({...prev,nodes:prev.nodes.filter(n=>n.id!==editTarget.id).map(n=>n.parentId===editTarget.id?{...n,parentId:nd.parentId}:n)}));setPos(prev=>{const p={...prev};delete p[editTarget.id];return p;});}setEditTarget(null);}],
               ["NOTE",()=>{const nd=treeRef.current.nodes.find(n=>n.id===editTarget.id);const v=prompt("Редактировать:",nd?.note||"");if(v!==null)setTree(prev=>({...prev,nodes:prev.nodes.map(n=>n.id===editTarget.id?{...n,note:v}:n)}));setEditTarget(null);}],
               ["✕",()=>setEditTarget(null)]
            ].map(([lbl,fn])=>(
              <button key={lbl} onClick={fn} style={{background:C.cardBg,border:`1px solid ${C.border}`,color:C.accentDim,fontFamily:"'Courier New',monospace",fontSize:10,padding:"3px 8px",cursor:"pointer",letterSpacing:1,borderRadius:4}}>{lbl}</button>
            ))}
          </div>
        )}

        {/* ── Pill toolbar ─────────────────────────────────────────────── */}
        <div style={{
          position:"absolute", bottom:56, left:"50%", transform:"translateX(-50%)", zIndex:20,
          display:"flex", alignItems:"center", gap:0,
          background:dark?"rgba(9,9,9,0.88)":"rgba(240,247,240,0.88)",
          backdropFilter:"blur(14px)", WebkitBackdropFilter:"blur(14px)",
          border:`1px solid ${C.border}`, borderRadius:10, padding:"5px 8px",
        }}>
          <button onClick={fit} title="Fit all" style={pillBtn()}>
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
              <path d="M8 3H5a2 2 0 00-2 2v3M21 8V5a2 2 0 00-2-2h-3M16 21h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/>
            </svg>
          </button>
          <button onClick={()=>setEditMode(m=>!m)} title="Edit" style={pillBtn(false,editMode)}>
            <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <div style={{width:1,height:20,background:C.border,margin:"0 3px"}}/>
          <button onClick={()=>navNode(-1)} style={pillBtn(!tree.nodes.length)}>
            <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          </button>
          <button onClick={()=>navNode(1)} style={pillBtn(!tree.nodes.length)}>
            <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </button>
        </div>

        {/* Related */}
        <button onClick={fetchRelated}
          style={{position:"absolute",bottom:60,left:14,background:dark?"rgba(9,9,9,0.88)":"rgba(240,247,240,0.88)",backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)",border:`1px solid ${C.border}`,color:C.accentDim,fontFamily:"'Courier New',monospace",fontSize:8,padding:"6px 10px",cursor:"pointer",letterSpacing:2,borderRadius:6}}>
          RELATED →
        </button>

        {busy&&(
          <div style={{position:"absolute",inset:0,background:dark?"rgba(9,9,9,0.45)":"rgba(240,247,240,0.5)",backdropFilter:"blur(2px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:10}}>
            <div style={{fontSize:10,color:C.accentDim,letterSpacing:4,animation:"blink 0.5s step-end infinite"}}>ГЕНЕРИРУЮ…</div>
          </div>
        )}
      </div>

      {/* Log */}
      <div ref={logRef} style={{borderTop:`1px solid ${C.border}`,background:C.bgSub,maxHeight:"12vh",overflowY:"auto",padding:"4px 14px",flexShrink:0}}>
        {log.map((l,i)=>(
          <div key={i} style={{fontSize:10,lineHeight:1.6,color:logColor[l.c]||"#aaa"}}>
            {l.t}{l.c==="b"&&<span style={{animation:"blink 0.5s step-end infinite"}}> ...</span>}
          </div>
        ))}
      </div>

      {/* Follow-up bar */}
      <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 14px calc(8px + env(safe-area-inset-bottom)) 14px",borderTop:`1px solid ${C.border}`,background:C.bgSub,flexShrink:0}}>
        <button onClick={navBack} disabled={!canBack} style={{background:"transparent",border:"none",color:canBack?C.accentDim:C.accentFaint,fontSize:18,cursor:canBack?"pointer":"default",padding:"0 2px",lineHeight:1}}>←</button>
        <button onClick={navForward} disabled={!canFwd} style={{background:"transparent",border:"none",color:canFwd?C.accentDim:C.accentFaint,fontSize:18,cursor:canFwd?"pointer":"default",padding:"0 2px",lineHeight:1}}>→</button>
        <button
          onClick={()=>{setFollowText(""); setShowFollowUp(true);}}
          style={{flex:1,background:C.cardBg,border:`1px solid ${C.border}`,color:C.textDim,fontFamily:"'Courier New',monospace",fontSize:13,padding:"10px 12px",cursor:"text",textAlign:"left",outline:"none",borderRadius:4}}>
          {busy?"…":"ask follow-up…"}
        </button>
        <button
          onClick={()=>{setFollowText(""); setShowFollowUp(true);}}
          style={{width:36,height:36,borderRadius:6,background:"transparent",border:`1px solid ${C.accentDim}`,color:C.accentDim,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0}}>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </button>
      </div>

      {/* ══ FOLLOW-UP MODAL (Matrix) ════════════════════════════════════════ */}
      {showFollowUp&&(
        <InputModal
          value={followText}
          onChange={setFollowText}
          onSubmit={()=>{if(!followText.trim()||busy)return;const v=followText;setFollowText("");setShowFollowUp(false);process(v);}}
          onClose={()=>setShowFollowUp(false)}
          busy={busy}
          isHome={false}
          theme={theme}
        />
      )}

      {/* ══ RELATED ══════════════════════════════════════════════════════════ */}
      {showRelated&&(
        <div style={{position:"fixed",inset:0,zIndex:200,background:"rgba(0,0,0,0.72)",display:"flex",alignItems:"flex-end"}} onClick={e=>{if(e.target===e.currentTarget)setShowRelated(false);}}>
          <div style={{width:"100%",background:C.bg,border:`1px solid ${C.border}`,borderRadius:"8px 8px 0 0",padding:"20px 16px calc(24px + env(safe-area-inset-bottom))",maxHeight:"65vh",overflowY:"auto"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
              <span style={{fontSize:9,letterSpacing:4,color:C.textDim}}>RELATED TOPICS</span>
              <button onClick={()=>setShowRelated(false)} style={{background:"none",border:"none",color:C.accentDim,fontSize:20,cursor:"pointer",lineHeight:1}}>✕</button>
            </div>
            {relatedLoad&&<div style={{fontSize:11,color:C.textDim}}><span style={{animation:"blink 0.5s step-end infinite"}}>generating…</span></div>}
            {relatedList.map((topic,i)=>(
              <button key={i} onClick={()=>{setShowRelated(false);setTimeout(()=>process(topic),50);}}
                style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",padding:"13px 0",background:"none",border:"none",borderBottom:`1px solid ${C.border}`,cursor:"pointer",color:C.text,fontSize:12,fontFamily:"'Courier New',monospace",textAlign:"left"}}>
                <span>{topic}</span><span style={{color:C.accentDim,fontSize:16}}>→</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ══ REPORT ═══════════════════════════════════════════════════════════ */}
      {showReport&&(
        <div style={{position:"fixed",inset:0,zIndex:200,background:"rgba(0,0,0,0.72)",display:"flex",alignItems:"flex-end"}} onClick={e=>{if(e.target===e.currentTarget)setShowReport(false);}}>
          <div style={{width:"100%",background:C.bg,border:`1px solid ${C.border}`,borderRadius:"8px 8px 0 0",padding:"24px 16px calc(28px + env(safe-area-inset-bottom))"}}>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:2,marginBottom:6,color:C.accent}}>MIND MAP ISSUE?</div>
            <div style={{fontSize:10,color:C.textDim,marginBottom:16,letterSpacing:1}}>Describe what went wrong.</div>
            <textarea value={reportText} onChange={e=>setReportText(e.target.value)} placeholder="Describe the issue…" rows={4}
              style={{width:"100%",background:C.cardBg,border:`1px solid ${C.border}`,color:C.text,fontFamily:"'Courier New',monospace",fontSize:12,padding:"10px 12px",outline:"none",resize:"none",boxSizing:"border-box",borderRadius:4}}/>
            <div style={{display:"flex",gap:10,marginTop:14}}>
              <button onClick={()=>setShowReport(false)} style={{flex:1,background:"transparent",border:`1px solid ${C.border}`,color:C.accentDim,fontFamily:"'Courier New',monospace",fontSize:10,padding:"11px 0",cursor:"pointer",letterSpacing:2,borderRadius:4}}>CANCEL</button>
              <button onClick={()=>{setShowReport(false);setReportText("");lg("o","✓ report sent");}} style={{flex:1,background:"transparent",border:`1px solid ${C.accent}`,color:C.accent,fontFamily:"'Courier New',monospace",fontSize:10,padding:"11px 0",cursor:"pointer",letterSpacing:2,borderRadius:4}}>SUBMIT</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
        @keyframes nodeIn{from{opacity:0;transform:scale(0.5)}to{opacity:1;transform:scale(1)}}
        *{box-sizing:border-box;}
        input::placeholder,textarea::placeholder{color:rgba(0,255,136,0.3);}
        button{outline:none;}
      `}</style>
    </div>
  );
}