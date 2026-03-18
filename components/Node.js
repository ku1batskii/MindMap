import React from "react";

function Node({
  node,
  pos,

  // состояния
  isSelected,
  isNavSelected,
  isEditing,
  isNew,

  // конфиг
  constants,
  theme,

  // функции
  wrap,
  nodeHeight,

  // события
  onPointerDown,
}) {
  if (!node || !pos) return null;

  const {
    NW,
    PAD_TOP,
    TITLE_LH,
    NOTE_LH,
    DIV_GAP,
    DIV_H,
    NOTE_GAP,
    TITLE_MAX,
    NOTE_MAX,
  } = constants;

  const { NS, C, dark } = theme;

  const ns = NS[node.type] || NS.idea;
  const h = nodeHeight(node.title, node.note);

  const tl = wrap(node.title || "", TITLE_MAX);
  const nl = wrap(node.note || "", NOTE_MAX);

  const TOP = -h / 2;

  return (
    <g
      transform={`translate(${pos.x},${pos.y})`}
      style={{
        cursor: "pointer",
        ...(isNew ? { animation: "nodeIn 0.35s ease-out" } : {}),
      }}
      data-nodeid={node.id}
      onPointerDown={(e) => onPointerDown(e, node)}
    >
      {/* selection outline */}
      {(isSelected || isNavSelected) && (
        <rect
          x={-NW / 2 - 3}
          y={TOP - 3}
          width={NW + 6}
          height={h + 6}
          rx={7}
          fill="none"
          stroke={C.accent}
          strokeWidth={2}
          opacity={0.85}
        />
      )}

      {/* edit mode outline */}
      {!isSelected && (
        <rect
          x={-NW / 2 - 2}
          y={TOP - 2}
          width={NW + 4}
          height={h + 4}
          rx={7}
          fill="none"
          stroke={C.accentFaint}
          strokeWidth={1}
          strokeDasharray="4 3"
        />
      )}

      {/* main rect */}
      <rect
        x={-NW / 2}
        y={TOP}
        width={NW}
        height={h}
        rx={6}
        fill={ns.fill}
        stroke={ns.stroke}
        strokeWidth={1.5}
        strokeDasharray={node.confidence === "low" ? "4 3" : undefined}
        opacity={node.confidence === "low" ? 0.75 : 1}
      />

      {/* title */}
      {tl.map((line, li) => (
        <text
          key={"t" + li}
          x={-NW / 2 + 9}
          y={TOP + PAD_TOP + TITLE_LH * 0.82 + li * TITLE_LH}
          fill={ns.color}
          fontSize={11}
          fontWeight="700"
          fontFamily="'Courier New', monospace"
          style={{ pointerEvents: "none" }}
        >
          {line}
        </text>
      ))}

      {/* divider */}
      {nl.length > 0 && (
        <line
          x1={-NW / 2 + 9}
          y1={TOP + PAD_TOP + tl.length * TITLE_LH + DIV_GAP}
          x2={NW / 2 - 9}
          y2={TOP + PAD_TOP + tl.length * TITLE_LH + DIV_GAP}
          stroke={ns.stroke}
          strokeWidth={0.5}
          opacity={0.3}
        />
      )}

      {/* note */}
      {nl.map((line, li) => {
        const dy =
          TOP +
          PAD_TOP +
          tl.length * TITLE_LH +
          DIV_GAP +
          DIV_H +
          NOTE_GAP +
          NOTE_LH * 0.82;

        return (
          <text
            key={"n" + li}
            x={-NW / 2 + 9}
            y={dy + li * NOTE_LH}
            fill={ns.color}
            fontSize={9.5}
            opacity={dark ? 0.62 : 0.75}
            fontFamily="'Courier New', monospace"
            style={{ pointerEvents: "none" }}
          >
            {line}
          </text>
        );
      })}

      {/* type label */}
      <text
        x={-NW / 2 + 7}
        y={h / 2 - 3}
        fill={ns.stroke}
        fontSize={6.5}
        opacity={0.35}
        letterSpacing={1}
        fontFamily="'Courier New', monospace"
        style={{ pointerEvents: "none" }}
      >
        {node.type.toUpperCase()}
      </text>

      {/* confidence dot */}
      <circle
        cx={NW / 2 - 9}
        cy={h / 2 - 6}
        r={2.5}
        fill={node.confidence === "high" ? ns.stroke : "none"}
        stroke={ns.stroke}
        strokeWidth={1}
        opacity={0.38}
        style={{ pointerEvents: "none" }}
      />
    </g>
  );
}

// 🔥 ключевая оптимизация
export default React.memo(
  Node,
  (prev, next) => {
    return (
      prev.node === next.node &&
      prev.pos === next.pos &&
      prev.isSelected === next.isSelected &&
      prev.isNavSelected === next.isNavSelected &&
      prev.isEditing === next.isEditing &&
      prev.isNew === next.isNew
    );
  }
);