import React, { useRef, useEffect } from "react";

function Node({
  node,
  pos,
  isSelected,
  isEditing,
  onPointerDown,
  onDoubleClick,
  onChangeTitle,
  onChangeNote,
}) {
  const ref = useRef(null);

  // ⚡ прямое обновление позиции без лишних ререндеров
  useEffect(() => {
    if (!ref.current || !pos) return;
    ref.current.setAttribute(
      "transform",
      `translate(${pos.x || 0}, ${pos.y || 0})`
    );
  }, [pos]);

  if (!node) return null;

  const { id, title, note, type } = node;

  // 🎨 стили (можешь потом вынести в CSS)
  const styles = {
    idea: {
      fill: "#002a38",
      stroke: "#00d4ff",
      color: "#33eeff",
    },
    subgoal: {
      fill: "#00210f",
      stroke: "#00ff55",
      color: "#00ffaa",
    },
    step: {
      fill: "#181e18",
      stroke: "#88bb88",
      color: "#aaffaa",
    },
  };

  const style = styles[type] || styles.step;

  return (
    <g
      ref={ref}
      onPointerDown={(e) => onPointerDown(e, node)}
      onDoubleClick={() => onDoubleClick(node)}
      style={{ cursor: "pointer" }}
    >
      {/* рамка */}
      <rect
        x={-80}
        y={-30}
        width={160}
        height={60}
        rx={10}
        fill={style.fill}
        stroke={isSelected ? "#ffffff" : style.stroke}
        strokeWidth={isSelected ? 2 : 1}
      />

      {/* текст */}
      {!isEditing && (
        <text
          x="0"
          y="0"
          textAnchor="middle"
          dominantBaseline="middle"
          fill={style.color}
          fontSize="12"
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          {title}
        </text>
      )}

      {/* ✏️ режим редактирования */}
      {isEditing && (
        <foreignObject x={-75} y={-25} width={150} height={50}>
          <textarea
            autoFocus
            defaultValue={title}
            onChange={(e) => onChangeTitle(id, e.target.value)}
            style={{
              width: "100%",
              height: "100%",
              fontSize: "12px",
              background: "#111",
              color: "#fff",
              border: "1px solid #555",
              borderRadius: "6px",
              resize: "none",
              outline: "none",
            }}
          />
        </foreignObject>
      )}
    </g>
  );
}

// 🔥 КРИТИЧНО: мемоизация
export default React.memo(
  Node,
  (prev, next) => {
    return (
      prev.node === next.node &&
      prev.pos === next.pos &&
      prev.isSelected === next.isSelected &&
      prev.isEditing === next.isEditing
    );
  }
);