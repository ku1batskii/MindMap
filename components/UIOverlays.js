import { useEffect, useRef } from "react";
import { trunc } from "../lib/mindmap-utils.js";

// ── Matrix Rain ───────────────────────────────────────────────────────────────
export function MatrixRain({ opacity = 1 }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext("2d"); let id;
    const resize = () => { c.width = window.innerWidth; c.height = window.innerHeight; };
    resize(); window.addEventListener("resize", resize);
    const cols = Math.floor(c.width / 13);
    const drops = Array(cols).fill(0).map(() => Math.random() * c.height / 13);
    const draw = () => {
      ctx.fillStyle = "rgba(0,0,0,0.055)"; ctx.fillRect(0, 0, c.width, c.height);
      ctx.font = "12px 'Courier New',monospace";
      drops.forEach((y, i) => {
        ctx.fillStyle = Math.random() > 0.92 ? "rgba(180,255,180,0.95)" : "rgba(0,255,65,0.52)";
        ctx.fillText(Math.random() > 0.5 ? "1" : "0", i * 13, y * 13);
        if (y * 13 > c.height && Math.random() > 0.975) drops[i] = 0;
        drops[i] += 0.55 + Math.random() * 0.45;
      });
      id = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(id); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={ref} style={{ position:"absolute", inset:0, width:"100%", height:"100%", pointerEvents:"none", zIndex:0, opacity }}/>;
}

// ── InputModal ────────────────────────────────────────────────────────────────
export function InputModal({ value, onChange, onSubmit, onClose, busy, isHome, theme, onThemeToggle }) {
  const taRef = useRef(null);
  useEffect(() => { setTimeout(() => taRef.current?.focus(), 120); }, []);
  const dark = theme === "dark";
  const ac = dark ? "#00ff88" : "#006622";
  const faint = dark ? "rgba(0,255,136,0.22)" : "rgba(0,180,80,0.3)";

  return (
    <div style={{ position:"fixed", inset:0, zIndex:300, background: dark ? "#000" : "#e8f5ec", display:"flex", flexDirection:"column", overflow:"hidden" }}>
      <MatrixRain opacity={dark ? 1 : 0.18}/>
      {/* Header */}
      <div style={{ position:"relative", zIndex:1, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 16px", borderBottom:`1px solid ${faint}`, flexShrink:0 }}>
        <span style={{ fontSize:9, color: dark ? "rgba(0,255,136,0.45)" : "rgba(0,100,40,0.6)", letterSpacing:4, fontFamily:"'Courier New',monospace" }}>
          {isHome ? "MIND MAP" : "INPUT"}
        </span>
        {isHome ? (
          <button onClick={onThemeToggle} style={{ width:30, height:30, borderRadius:5, background:"transparent", border:`1px solid ${faint}`, color: dark ? "rgba(0,255,136,0.7)" : "rgba(0,120,50,0.8)", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
            {dark
              ? <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
              : <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
            }
          </button>
        ) : (
          <button onClick={onClose} style={{ background:"transparent", border:`1px solid ${faint}`, color: dark ? "rgba(0,255,136,0.7)" : "rgba(0,120,50,0.8)", fontFamily:"'Courier New',monospace", fontSize:9, padding:"4px 12px", cursor:"pointer", letterSpacing:2, borderRadius:4 }}>
            ✕ CLOSE
          </button>
        )}
      </div>
      {/* Body */}
      <div style={{ position:"relative", zIndex:1, flex:1, display:"flex", flexDirection:"column", padding:"20px 16px 16px", gap:14 }}>
        <textarea
          ref={taRef} value={value} onChange={e => onChange(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.metaKey) { e.preventDefault(); onSubmit(); } }}
          placeholder="вставь текст или идею…"
          style={{ flex:1, background: dark ? "rgba(0,0,0,0.72)" : "rgba(255,255,255,0.72)", border:`1px solid ${faint}`, color: dark ? "#00ff88" : "#003d18", fontFamily:"'Courier New',monospace", fontSize:15, lineHeight:1.65, padding:"16px", outline:"none", resize:"none", caretColor:ac, borderRadius:6 }}
        />
        <button onClick={onSubmit} disabled={busy || !value.trim()}
          style={{ background:"transparent", border:`1px solid ${busy || !value.trim() ? faint : ac}`, color: busy || !value.trim() ? faint : (dark ? "#00ff88" : "#003d18"), fontFamily:"'Courier New',monospace", fontSize:11, padding:"14px", cursor: busy || !value.trim() ? "not-allowed" : "pointer", letterSpacing:3, borderRadius:6, opacity: busy || !value.trim() ? 0.4 : 1 }}>
          {busy ? "ГЕНЕРИРУЮ…" : "↳ GENERATE MAP"}
        </button>
      </div>
    </div>
  );
}

// ── SessionsSidebar ───────────────────────────────────────────────────────────
export function SessionsSidebar({ sessions, onSelect, onDelete, onClose, onNew, theme }) {
  const dark = theme === "dark";
  const bg     = dark ? "#0a120a" : "#e8f5e8";
  const border = dark ? "#1e4428" : "#4a8a5a";
  const text   = dark ? "#00ff88" : "#004d18";
  const textDim= dark ? "rgba(0,255,136,0.45)" : "rgba(0,80,30,0.5)";
  const cardBg = dark ? "#0f1a0f" : "#d0e8d0";

  return (
    <>
      <div onClick={onClose} style={{ position:"fixed", inset:0, zIndex:190, background:"rgba(0,0,0,0.55)" }}/>
      <div style={{ position:"fixed", top:0, left:0, bottom:0, width:"78vw", maxWidth:310, zIndex:200, background:bg, borderRight:`1px solid ${border}`, display:"flex", flexDirection:"column" }}>
        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 14px 12px", borderBottom:`1px solid ${border}`, flexShrink:0 }}>
          <span style={{ fontSize:10, letterSpacing:4, color:textDim, fontFamily:"'Courier New',monospace" }}>SESSIONS</span>
          <button onClick={onClose} style={{ background:"none", border:"none", color:textDim, fontSize:20, cursor:"pointer", lineHeight:1 }}>✕</button>
        </div>
        {/* New map */}
        <button onClick={onNew}
          style={{ display:"flex", alignItems:"center", gap:10, margin:"10px 12px 4px", padding:"10px 12px", background:"none", border:`1px solid ${border}`, color:text, fontFamily:"'Courier New',monospace", fontSize:11, cursor:"pointer", borderRadius:6, letterSpacing:1 }}>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
          New map
        </button>
        {/* List */}
        <div style={{ flex:1, overflowY:"auto", padding:"4px 0" }}>
          {sessions.length === 0 && (
            <div style={{ padding:"24px 16px", fontSize:11, color:textDim, fontFamily:"'Courier New',monospace", textAlign:"center" }}>No saved sessions yet</div>
          )}
          {sessions.map(s => (
            <div key={s.id} style={{ display:"flex", alignItems:"center", borderBottom:`1px solid ${border}`, margin:"0 12px" }}>
              <button onClick={() => onSelect(s)}
                style={{ flex:1, background:"none", border:"none", color:text, fontFamily:"'Courier New',monospace", fontSize:12, textAlign:"left", padding:"12px 4px", cursor:"pointer", lineHeight:1.3 }}>
                <div style={{ fontSize:12, marginBottom:2 }}>{trunc(s.goal || "Untitled", 26)}</div>
                <div style={{ fontSize:9, color:textDim }}>{new Date(s.ts).toLocaleDateString()} · {s.nodeCount} nodes</div>
              </button>
              <button onClick={() => onDelete(s.id)}
                style={{ background:"none", border:"none", color:textDim, fontSize:18, cursor:"pointer", padding:"8px 8px", flexShrink:0 }}>×</button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ── BusyOverlay ───────────────────────────────────────────────────────────────
export function BusyOverlay({ visible, busy, dark }) {
  if (!visible) return null;
  return (
    <div style={{ position:"absolute", inset:0, zIndex:10, opacity: busy ? 1 : 0, transition: busy ? "opacity 0.25s ease-in" : "opacity 0.55s ease-out", pointerEvents: busy ? "all" : "none" }}>
      <MatrixRain opacity={dark ? 0.92 : 0.18}/>
      <div style={{ position:"absolute", inset:0, zIndex:1, background: dark ? "rgba(0,0,0,0.55)" : "rgba(220,245,225,0.72)", display:"flex", alignItems:"center", justifyContent:"center" }}>
        <div style={{ fontFamily:"'Courier New',monospace", fontSize:10, color: dark ? "rgba(0,255,136,0.8)" : "rgba(0,80,30,0.8)", letterSpacing:5, animation:"blink 0.7s step-end infinite" }}>ГЕНЕРИРУЮ</div>
      </div>
    </div>
  );
}

// ── RelatedPanel ──────────────────────────────────────────────────────────────
export function RelatedPanel({ topics, loading, onSelect, onClose, C }) {
  return (
    <div style={{ position:"fixed", inset:0, zIndex:200, background:"rgba(0,0,0,0.72)", display:"flex", alignItems:"flex-end" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width:"100%", background:C.bg, border:`1px solid ${C.border}`, borderRadius:"8px 8px 0 0", padding:"20px 16px calc(24px + env(safe-area-inset-bottom))", maxHeight:"65vh", overflowY:"auto" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
          <span style={{ fontSize:9, letterSpacing:4, color:C.textDim }}>RELATED TOPICS</span>
          <button onClick={onClose} style={{ background:"none", border:"none", color:C.accentDim, fontSize:20, cursor:"pointer", lineHeight:1 }}>✕</button>
        </div>
        {loading && <div style={{ fontSize:11, color:C.textDim }}><span style={{ animation:"blink 0.5s step-end infinite" }}>generating…</span></div>}
        {topics.map((topic, i) => (
          <button key={i} onClick={() => onSelect(topic)}
            style={{ display:"flex", alignItems:"center", justifyContent:"space-between", width:"100%", padding:"13px 0", background:"none", border:"none", borderBottom:`1px solid ${C.border}`, cursor:"pointer", color:C.text, fontSize:12, fontFamily:"'Courier New',monospace", textAlign:"left" }}>
            <span>{topic}</span><span style={{ color:C.accentDim, fontSize:16 }}>→</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── ReportModal ───────────────────────────────────────────────────────────────
export function ReportModal({ value, onChange, onSubmit, onClose, C }) {
  return (
    <div style={{ position:"fixed", inset:0, zIndex:200, background:"rgba(0,0,0,0.72)", display:"flex", alignItems:"flex-end" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width:"100%", background:C.bg, border:`1px solid ${C.border}`, borderRadius:"8px 8px 0 0", padding:"24px 16px calc(28px + env(safe-area-inset-bottom))" }}>
        <div style={{ fontSize:11, fontWeight:700, letterSpacing:2, marginBottom:6, color:C.accent }}>MIND MAP ISSUE?</div>
        <div style={{ fontSize:10, color:C.textDim, marginBottom:16 }}>Describe what went wrong.</div>
        <textarea value={value} onChange={e => onChange(e.target.value)} placeholder="Describe the issue…" rows={4}
          style={{ width:"100%", background:C.cardBg, border:`1px solid ${C.border}`, color:C.text, fontFamily:"'Courier New',monospace", fontSize:12, padding:"10px 12px", outline:"none", resize:"none", boxSizing:"border-box", borderRadius:4 }}/>
        <div style={{ display:"flex", gap:10, marginTop:14 }}>
          <button onClick={onClose} style={{ flex:1, background:"transparent", border:`1px solid ${C.border}`, color:C.accentDim, fontFamily:"'Courier New',monospace", fontSize:10, padding:"11px 0", cursor:"pointer", letterSpacing:2, borderRadius:4 }}>CANCEL</button>
          <button onClick={onSubmit} style={{ flex:1, background:"transparent", border:`1px solid ${C.accent}`, color:C.accent, fontFamily:"'Courier New',monospace", fontSize:10, padding:"11px 0", cursor:"pointer", letterSpacing:2, borderRadius:4 }}>SUBMIT</button>
        </div>
      </div>
    </div>
  );
}