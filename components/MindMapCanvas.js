import { useRef, useEffect, useCallback } from "react";
import {
  NW, RW, RH, TITLE_MAX_CHARS, NOTE_MAX_CHARS,
  PAD_TOP, TITLE_LH, DIV_GAP, DIV_H, NOTE_GAP, NOTE_LH,
  wrapText, nodeHeight, trunc,
} from "../lib/mindmap-utils.js";

export default function MindMapCanvas({
  svgRef, gRef, transform, tree, pos, newNodeIds, selectedId,
  editMode, dark, C, NS,
  onNodeLongPress,
}) {
  const edges = [];

  if (tree.goal) {
    const rp = pos["ROOT"];
    tree.nodes.filter(n => !n.parentId).forEach(n => {
      const p = pos[n.id], nh = nodeHeight(n.title, n.note);
      if (rp && p) {
        const dx = p.x - rp.x, dy = p.y - rp.y;
        let sx, sy, tx, ty;
        if (Math.abs(dx) >= Math.abs(dy)) {
          sx = dx >= 0 ? rp.x + NW/2 : rp.x - NW/2; sy = rp.y;
          tx = dx >= 0 ? p.x - NW/2 : p.x + NW/2; ty = p.y;
        } else {
          sx = rp.x; sy = dy >= 0 ? rp.y + RH/2 : rp.y - RH/2;
          tx = p.x; ty = dy >= 0 ? p.y - nh/2 : p.y + nh/2;
        }
        edges.push({ id: "r-" + n.id, sx, sy, tx, ty });
      }
    });
  }
  tree.nodes.forEach(n => {
    if (!n.parentId) return;
    const pp = pos[n.parentId], cp = pos[n.id];
    const pN = tree.nodes.find(x => x.id === n.parentId);
    const pnh = nodeHeight(pN?.title, pN?.note), cnh = nodeHeight(n.title, n.note);
    if (pp && cp) {
      const dx = cp.x - pp.x, dy = cp.y - pp.y;
      let sx, sy, tx, ty;
      if (Math.abs(dx) >= Math.abs(dy)) {
        sx = dx >= 0 ? pp.x + NW/2 : pp.x - NW/2; sy = pp.y;
        tx = dx >= 0 ? cp.x - NW/2 : cp.x + NW/2; ty = cp.y;
      } else {
        sx = pp.x; sy = dy >= 0 ? pp.y + pnh/2 : pp.y - pnh/2;
        tx = cp.x; ty = dy >= 0 ? cp.y - cnh/2 : cp.y + cnh/2;
      }
      edges.push({ id: n.parentId + "-" + n.id, sx, sy, tx, ty });
    }
  });

  const edgeColor = dark ? "rgba(0,220,100,0.28)" : "rgba(0,100,40,0.3)";
  const arrowColor = dark ? "rgba(0,220,100,0.38)" : "rgba(0,100,40,0.4)";

  return (
    <svg
      ref={svgRef}
      style={{ width:"100%", height:"100%", position:"absolute", inset:0, cursor: editMode ? "crosshair" : "grab", touchAction:"none" }}
    >
      <defs>
        <marker id="arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill={arrowColor}/>
        </marker>
        <pattern id="dots" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
          <circle cx="14" cy="14" r="0.7" fill={C.dots}/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#dots)"/>

      <g ref={gRef} style={{ transform: `translate(${transform.x}px,${transform.y}px) scale(${transform.scale})`, willChange:"transform", transformOrigin:"0 0" }}>

        {/* Edges */}
        {edges.map(e => {
          const isH = Math.abs(e.tx - e.sx) >= Math.abs(e.ty - e.sy);
          const mx = (e.sx + e.tx) / 2, my = (e.sy + e.ty) / 2;
          const d = isH
            ? `M${e.sx},${e.sy} C${mx},${e.sy} ${mx},${e.ty} ${e.tx},${e.ty}`
            : `M${e.sx},${e.sy} C${e.sx},${my} ${e.tx},${my} ${e.tx},${e.ty}`;
          return <path key={e.id} d={d} fill="none" stroke={edgeColor} strokeWidth="1.2" markerEnd="url(#arr)"/>;
        })}

        {/* Root node */}
        {tree.goal && pos["ROOT"] && (
          <g transform={`translate(${pos["ROOT"].x},${pos["ROOT"].y})`} data-nodeid="ROOT" style={{cursor:"grab"}}>
            <rect x={-RW/2} y={-RH/2} width={RW} height={RH} rx={6} fill={C.cardBg} stroke={C.accent} strokeWidth={1.5}/>
            <text textAnchor="middle" dominantBaseline="middle" fill={C.accent} fontSize={11} fontFamily="'Courier New',monospace" style={{pointerEvents:"none"}}>
              {trunc(tree.goal, 25)}
            </text>
          </g>
        )}

        {/* Nodes */}
        {tree.nodes.map(n => {
          const p = pos[n.id]; if (!p) return null;
          const ns = NS[n.type] || NS.idea;
          const nh = nodeHeight(n.title, n.note);
          const tl = wrapText(n.title || "", TITLE_MAX_CHARS);
          const nl = wrapText(n.note  || "", NOTE_MAX_CHARS);
          const TOP = -nh / 2;
          const isNew = newNodeIds.has(n.id);
          const isSel = selectedId === n.id;

          return (
            <g
              key={n.id}
              transform={`translate(${p.x},${p.y})`}
              style={{ cursor:"grab", ...(isNew ? { animation:"nodeIn 0.35s ease-out" } : {}) }}
              data-nodeid={n.id}
            >
              {isSel && (
                <rect x={-NW/2-3} y={TOP-3} width={NW+6} height={nh+6} rx={7}
                  fill="none" stroke={C.accent} strokeWidth={1.5} opacity={0.5}/>
              )}
              <rect
                x={-NW/2} y={TOP} width={NW} height={nh} rx={6}
                fill={ns.fill}
                stroke={editMode ? "rgba(0,255,136,0.55)" : ns.stroke}
                strokeWidth={editMode ? 2 : 1.5}
                strokeDasharray={n.confidence === "low" ? "4 3" : undefined}
                opacity={n.confidence === "low" ? 0.75 : 1}
              />
              {/* Title */}
              {tl.map((line, li) => (
                <text key={"t"+li}
                  x={-NW/2+9} y={TOP + PAD_TOP + TITLE_LH*0.82 + li*TITLE_LH}
                  fill={ns.color} fontSize={11} fontWeight="700"
                  fontFamily="'Courier New',monospace" style={{pointerEvents:"none"}}>
                  {line}
                </text>
              ))}
              {/* Divider */}
              {nl.length > 0 && (
                <line
                  x1={-NW/2+9} y1={TOP + PAD_TOP + tl.length*TITLE_LH + DIV_GAP}
                  x2={NW/2-9}  y2={TOP + PAD_TOP + tl.length*TITLE_LH + DIV_GAP}
                  stroke={ns.stroke} strokeWidth={0.5} opacity={0.3}/>
              )}
              {/* Note */}
              {nl.map((line, li) => {
                const dy = TOP + PAD_TOP + tl.length*TITLE_LH + DIV_GAP + DIV_H + NOTE_GAP + NOTE_LH*0.82;
                return (
                  <text key={"n"+li} x={-NW/2+9} y={dy + li*NOTE_LH}
                    fill={ns.color} fontSize={9.5} opacity={dark ? 0.62 : 0.75}
                    fontFamily="'Courier New',monospace" style={{pointerEvents:"none"}}>
                    {line}
                  </text>
                );
              })}
              {/* Type badge */}
              <text textAnchor="start" x={-NW/2+7} y={nh/2-3}
                fill={ns.stroke} fontSize={6.5} opacity={0.35} letterSpacing={1}
                fontFamily="'Courier New',monospace" style={{pointerEvents:"none"}}>
                {n.type.toUpperCase()}
              </text>
              {/* Confidence dot */}
              <circle cx={NW/2-9} cy={nh/2-6} r={2.5}
                fill={n.confidence === "high" ? ns.stroke : "none"}
                stroke={ns.stroke} strokeWidth={1} opacity={0.38}
                style={{pointerEvents:"none"}}/>
            </g>
          );
        })}
      </g>
    </svg>
  );
}