// ─── Imports ────────────────────────────────────────────────────────────────
import usePointerControls from "../hooks/usePointerControls";
import Node from "./Node";
import CLIENT_CONFIG from '../config.js';
import { useState, useEffect, useRef, useCallback } from "react";

// ─── Constants ──────────────────────────────────────────────────────────────
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

const NW=158, RW=196, RH=46;
const TITLE_MAX=14, NOTE_MAX=17;
const PAD_TOP=8, TITLE_LH=15, DIV_GAP=4, DIV_H=1, NOTE_GAP=5, NOTE_LH=12, BADGE_H=12, PAD_BOT=7;
const LS_KEY = "mindmap_sessions_v2";

// ─── Utilities ─────────────────────────────────────────────────────────────
function wrap(text, max) {
  const words=(text||"").split(" "); let lines=[], cur="";
  for (const w of words) {
    const c=cur?cur+" "+w:w;
    if (c.length<=max){cur=c;}else{if(cur)lines.push(cur);cur=w;}
  }
  if(cur)lines.push(cur);
  return lines.map(l=>l.length>max?l.slice(0,max)+"-":l);
}

function nh(title,note) {
  const tl=Math.max(wrap(title||"",TITLE_MAX).length,1);
  const nl=note?wrap(note,NOTE_MAX).length:0;
  return PAD_TOP+tl*TITLE_LH+(nl>0?DIV_GAP+DIV_H+NOTE_GAP+nl*NOTE_LH:DIV_GAP)+BADGE_H+PAD_BOT;
}

function uid(){return "n"+(Date.now()%1e9)+"_"+Math.floor(Math.random()*999);}
function trunc(s,n){return s&&s.length>n?s.slice(0,n)+"…":s||"";}

function smartTitle(note){
  if(!note)return"Идея";
  const stop=new Set(["я","мой","моя","мне","это","как","что","для","все","они","его","или","но","и","в","на","по","от","до"]);
  const words=(note||"").split(" ").filter(w=>w.length>2&&!stop.has(w.toLowerCase()));
  return words.slice(0,3).join(" ")||note.split(" ").slice(0,3).join(" ");
}

function fallback(input){
  const lines=input.split(/[.\n!?]/).map(l=>l.trim()).filter(l=>l.length>2).slice(0,8);
  const src=lines.length?lines:[input.trim()];
  return{
    goal: input.slice(0,50),
    nodes: src.map(l=>({id:uid(),title:l.split(" ").slice(0,3).join(" "),note:l,type:"idea",confidence:"medium",parentId:null}))
  };
}

// ─── Session & Layout Utilities ─────────────────────────────────────────────
function loadSession() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)||"{}"); }
  catch(e){ return {}; }
}

function saveSession(session) {
  localStorage.setItem(LS_KEY, JSON.stringify(session));
}

// ─── Layout helpers ────────────────────────────────────────────────────────
function getC(node){
  const {x=0,y=0}=node; return {x,y};
}

function fitAll(nodes, width=800, height=600){
  if(!nodes||!nodes.length)return nodes;
  let minX=Math.min(...nodes.map(n=>n.x)), minY=Math.min(...nodes.map(n=>n.y));
  let maxX=Math.max(...nodes.map(n=>n.x)), maxY=Math.max(...nodes.map(n=>n.y));
  const scaleX=width/(maxX-minX||1), scaleY=height/(maxY-minY||1);
  const scale=Math.min(scaleX, scaleY)*0.9;
  return nodes.map(n=>({
    ...n,
    x:(n.x-minX)*scale + width*0.05,
    y:(n.y-minY)*scale + height*0.05
  }));
}

// ─── Node Tree Helpers ────────────────────────────────────────────────────
function getDescendants(nodes,parentId){
  let result=[];
  function walk(id){
    const children=nodes.filter(n=>n.parentId===id);
    for(const c of children){ result.push(c); walk(c.id); }
  }
  walk(parentId);
  return result;
}

function buildRadial(nodes, rootId, radius=120, angleStart=0, angleEnd=2*Math.PI){
  const root=nodes.find(n=>n.id===rootId); if(!root)return nodes;
  const children=nodes.filter(n=>n.parentId===rootId);
  const angleStep=(angleEnd-angleStart)/(children.length||1);
  children.forEach((child,i)=>{
    const angle=angleStart + i*angleStep + angleStep/2;
    child.x=root.x + radius*Math.cos(angle);
    child.y=root.y + radius*Math.sin(angle);
    buildRadial(nodes, child.id, radius*0.8, angle-0.5*angleStep, angle+0.5*angleStep);
  });
  return nodes;
}

// ─── MindMap Component ──────────────────────────────────────────────────────
import { useState, useRef, useEffect, useCallback } from "react";
import Node from "./Node";  // твой компонент Node
import usePointerControls from "../hooks/usePointerControls";

export default function MindMap({initialTree}) {
  const [tree, setTree] = useState(initialTree || {goal:"", nodes:[]});
  const treeRef = useRef(tree);
  const [pos, setPos] = useState({});
  const posRef = useRef({});
  const svgRef = useRef(null);

  // ─── Keep refs in sync ─────────────────────────────────────────────────────
  useEffect(()=>{treeRef.current=tree;},[tree]);
  useEffect(()=>{posRef.current=pos;},[pos]);

  // ─── Layout / Recalculate positions ───────────────────────────────────────
  const reLayout=useCallback(()=>{
    if(!tree.nodes.length) return;
    const root={x:400, y:300, id:"ROOT"};
    const nodesWithRoot=[...tree.nodes,{...root}];
    const radial=buildRadial(nodesWithRoot,"ROOT",180);
    const fitted=fitAll(radial, window.innerWidth, window.innerHeight-100);
    setPos(Object.fromEntries(fitted.map(n=>[n.id,{x:n.x,y:n.y}])));
  },[tree]);

  useEffect(()=>{reLayout();},[tree]);

  // ─── Pointer Controls ─────────────────────────────────────────────────────
  usePointerControls(svgRef, treeRef, posRef, setPos);

  // ─── Node Selection & Edit ───────────────────────────────────────────────
  const [selId,setSelId] = useState(null);
  const [editId,setEditId] = useState(null);
  const [editTxt,setEditTxt] = useState("");
  const editRef = useRef(null);

  const startEdit=useCallback((id)=>{
    const node=tree.nodes.find(n=>n.id===id);
    if(!node) return;
    setSelId(id); setEditId(id); setEditTxt(node.note||"");
    setTimeout(()=>editRef.current?.focus(),50);
  },[tree]);

  const commitEdit=useCallback(()=>{
    if(editId){
      setTree(prev=>({
        ...prev,
        nodes: prev.nodes.map(n=>n.id===editId ? {...n, note: editTxt} : n)
      }));
      setEditId(null);
    }
  },[editId, editTxt]);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{position:"relative", width:"100%", height:"100vh", overflow:"hidden"}}>
      <svg ref={svgRef} style={{width:"100%", height:"100%"}}>
        {/* Render edges */}
        {tree.nodes.map(n=>{
          if(!n.parentId) return null;
          const p=pos[n.parentId]; const c=pos[n.id];
          if(!p||!c) return null;
          return <line key={n.id} x1={p.x} y1={p.y} x2={c.x} y2={c.y} stroke="#888" strokeWidth={1.5} />;
        })}
        {/* Render nodes */}
        {tree.nodes.map(n=>{
          const p=pos[n.id]||{x:0,y:0};
          return <Node key={n.id} data={n} x={p.x} y={p.y} selected={selId===n.id} onDoubleClick={()=>startEdit(n.id)} />;
        })}
      </svg>
      {editId && 
        <textarea ref={editRef} value={editTxt} 
          onChange={e=>setEditTxt(e.target.value)} 
          onBlur={commitEdit} 
          style={{position:"absolute", left:pos[editId]?.x||0, top:pos[editId]?.y||0, zIndex:10}} />}
    </div>
  );
}

// ─── Node Component ─────────────────────────────────────────────────────────
import React from "react";

export default function Node({data, x, y, selected=false, onDoubleClick}) {
  const radius = 30;
  return (
    <g transform={`translate(${x}, ${y})`} style={{cursor:"pointer"}} onDoubleClick={onDoubleClick}>
      <circle r={radius} fill={selected ? "#00ffaa" : "#223344"} stroke="#00d4ff" strokeWidth={2} />
      <text x={0} y={0} textAnchor="middle" dominantBaseline="middle" 
            fill="#ffffff" fontSize="12" fontFamily="sans-serif">
        {data.label || data.note || "Node"}
      </text>
    </g>
  );
}

// ─── usePointerControls Hook ────────────────────────────────────────────────
import { useRef, useEffect } from "react";

export default function usePointerControls(svgRef, posRef, tfmRef, applyT, flushT, editModeRef, setSelId, setEditId) {
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const pointers = new Map();
    let drag = null;
    let pan = null;
    let lastMid = null;
    let lastDist = null;

    const getMid = () => {
      const [p1, p2] = [...pointers.values()];
      return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    };

    const getDist = () => {
      const [p1, p2] = [...pointers.values()];
      const dx = p1.x - p2.x;
      const dy = p1.y - p2.y;
      return Math.sqrt(dx * dx + dy * dy);
    };

    const down = (e) => {
      e.preventDefault();
      svg.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.size === 1) {
        let el = e.target, nid = null;
        while (el && el !== svg) {
          if (el.dataset?.nodeid) { nid = el.dataset.nodeid; break; }
          el = el.parentElement;
        }

        if (nid) {
          const p = posRef.current[nid] || { x: 0, y: 0 };
          drag = { id: nid, ox: p.x, oy: p.y, sx: e.clientX, sy: e.clientY, moved: false };
        } else {
          const t = tfmRef.current;
          pan = { ox: t.x, oy: t.y, sx: e.clientX, sy: e.clientY, moved: false };
        }
      }

      if (pointers.size === 2) {
        drag = null;
        pan = null;
        lastMid = getMid();
        lastDist = getDist();
      }
    };

    const move = (e) => {
      if (!pointers.has(e.pointerId)) return;
      e.preventDefault();
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.size === 1 && drag) {
        const dx = e.clientX - drag.sx;
        const dy = e.clientY - drag.sy;
        if (Math.sqrt(dx*dx+dy*dy) > 4) drag.moved = true;
        const np = { x: drag.ox + dx, y: drag.oy + dy };
        posRef.current[drag.id] = np;
      } else if (pointers.size === 1 && pan) {
        const dx = e.clientX - pan.sx;
        const dy = e.clientY - pan.sy;
        if (Math.sqrt(dx*dx+dy*dy) > 2) pan.moved = true;
        applyT({ ...tfmRef.current, x: pan.ox + dx, y: pan.oy + dy });
      } else if (pointers.size === 2 && lastMid && lastDist) {
        const t = tfmRef.current;
        const mid = getMid();
        const dist = getDist();
        const rect = svg.getBoundingClientRect();
        const px = mid.x - rect.left;
        const py = mid.y - rect.top;
        const newScale = Math.min(5, Math.max(0.05, (t.scale * dist) / lastDist));
        const factor = newScale / t.scale;
        applyT({
          scale: newScale,
          x: px - factor * (px - t.x) + (mid.x - lastMid.x),
          y: py - factor * (py - t.y) + (mid.y - lastMid.y),
        });
        lastMid = mid;
        lastDist = dist;
      }
    };

    const up = (e) => {
      e.preventDefault();
      pointers.delete(e.pointerId);

      if (pointers.size === 0) {
        flushT(tfmRef.current);

        if (drag && !drag.moved && editModeRef.current && drag.id !== "ROOT") {
          setSelId(prev => (prev === drag.id ? null : drag.id));
          setEditId(null);
        }

        if (pan && !pan.moved && editModeRef.current) {
          setSelId(null);
          setEditId(null);
        }

        drag = null; pan = null; lastMid = null; lastDist = null;
      }
    };

    svg.addEventListener("pointerdown", down, { passive: false });
    svg.addEventListener("pointermove", move, { passive: false });
    svg.addEventListener("pointerup", up);
    svg.addEventListener("pointercancel", up);

    return () => {
      svg.removeEventListener("pointerdown", down);
      svg.removeEventListener("pointermove", move);
      svg.removeEventListener("pointerup", up);
      svg.removeEventListener("pointercancel", up);
    };
  }, [svgRef, posRef, tfmRef, applyT, flushT, editModeRef, setSelId, setEditId]);
}

// ─── Main MindMap Component ────────────────────────────────────────────────
import React, { useRef, useState, useCallback } from "react";
import usePointerControls from "./hooks/usePointerControls";
import Node from "./components/Node";

export default function MindMap({ initialNodes, initialLinks }) {
  const svgRef = useRef(null);
  const posRef = useRef(initialNodes);       // { id: {x, y} }
  const tfmRef = useRef({ x: 0, y: 0, scale: 1 });
  const editModeRef = useRef(true);

  const [selId, setSelId] = useState(null);
  const [editId, setEditId] = useState(null);

  const applyT = useCallback((t) => { tfmRef.current = t; }, []);
  const flushT = useCallback((t) => { tfmRef.current = t; }, []);

  // Подключаем управление drag/zoom
  usePointerControls(svgRef, posRef, tfmRef, applyT, flushT, editModeRef, setSelId, setEditId);

  return (
    <svg
      ref={svgRef}
      width="100%"
      height="100%"
      style={{ touchAction: "none", userSelect: "none", background: "#111" }}
    >
      <g transform={`translate(${tfmRef.current.x}, ${tfmRef.current.y}) scale(${tfmRef.current.scale})`}>
        {/* Render links */}
        {initialLinks.map((l, i) => {
          const p1 = posRef.current[l.from];
          const p2 = posRef.current[l.to];
          if (!p1 || !p2) return null;
          return (
            <line
              key={i}
              x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
              stroke="#0f0" strokeWidth={2}
            />
          );
        })}

        {/* Render nodes */}
        {Object.entries(posRef.current).map(([id, p]) => (
          <Node
            key={id}
            id={id}
            x={p.x}
            y={p.y}
            selected={selId === id}
            editing={editId === id}
            posRef={posRef}
          />
        ))}
      </g>
    </svg>
  );
}

// ─── Node Component ────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef } from "react";

export default function Node({ id, x, y, selected, editing, posRef }) {
  const [value, setValue] = useState(id); // текст узла (по умолчанию id)
  const inputRef = useRef(null);

  // Фокус на инпут при редактировании
  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  const handleDrag = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = posRef.current[id].x;
    const origY = posRef.current[id].y;

    const onMove = (me) => {
      posRef.current[id].x = origX + (me.clientX - startX);
      posRef.current[id].y = origY + (me.clientY - startY);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <g transform={`translate(${x}, ${y})`} style={{ cursor: "grab" }} onMouseDown={handleDrag}>
      <circle r={30} fill={selected ? "#0ff" : "#222"} stroke="#0f0" strokeWidth={selected ? 3 : 1} />
      {editing ? (
        <foreignObject x={-25} y={-12} width={50} height={24}>
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            style={{
              width: "50px",
              height: "24px",
              border: "none",
              outline: "none",
              background: "transparent",
              color: "#fff",
              textAlign: "center",
              fontSize: "12px"
            }}
          />
        </foreignObject>
      ) : (
        <text
          textAnchor="middle"
          dy="4"
          fill="#fff"
          style={{ fontSize: "12px", userSelect: "none" }}
        >
          {value}
        </text>
      )}
    </g>
  );
}