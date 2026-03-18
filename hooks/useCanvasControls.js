import { useEffect, useRef, useCallback } from "react";

export function useCanvasControls({ svgRef, gRef, onNodeTap, onBackgroundTap }) {
  const transformRef  = useRef({ x: 0, y: 0, scale: 1 });
  const posRef        = useRef({});
  const onPosChange   = useRef(null);
  const onNodeTapRef  = useRef(onNodeTap);
  const onBgTapRef    = useRef(onBackgroundTap);
  // Keep callback refs fresh without re-running effects
  useEffect(() => { onNodeTapRef.current  = onNodeTap;    }, [onNodeTap]);
  useEffect(() => { onBgTapRef.current    = onBackgroundTap; }, [onBackgroundTap]);

  // setTransform from parent — injected so we can flush after pan ends
  const setTransformRef = useRef(null);

  const applyTransform = useCallback(t => {
    transformRef.current = t;
    if (gRef.current)
      gRef.current.style.transform = `translate(${t.x}px,${t.y}px) scale(${t.scale})`;
  }, [gRef]);

  const flushTransform = useCallback((t, setTransform) => {
    // store setter so onUp can call it
    if (setTransform) setTransformRef.current = setTransform;
    applyTransform(t);
    (setTransform || setTransformRef.current)?.(t);
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
      const next = { scale: ns, x: px - (ns / t.scale) * (px - t.x), y: py - (ns / t.scale) * (py - t.y) };
      applyTransform(next);
      setTransformRef.current?.(next);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [svgRef, applyTransform]);

  // ── Pointer events (stable — no external deps in closure) ───────────────────
  useEffect(() => {
    const svg = svgRef.current; if (!svg) return;
    const ptrs = new Map();

    const mid = () => {
      const p = [...ptrs.values()];
      return { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 };
    };
    const pdist = () => {
      const p = [...ptrs.values()];
      const dx = p[0].x - p[1].x, dy = p[0].y - p[1].y;
      return Math.sqrt(dx * dx + dy * dy);
    };

    let lastMid = null, lastDist = null, panStart = null, nodeDrag = null;

    const onDown = e => {
      e.preventDefault();
      svg.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (ptrs.size === 1) {
        // Find node under finger
        let el = e.target, foundNode = null;
        while (el && el !== svg) {
          if (el.dataset?.nodeid) { foundNode = el.dataset.nodeid; break; }
          el = el.parentElement;
        }

        if (foundNode) {
          const p = posRef.current[foundNode] || { x: 0, y: 0 };
          nodeDrag = { id: foundNode, ox: p.x, oy: p.y, sx: e.clientX, sy: e.clientY, moved: false };
        } else {
          const t = transformRef.current;
          panStart = { ox: t.x, oy: t.y, sx: e.clientX, sy: e.clientY };
          lastMid = null; lastDist = null;
        }

      } else if (ptrs.size === 2) {
        nodeDrag = null; panStart = null;
        lastMid = mid(); lastDist = pdist();
      }
    };

    const onMove = e => {
      if (!ptrs.has(e.pointerId)) return;
      e.preventDefault();
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (ptrs.size === 1 && nodeDrag) {
        const d = nodeDrag, dx = e.clientX - d.sx, dy = e.clientY - d.sy;
        if (Math.sqrt(dx * dx + dy * dy) > 8) nodeDrag.moved = true;
        onPosChange.current?.(d.id, { x: d.ox + dx, y: d.oy + dy });

      } else if (ptrs.size === 1 && panStart) {
        const next = {
          ...transformRef.current,
          x: panStart.ox + (e.clientX - panStart.sx),
          y: panStart.oy + (e.clientY - panStart.sy),
        };
        applyTransform(next); // DOM only during move (perf)

      } else if (ptrs.size === 2 && lastMid && lastDist) {
        const t = transformRef.current, m = mid(), d = pdist();
        const r = svg.getBoundingClientRect();
        const px = m.x - r.left, py = m.y - r.top, ratio = d / lastDist;
        const ns = Math.min(5, Math.max(0.05, t.scale * ratio)), sf = ns / t.scale;
        const next = {
          scale: ns,
          x: px - sf * (px - t.x) + (m.x - lastMid.x),
          y: py - sf * (py - t.y) + (m.y - lastMid.y),
        };
        applyTransform(next);
        lastMid = m; lastDist = d;
      }
    };

    const onUp = e => {
      e.preventDefault();
      ptrs.delete(e.pointerId);

      if (ptrs.size === 0) {
        // Flush final transform to React state
        setTransformRef.current?.(transformRef.current);

        if (nodeDrag && !nodeDrag.moved) {
          onNodeTapRef.current?.(nodeDrag.id);
        } else if (!nodeDrag && !panStart?.moved) {
          // tap on background (not a drag pan)
          const dx = e.clientX - (panStart?.sx ?? e.clientX);
          const dy = e.clientY - (panStart?.sy ?? e.clientY);
          if (Math.sqrt(dx * dx + dy * dy) < 8) {
            onBgTapRef.current?.();
          }
        }

        nodeDrag = null; panStart = null; lastMid = null; lastDist = null;
      }

      if (ptrs.size === 1) {
        const [, rp] = [...ptrs.entries()][0];
        const t = transformRef.current;
        panStart = { ox: t.x, oy: t.y, sx: rp.x, sy: rp.y };
        lastMid = null; lastDist = null;
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [svgRef, applyTransform]); // stable — callbacks accessed via refs

  return { transformRef, posRef, onPosChange, applyTransform, flushTransform };
}