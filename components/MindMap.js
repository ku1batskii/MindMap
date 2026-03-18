import { useState, useEffect, useRef, useCallback } from "react";
import { computeRadialLayout, fitAll, getTheme, DARK_STYLE, LIGHT_STYLE } from "../lib/mindmap-utils.js";
import { useCanvasControls } from "../hooks/useCanvasControls.js";
import { useMindMapEngine } from "../hooks/useMindMapEngine.js";
import MindMapCanvas from "./MindMapCanvas.js";
import { InputModal, SessionsSidebar, BusyOverlay, RelatedPanel, ReportModal } from "./UIOverlays.js";

export default function MindMap() {
  const [view, setView]         = useState("input");
  const [inputText, setInputText] = useState("");
  const [theme, setTheme]       = useState("dark");
  const dark = theme === "dark";
  const C  = getTheme(dark);
  const NS = dark ? DARK_STYLE : LIGHT_STYLE;

  // ── Log ─────────────────────────────────────────────────────────────────────
  const [log, setLog] = useState([
    { c:"s", t:"MIND MAP -- введи текст" },
    { c:"s", t:"/mock -- тест · /clear -- сброс" },
  ]);
  const logRef = useRef(null);
  const onLog  = useCallback((c, t) => {
    setLog(l => { const n = [...l, { c, t }]; return n.length > 80 ? n.slice(-80) : n; });
    setTimeout(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, 30);
  }, []);

  // ── Engine ───────────────────────────────────────────────────────────────────
  const engine = useMindMapEngine({ onLog });

  // ── Canvas refs & state ──────────────────────────────────────────────────────
  const svgRef = useRef(null);
  const gRef   = useRef(null);
  const [transform, setTransform]   = useState({ x:0, y:0, scale:1 });
  const [pos, setPos]               = useState({});
  const [newNodeIds, setNewNodeIds] = useState(new Set());
  const [selectedId, setSelectedId] = useState(null);
  const [editMode, setEditMode]     = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [busyVisible, setBusyVisible] = useState(false);

  // ── Modals ───────────────────────────────────────────────────────────────────
  const [showSidebar,  setShowSidebar]  = useState(false);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [followText,   setFollowText]   = useState("");
  const [showReport,   setShowReport]   = useState(false);
  const [reportText,   setReportText]   = useState("");
  const [showRelated,  setShowRelated]  = useState(false);

  // ── Canvas controls ───────────────────────────────────────────────────────────
  const { transformRef, posRef, onPosChange, flushTransform } = useCanvasControls({
    svgRef, gRef,
    onNodeLongPress: target => setEditTarget(target),
  });

  // Wire posChange → setPos
  onPosChange.current = (id, newP) => setPos(p => ({ ...p, [id]: newP }));

  // ── Layout sync ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const svg = svgRef.current; if (!svg || view !== "map") return;
    const { width: W, height: H } = svg.getBoundingClientRect();
    const w = W || 360, h = H || 600;
    const newPos = computeRadialLayout(engine.tree, w, h);
    posRef.current = newPos;
    setPos(newPos);
    flushTransform(fitAll(newPos, w, h), setTransform);
  }, [engine.tree, view]);

  const fit = useCallback(() => {
    const svg = svgRef.current; if (!svg) return;
    const { width: W, height: H } = svg.getBoundingClientRect();
    flushTransform(fitAll(posRef.current, W, H), setTransform);
  }, [flushTransform, posRef]);

  // ── Node nav ───────────────────────────────────────────────────────────────
  const getNavOrder = useCallback(() => {
    const order = [], visited = new Set();
    const bfs = ids => {
      if (!ids.length) return;
      const next = [];
      ids.forEach(id => {
        if (visited.has(id)) return;
        visited.add(id); order.push(id);
        engine.tree.nodes.filter(c => c.parentId === id).forEach(c => next.push(c.id));
      });
      bfs(next);
    };
    bfs(engine.tree.nodes.filter(n => !n.parentId).map(n => n.id));
    return order;
  }, [engine.tree]);

  const focusNode = useCallback(id => {
    const svg = svgRef.current; if (!svg) return;
    const p = posRef.current[id]; if (!p) return;
    const { width: W, height: H } = svg.getBoundingClientRect();
    const sc = 1.55;
    flushTransform({ x: W/2 - sc*p.x, y: H/2 - sc*p.y, scale: sc }, setTransform);
    setSelectedId(id);
  }, [flushTransform, posRef]);

  const navNode = useCallback(dir => {
    const order = getNavOrder(); if (!order.length) return;
    const cur  = order.indexOf(selectedId);
    const next = cur === -1 ? (dir > 0 ? 0 : order.length - 1) : (cur + dir + order.length) % order.length;
    focusNode(order[next]);
  }, [getNavOrder, selectedId, focusNode]);

  // ── Busy fade ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (engine.busy) { setBusyVisible(true); }
    else { const t = setTimeout(() => setBusyVisible(false), 600); return () => clearTimeout(t); }
  }, [engine.busy]);

  // ── New node animation ────────────────────────────────────────────────────────
  const processWithAnim = useCallback(async val => {
    const freshIds = await engine.process(val);
    if (freshIds?.length) {
      setNewNodeIds(new Set(freshIds));
      setTimeout(() => setNewNodeIds(new Set()), 600);
    }
  }, [engine]);

  // ── Save / export ─────────────────────────────────────────────────────────────
  const saveMap = useCallback(async () => {
    if (!engine.tree.nodes.length) return;
    try {
      const res = await fetch("/api/save", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ tree: engine.tree, pos }) });
      const data = await res.json();
      onLog("o", "✓ /view/" + data.slug);
      try { await navigator.clipboard.writeText(window.location.origin + "/view/" + data.slug); } catch {}
    } catch (e) { onLog("e", "ERR save: " + e.message); }
  }, [engine.tree, pos, onLog]);

  const exportSVG = useCallback(() => {
    const svg = svgRef.current; if (!svg) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type:"image/svg+xml" }));
    a.download = (engine.tree.goal || "mindmap").replace(/\s+/g, "_") + ".svg";
    a.click(); URL.revokeObjectURL(a.href);
  }, [engine.tree.goal]);

  const logColor = { b:"#ffdd44", s:"rgba(0,255,136,0.6)", u:"#00ccee", e:"#ff5566", o:"#00ff88" };
  const TOOLBAR_H = 44;

  const pillBtn = (disabled = false, active = false) => ({
    width:36, height:36, borderRadius:6,
    background: active ? (dark ? "rgba(0,255,136,0.1)" : "rgba(0,80,30,0.1)") : "none",
    border:"none", cursor: disabled ? "default" : "pointer",
    color: disabled ? C.accentFaint : (active ? C.accent : C.accentDim),
    display:"flex", alignItems:"center", justifyContent:"center",
    opacity: disabled ? 0.3 : 1, transition:"all 0.15s", flexShrink:0,
  });
  const iconBtn = () => ({ width:28, height:28, borderRadius:5, background:"none", border:"none", cursor:"pointer", color:C.accentDim, display:"flex", alignItems:"center", justifyContent:"center" });

  // ── INPUT VIEW ────────────────────────────────────────────────────────────────
  if (view === "input") {
    return (
      <>
        <InputModal
          value={inputText} onChange={setInputText}
          onSubmit={() => {
            if (!inputText.trim() || engine.busy) return;
            const v = inputText; setInputText("");
            setView("map"); setTimeout(() => processWithAnim(v), 80);
          }}
          onClose={null} busy={engine.busy} isHome={true} theme={theme}
          onThemeToggle={() => setTheme(t => t === "dark" ? "light" : "dark")}
        />
        <style>{`* { box-sizing:border-box; } textarea::placeholder { color:${dark ? "rgba(0,255,136,0.3)" : "rgba(0,100,40,0.4)"}; }`}</style>
      </>
    );
  }

  // ── MAP VIEW ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ background:C.bg, color:C.text, fontFamily:"'Courier New',monospace", height:"100dvh", display:"flex", flexDirection:"column", overflow:"hidden" }}>

      {/* Floating top bar */}
      <div style={{ position:"absolute", top:0, left:0, right:0, zIndex:30, display:"flex", alignItems:"flex-start", justifyContent:"space-between", padding:"14px 14px 0", pointerEvents:"none" }}>
        <button onClick={() => setShowSidebar(true)}
          style={{ width:36, height:36, borderRadius:6, background: dark ? "rgba(9,9,9,0.88)" : "rgba(240,247,240,0.88)", backdropFilter:"blur(10px)", WebkitBackdropFilter:"blur(10px)", border:`1px solid ${C.border}`, color:C.accentDim, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", pointerEvents:"all" }}>
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>

        <div style={{ display:"flex", gap:1, background: dark ? "rgba(9,9,9,0.88)" : "rgba(240,247,240,0.88)", backdropFilter:"blur(10px)", WebkitBackdropFilter:"blur(10px)", border:`1px solid ${C.border}`, borderRadius:6, padding:"4px 5px", pointerEvents:"all" }}>
          <button onClick={exportSVG} style={iconBtn()}>
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
          </button>
          <button onClick={() => setTheme(t => t === "dark" ? "light" : "dark")} style={iconBtn()}>
            {dark ? <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
                   : <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>}
          </button>
          <button onClick={() => setShowReport(true)} style={iconBtn()}>
            <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </button>
          <button onClick={saveMap} disabled={!engine.tree.nodes.length} style={{ ...iconBtn(), color: engine.tree.nodes.length ? C.accentDim : C.accentFaint, cursor: engine.tree.nodes.length ? "pointer" : "default" }}>
            <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17,21 17,13 7,13 7,21"/><polyline points="7,3 7,8 15,8"/></svg>
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div style={{ flex:1, overflow:"hidden", position:"relative" }}>
        <MindMapCanvas
          svgRef={svgRef} gRef={gRef} transform={transform}
          tree={engine.tree} pos={pos} newNodeIds={newNodeIds} selectedId={selectedId}
          editMode={editMode} dark={dark} C={C} NS={NS}
        />

        {/* Edit context menu */}
        {editTarget && (
          <div style={{ position:"absolute", left: Math.min(editTarget.x, (svgRef.current?.clientWidth||400) - 170), top: Math.min(editTarget.y, (svgRef.current?.clientHeight||400) - 70), background:C.cardBg, border:`1px solid ${C.border}`, borderRadius:6, padding:"6px 8px", display:"flex", gap:6, zIndex:100, boxShadow:"0 4px 16px rgba(0,0,0,0.8)" }}>
            {[
              ["DEL", () => { engine.deleteNode(editTarget.id); setEditTarget(null); }],
              ["NOTE", () => { const nd = engine.treeRef.current.nodes.find(n => n.id === editTarget.id); const v = prompt("Редактировать:", nd?.note || ""); if (v !== null) engine.editNodeNote(editTarget.id, v); setEditTarget(null); }],
              ["✕",   () => setEditTarget(null)],
            ].map(([lbl, fn]) => (
              <button key={lbl} onClick={fn} style={{ background:C.cardBg, border:`1px solid ${C.border}`, color:C.accentDim, fontFamily:"'Courier New',monospace", fontSize:10, padding:"4px 10px", cursor:"pointer", letterSpacing:1, borderRadius:4 }}>{lbl}</button>
            ))}
          </div>
        )}

        {/* Bottom toolbar row */}
        <div style={{ position:"absolute", bottom:36, left:0, right:0, display:"flex", alignItems:"center", justifyContent:"center", gap:8, paddingLeft:14, paddingRight:14, zIndex:20, pointerEvents:"none" }}>
          {/* Star */}
          <button onClick={() => { engine.fetchRelated(); setShowRelated(true); }} title="Related"
            style={{ width:TOOLBAR_H, height:TOOLBAR_H, borderRadius:8, flexShrink:0, background: dark ? "rgba(9,9,9,0.88)" : "rgba(240,247,240,0.88)", backdropFilter:"blur(14px)", WebkitBackdropFilter:"blur(14px)", border:`1px solid ${C.border}`, color:C.accentDim, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", pointerEvents:"all" }}>
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
              <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/>
            </svg>
          </button>

          {/* Pill */}
          <div style={{ height:TOOLBAR_H, display:"flex", alignItems:"center", gap:0, background: dark ? "rgba(9,9,9,0.88)" : "rgba(240,247,240,0.88)", backdropFilter:"blur(14px)", WebkitBackdropFilter:"blur(14px)", border:`1px solid ${C.border}`, borderRadius:8, padding:"0 8px", pointerEvents:"all" }}>
            <button onClick={fit} style={pillBtn()}>
              <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M8 3H5a2 2 0 00-2 2v3M21 8V5a2 2 0 00-2-2h-3M16 21h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/></svg>
            </button>
            <button onClick={() => setEditMode(m => !m)} style={pillBtn(false, editMode)}>
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <div style={{ width:1, height:20, background:C.border, margin:"0 3px" }}/>
            <button onClick={() => navNode(-1)} style={pillBtn(!engine.tree.nodes.length)}>
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            </button>
            <button onClick={() => navNode(1)} style={pillBtn(!engine.tree.nodes.length)}>
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </button>
          </div>
        </div>

        <BusyOverlay visible={busyVisible} busy={engine.busy} dark={dark}/>
      </div>

      {/* Log */}
      <div ref={logRef} style={{ borderTop:`1px solid ${C.border}`, background:C.bgSub, maxHeight:"12vh", overflowY:"auto", padding:"4px 14px", flexShrink:0 }}>
        {log.map((l, i) => (
          <div key={i} style={{ fontSize:10, lineHeight:1.6, color: logColor[l.c] || "#aaa" }}>
            {l.t}{l.c === "b" && <span style={{ animation:"blink 0.5s step-end infinite" }}> ...</span>}
          </div>
        ))}
      </div>

      {/* Follow-up bar */}
      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 14px calc(8px + env(safe-area-inset-bottom)) 14px", borderTop:`1px solid ${C.border}`, background:C.bgSub, flexShrink:0 }}>
        <button onClick={engine.navBack} disabled={!engine.canBack} style={{ background:"transparent", border:"none", color: engine.canBack ? C.accentDim : C.accentFaint, fontSize:18, cursor: engine.canBack ? "pointer" : "default", padding:"0 2px", lineHeight:1 }}>←</button>
        <button onClick={engine.navForward} disabled={!engine.canFwd} style={{ background:"transparent", border:"none", color: engine.canFwd ? C.accentDim : C.accentFaint, fontSize:18, cursor: engine.canFwd ? "pointer" : "default", padding:"0 2px", lineHeight:1 }}>→</button>
        <button onClick={() => { setFollowText(""); setShowFollowUp(true); }}
          style={{ flex:1, background:C.cardBg, border:`1px solid ${C.border}`, color:C.textDim, fontFamily:"'Courier New',monospace", fontSize:13, padding:"10px 12px", cursor:"text", textAlign:"left", outline:"none", borderRadius:4 }}>
          {engine.busy ? "…" : "ask follow-up…"}
        </button>
        <button onClick={() => { setFollowText(""); setShowFollowUp(true); }}
          style={{ width:36, height:36, borderRadius:6, background:"transparent", border:`1px solid ${C.accentDim}`, color:C.accentDim, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", flexShrink:0 }}>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </button>
      </div>

      {/* Overlays */}
      {showFollowUp && (
        <InputModal value={followText} onChange={setFollowText}
          onSubmit={() => { if (!followText.trim() || engine.busy) return; const v = followText; setFollowText(""); setShowFollowUp(false); processWithAnim(v); }}
          onClose={() => setShowFollowUp(false)} busy={engine.busy} isHome={false} theme={theme}
          onThemeToggle={() => setTheme(t => t === "dark" ? "light" : "dark")}/>
      )}

      {showSidebar && (
        <SessionsSidebar sessions={engine.sessions}
          onSelect={s => { engine.loadSession(s); setShowSidebar(false); setView("map"); }}
          onDelete={engine.removeSession}
          onClose={() => setShowSidebar(false)}
          onNew={() => { setShowSidebar(false); setView("input"); setInputText(""); }}
          theme={theme}/>
      )}

      {showRelated && (
        <RelatedPanel topics={engine.relatedList} loading={engine.relatedLoad}
          onSelect={t => { setShowRelated(false); setTimeout(() => processWithAnim(t), 50); }}
          onClose={() => setShowRelated(false)} C={C}/>
      )}

      {showReport && (
        <ReportModal value={reportText} onChange={setReportText}
          onSubmit={() => { setShowReport(false); setReportText(""); onLog("o", "✓ report sent"); }}
          onClose={() => setShowReport(false)} C={C}/>
      )}

      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes nodeIn { from{opacity:0;transform:scale(0.5)} to{opacity:1;transform:scale(1)} }
        * { box-sizing:border-box; }
        input::placeholder, textarea::placeholder { color:rgba(0,255,136,0.3); }
        button { outline:none; }
      `}</style>
    </div>
  );
}