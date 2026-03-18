import { useEffect, useRef } from "react";

export default function usePointerControls({
  svgRef,
  posRef,
  setPos,
  tfmRef,
  applyTransform,
  flushTransform,

  // состояния
  editModeRef,
  setSelId,
  setEditId,
}) {
  const dragRef = useRef(null);
  const panRef = useRef(null);

  const rafRef = useRef(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    function scheduleUpdate() {
      if (rafRef.current) return;

      rafRef.current = requestAnimationFrame(() => {
        setPos({ ...posRef.current }); // 🔥 батч обновление
        rafRef.current = null;
      });
    }

    function onPointerDown(e) {
      const target = e.target.closest("[data-nodeid]");
      const nodeId = target?.getAttribute("data-nodeid");

      if (nodeId && editModeRef.current) {
        dragRef.current = {
          id: nodeId,
          startX: e.clientX,
          startY: e.clientY,
          orig: { ...posRef.current[nodeId] },
        };

        setSelId(nodeId);
        svg.setPointerCapture(e.pointerId);
        return;
      }

      // pan
      panRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        orig: { ...tfmRef.current },
      };

      svg.setPointerCapture(e.pointerId);
    }

    function onPointerMove(e) {
      // 🎯 DRAG NODE
      if (dragRef.current) {
        const d = dragRef.current;

        const dx = e.clientX - d.startX;
        const dy = e.clientY - d.startY;

        posRef.current[d.id] = {
          x: d.orig.x + dx,
          y: d.orig.y + dy,
        };

        scheduleUpdate();
        return;
      }

      // 🖐 PAN
      if (panRef.current) {
        const p = panRef.current;

        const dx = e.clientX - p.startX;
        const dy = e.clientY - p.startY;

        tfmRef.current = {
          ...p.orig,
          x: p.orig.x + dx,
          y: p.orig.y + dy,
        };

        applyTransform();
      }
    }

    function onPointerUp(e) {
      if (dragRef.current || panRef.current) {
        svg.releasePointerCapture(e.pointerId);
      }

      dragRef.current = null;
      panRef.current = null;
    }

    function onWheel(e) {
      e.preventDefault();

      const scaleFactor = 1.1;
      const dir = e.deltaY > 0 ? 1 / scaleFactor : scaleFactor;

      const tfm = tfmRef.current;

      const newScale = tfm.scale * dir;

      tfmRef.current = {
        ...tfm,
        scale: Math.max(0.2, Math.min(3, newScale)),
      };

      applyTransform();
    }

    svg.addEventListener("pointerdown", onPointerDown);
    svg.addEventListener("pointermove", onPointerMove);
    svg.addEventListener("pointerup", onPointerUp);
    svg.addEventListener("pointerleave", onPointerUp);
    svg.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      svg.removeEventListener("pointerdown", onPointerDown);
      svg.removeEventListener("pointermove", onPointerMove);
      svg.removeEventListener("pointerup", onPointerUp);
      svg.removeEventListener("pointerleave", onPointerUp);
      svg.removeEventListener("wheel", onWheel);

      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [
    svgRef,
    posRef,
    setPos,
    tfmRef,
    applyTransform,
    flushTransform,
    editModeRef,
    setSelId,
    setEditId,
  ]);
}