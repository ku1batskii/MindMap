import { useEffect, useRef, useCallback } from "react";

export function useCanvasControls({ svgRef, gRef, onNodeLongPress }) {
  const transformRef = useRef({ x: 0, y: 0, scale: 1 });
  const posRef       = useRef({});
  const onPosChange  = useRef(null); // callback(newPos)

  const applyTransform = useCallback(t => {
    transformRef.current = t;
    if (gRef.current) gRef.current.style.transform = `translate(${t.x}px,${t.y}px) scale(${t.scale})`;
  }, [gRef]);

  const flushTransform = useCallback((t, setTransform) => {
    applyTransform(t);
    setTransform(t);
  }, [applyTransform]);

  // ── Wheel zoom ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const svg = svgRef.current; if (!svg) return;
    const onWheel = e => {
      e.preventDefault();
      const t = transformRef.current, f = e.deltaY < 0 ? 1.1 : 0.91;
      const rect = svg.getBoundingClientRect();
      const px = e.clientX - rect.left, py = e.clientY - rect.top;
      const ns = Math.min(5, Math.max(0.05, t.scale * f));
      applyTransform({ scale: ns, x: px - (ns / t.scale) * (px - t.x), y: py - (ns / t.scale) * (py - t.y) });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [svgRef, applyTransform]);

  // ── Pointer events ──────────────────────────────────────────────────────────
  useEffect(() => {
    const svg = svgRef.current; if (!svg) return;
    const ptrs = new Map();
    const mid = () => { const p = [...ptrs.values()]; return { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 }; };
    const pdist = () => { const p = [...ptrs.values()]; const dx = p[0].x - p[1].x, dy = p[0].y - p[1].y; return Math.sqrt(dx * dx + dy * dy); };
    let lastMid = null, lastDist = null, panStart = null, nodeDrag = null;
    let lpTimer = null, lpNodeId = null;

    const clearLP = () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } lpNodeId = null; };

    const onDown = e => {
      e.preventDefault();
      svg.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (ptrs.size === 1) {
        let el = e.target;
        while (el && el !== svg) {
          if (el.dataset?.nodeid) {
            const nid = el.dataset.nodeid;
            const p = posRef.current[nid] || { x: 0, y: 0 };
            nodeDrag = { id: nid, ox: p.x, oy: p.y, sx: e.clientX, sy: e.clientY };

            // Long-press → edit menu
            lpNodeId = nid;
            lpTimer = setTimeout(() => {
              const rect = svg.getBoundingClientRect();
              onNodeLongPress?.({ id: nid, x: e.clientX - rect.left, y: e.clientY - rect.top });
              nodeDrag = null;
            }, 450);
            return;
          }
          el = el.parentElement;
        }
        const t = transformRef.current;
        panStart = { ox: t.x, oy: t.y, sx: e.clientX, sy: e.clientY };
        lastMid = null; lastDist = null;
      } else if (ptrs.size === 2) {
        clearLP(); nodeDrag = null; panStart = null;
        lastMid = mid(); lastDist = pdist();
      }
    };

    const onMove = e => {
      if (!ptrs.has(e.pointerId)) return;
      e.preventDefault();
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (ptrs.size === 1 && nodeDrag) {
        const d = nodeDrag, dx = e.clientX - d.sx, dy = e.clientY - d.sy;
        if (Math.sqrt(dx * dx + dy * dy) > 6) clearLP(); // cancel long-press on move
        if (onPosChange.current) onPosChange.current(d.id, { x: d.ox + dx, y: d.oy + dy });
      } else if (ptrs.size === 1 && panStart) {
        clearLP();
        applyTransform({ ...transformRef.current, x: panStart.ox + (e.clientX - panStart.sx), y: panStart.oy + (e.clientY - panStart.sy) });
      } else if (ptrs.size === 2 && lastMid && lastDist) {
        clearLP();
        const t = transformRef.current, m = mid(), d = pdist(), r = svg.getBoundingClientRect();
        const px = m.x - r.left, py = m.y - r.top, ratio = d / lastDist;
        const ns = Math.min(5, Math.max(0.05, t.scale * ratio)), sf = ns / t.scale;
        applyTransform({ scale: ns, x: px - sf * (px - t.x) + (m.x - lastMid.x), y: py - sf * (py - t.y) + (m.y - lastMid.y) });
        lastMid = m; lastDist = d;
      }
    };

    const onUp = e => {
      e.preventDefault(); clearLP(); ptrs.delete(e.pointerId);
      if (ptrs.size === 1) {
        const [, rp] = [...ptrs.entries()][0];
        const t = transformRef.current;
        panStart = { ox: t.x, oy: t.y, sx: rp.x, sy: rp.y };
        lastMid = null; lastDist = null;
      }
      if (ptrs.size === 0) { nodeDrag = null; panStart = null; lastMid = null; lastDist = null; }
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
  }, [svgRef, applyTransform, onNodeLongPress]);

  return { transformRef, posRef, onPosChange, applyTransform, flushTransform };
}