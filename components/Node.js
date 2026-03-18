import React, { useState, useEffect, useRef } from "react";

export default function Node({ id, x, y, selected, editing, posRef }) {
  const [value, setValue] = useState(id); 
  const inputRef = useRef(null);

  useEffect(() => { if(editing && inputRef.current) inputRef.current.focus(); }, [editing]);

  const handleDrag = (e) => {
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    const origX = posRef.current[id].x, origY = posRef.current[id].y;

    const onMove = (me) => { posRef.current[id].x = origX + (me.clientX - startX); posRef.current[id].y = origY + (me.clientY - startY); };
    const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <g transform={`translate(${x},${y})`} style={{ cursor:"grab" }} onMouseDown={handleDrag}>
      <circle r={30} fill={selected ? "#0ff" : "#222"} stroke="#0f0" strokeWidth={selected ? 3 : 1} />
      {editing ? (
        <foreignObject x={-25} y={-12} width={50} height={24}>
          <input ref={inputRef} value={value} onChange={e=>setValue(e.target.value)}
                 style={{ width:"50px", height:"24px", border:"none", outline:"none", background:"transparent", color:"#fff", textAlign:"center", fontSize:"12px"}}/>
        </foreignObject>
      ) : (
        <text textAnchor="middle" dy="4" fill="#fff" style={{ fontSize:"12px", userSelect:"none" }}>{value}</text>
      )}
    </g>
  );
}