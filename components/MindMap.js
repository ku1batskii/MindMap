import usePointerControls from "../hooks/usePointerControls";
import Node from "./Node";
import CLIENT_CONFIG from '../config.js';
import { useState, useEffect, useRef, useCallback } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────
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

// ─── Utils ────────────────────────────────────────────────────────────────────
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
  return{goal:input.slice(0,50),nodes:src.map(l=>({id:uid(),title:l.split(" ").slice(0,3).join(" "),note:l,type:"idea",confidence:"medium",parentId:null}))};
}

// ─── Theme ────────────────────────────────────────────────────────────────────
function getC(dark){
  return dark?{bg:"#090909",bgSub:"#060d06",border:"#1e4428",accent:"#00ff88",accentDim:"rgba(0,255,136,0.82)",accentFaint:"rgba(0,255,136,0.2)",text:"#00ff88",textDim:"rgba(0,255,136,0.48)",cardBg:"#0a120a",dots:"#131a13"}
             :{bg:"#f0f7f0",bgSub:"#e0ede0",border:"#4a8a5a",accent:"#006622",accentDim:"rgba(0,80,30,0.82)",accentFaint:"rgba(0,80,30,0.2)",text:"#004d18",textDim:"rgba(0,80,30,0.48)",cardBg:"#d0e8d0",dots:"#b0ccb0"};
}

// ─── Sessions ─────────────────────────────────────────────────────────────────
function loadSessions(){
  if(typeof window==="undefined")return[];
  try{const r=JSON.parse(localStorage.getItem(LS_KEY)||"null");if(!r||r.v!==2)return[];return r.d||[];}catch{return[];}
}
function saveSessions(s){
  if(typeof window==="undefined")return;
  try{localStorage.setItem(LS_KEY,JSON.stringify({v:2,d:s.slice(0,20)}));}catch{}
}

// ─── Radial layout ───────────────────────────────────────────────────────────
function radial(tree,W,H){
  const pos={},cx=W/2,cy=H/2;
  pos["ROOT"]={x:cx,y:cy};
  const orph=tree.nodes.filter(n=>!n.parentId);
  if(!orph.length)return pos;
  const L1=Math.max(280,(NW+60)*orph.length/(2*Math.PI));
  orph.forEach((n,i)=>{
    const a=(i/orph.length)*Math.PI*2-Math.PI/2;
    const nx=cx+L1*Math.cos(a),ny=cy+L1*Math.sin(a);
    pos[n?.id]={x:nx,y:ny};
    const ch=tree.nodes.filter(c=>c.parentId===n?.id);
    if(!ch.length)return;
    const L2=Math.max(180,(NW+50)*ch.length/(2*Math.PI*0.65));
    const sm=orph.length>1?(2*Math.PI/orph.length)*0.7:Math.PI*1.3;
    const fan=Math.min(sm,ch.length*0.55);
    ch.forEach((c,j)=>{
      const ca=ch.length===1?a:a-fan/2+(fan/(ch.length-1))*j;
      const cx2=nx+L2*Math.cos(ca),cy2=ny+L2*Math.sin(ca);
      pos[c?.id]={x:cx2,y:cy2};
      const gc=tree.nodes.filter(g=>g.parentId===c?.id);
      if(!gc.length)return;
      const L3=Math.max(140,(NW+40)*gc.length/(2*Math.PI*0.55));
      const gf=Math.min(fan/Math.max(ch.length,1)*0.75,gc.length*0.42);
      gc.forEach((g,k)=>{
        const ga=gc.length===1?ca:ca-gf/2+(gf/(gc.length-1))*k;
        pos[g?.id]={x:cx2+L3*Math.cos(ga),y:cy2+L3*Math.sin(ga)};
      });
    });
  });
  return pos;
}
function fitAll(posMap,W,H){
  const pts=Object.values(posMap);if(!pts.length)return{x:0,y:0,scale:1};
  const pad=110,xs=pts.map(p=>p.x),ys=pts.map(p=>p.y);
  const x0=Math.min(...xs)-pad,x1=Math.max(...xs)+pad,y0=Math.min(...ys)-pad,y1=Math.max(...ys)+pad;
  const sc=Math.min(W/(x1-x0),H/(y1-y0),1.6,2.5);
  return{x:W/2-sc*(x0+x1)/2,y:H/2-sc*(y0+y1)/2,scale:sc};
}

// ─── API ──────────────────────────────────────────────────────────────────────
let _reqId=0;
async function callAI(messages,max_tokens=1600){
  const r=await fetch("/api/ai",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-haiku-4-5-20251001",max_tokens,messages})});
  const d=await r.json();if(d.error)throw new Error(d.error.message||"API error");
  return(d.content?.[0]?.text)||"";
}
function parseJ(raw){
  const c=raw.replace(/```json/gi,"").replace(/```/g,"").trim();
  const m=c.match(/\{[\s\S]*\}/);if(!m)return null;
  try{return JSON.parse(m[0]);}catch{return null;}
}
async function fetchMap(input,tree,reqId){
  const ids=tree.nodes.map(n=>n?.id);
  const maxN=ids.reduce((m,id)=>{const n=parseInt(id.replace(/\D/g,""),10);return isNaN(n)?m:Math.max(m,n);},0);
  const compact={goal:tree.goal,nodes:tree.nodes.map(n=>({id:n.id,title:n.title,note:n.note,type:n.type,parentId:n.parentId}))};
  const p1="Return ONLY raw JSON, no markdown.\nSchema: {\"goal\":\"string\",\"nodes\":[{\"id\":\"n1\",\"note\":\"1-2 sentences\",\"type\":\"idea|subgoal|step|risk|alternative\",\"confidence\":\"high|medium|low\",\"parentId\":null}]}\n"+
    "Rules: 4-10 ideas. type: idea=concept, subgoal=goal, step=action, risk=danger(RED), alternative=other option. "+
    CLIENT_CONFIG.systemContext+" Keep existing. New IDs from n"+(maxN+1)+". Same language.\nExisting: "+JSON.stringify(compact)+"\nInput: "+input;
  const raw1=await callAI([{role:"user",content:p1}]);
  if(reqId!==_reqId)return null;
  const p=parseJ(raw1);if(!p)return fallback(input);
  const VT=["idea","subgoal","step","risk","alternative"],VC=["high","medium","low"];
  p.goal=p.goal||tree.goal||input.slice(0,50)||"Map";
  p.nodes=(Array.isArray(p.nodes)?p.nodes:[]).map(n=>({id:String(n.id||uid()),title:"",note:String(n.note||"").replace(/"/g,"'"),type:VT.includes(n.type)?n.type:"idea",confidence:VC.includes(n.confidence)?n.confidence:"medium",parentId:n.parentId||null}));
  const newN=p.nodes.filter(n=>!tree.nodes.find(e=>e.id===n.id));
  if(newN.length>0){
    const list=newN.map((n,i)=>(i+1)+". "+n.note).join("\n");
    const p2="For each note write UNIQUE 2-3 word title. Return ONLY JSON array. No markdown. Same language.\nUsed: "+tree.nodes.filter(n=>n.title).map(n=>n.title).join(", ")+"\nNotes:\n"+list;
    try{
      const raw2=await callAI([{role:"user",content:p2}],800);
      if(reqId!==_reqId)return null;
      const arr=JSON.parse((raw2.replace(/```json/gi,"").replace(/```/g,"").trim().match(/\[[\s\S]*\]/)||["[]"])[0]);
      newN.forEach((n,i)=>{n.title=String(arr[i]||"").trim()||n.note.split(" ").slice(0,3).join(" ");});
    }catch{newN.forEach(n=>{n.title=n.note.split(" ").slice(0,3).join(" ");});}
  }
  tree.nodes.forEach(old=>{const f=p.nodes.find(n=>n.id===old.id);if(f)f.title=old.title;});
  return p;
}

// ─── Matrix Rain ──────────────────────────────────────────────────────────────
function MatrixRain({opacity=1}){
  const ref=useRef(null);
  useEffect(()=>{
    const c=ref.current;if(!c)return;
    const ctx=c.getContext("2d");let id;
    const resize=()=>{c.width=window.innerWidth;c.height=window.innerHeight;};
    resize();window.addEventListener("resize",resize);
    const cols=Math.floor(c.width/13),drops=Array(cols).fill(0).map(()=>Math.random()*c.height/13);
    const draw=()=>{
      ctx.fillStyle="rgba(0,0,0,0.055)";ctx.fillRect(0,0,c.width,c.height);
      ctx.font="12px 'Courier New',monospace";
      drops.forEach((y,i)=>{
        ctx.fillStyle=Math.random()>0.92?"rgba(180,255,180,0.95)":"rgba(0,255,65,0.52)";
        ctx.fillText(Math.random()>0.5?"1":"0",i*13,y*13);
        if(y*13>c.height&&Math.random()>0.975)drops[i]=0;
        drops[i]+=0.55+Math.random()*0.45;
      });
      id=requestAnimationFrame(draw);
    };
    draw();
    return()=>{cancelAnimationFrame(id);window.removeEventListener("resize",resize);};
  },[]);
  return<canvas ref={ref} style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none",zIndex:0,opacity}}/>;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function MindMap(){
  // ── PWA Service Worker ────────────────────────────────────────────────────
  useEffect(()=>{
    if("serviceWorker" in navigator){
      navigator.serviceWorker.register("/sw.js").catch(()=>{});
    }
  },[]);

  const [view,setView]           = useState("input");
  const [inputText,setInputText] = useState("");
  const [theme,setTheme]         = useState("dark");
  const dark=theme==="dark";
  const C=getC(dark);
  const NS=dark?DARK_STYLE:LIGHT_STYLE;

  // Map state
  const [tree,setTree]     = useState({goal:"",nodes:[]});
  const treeRef            = useRef({goal:"",nodes:[]});
  const [pos,setPos]       = useState({});
  const posRef             = useRef({});
  const [log,setLog]       = useState([{c:"s",t:"MIND MAP -- введи текст"},{c:"s",t:"/mock -- тест · /clear -- сброс"}]);
  const logRef             = useRef(null);
  const [busy,setBusy]     = useState(false);
  const [busyVis,setBusyVis] = useState(false);
  const [newIds,setNewIds] = useState(new Set());

  // Transform
  const [tfm,setTfm]   = useState({x:0,y:0,scale:1});
  const tfmRef         = useRef({x:0,y:0,scale:1});
  const svgRef         = useRef(null);
  const gRef           = useRef(null);

  // Edit
  const [editMode,setEditMode]         = useState(false);
  const editModeRef                    = useRef(false);
  const [selId,setSelId]               = useState(null);
  const [editId,setEditId]             = useState(null);
  const [editTxt,setEditTxt]           = useState("");
  const editRef                        = useRef(null);
  useEffect(()=>{editModeRef.current=editMode;},[editMode]);

  // Nav
  const [navSel,setNavSel] = useState(null);

  // History
  const [hist,setHist]     = useState([]);
  const [histIdx,setHistIdx] = useState(-1);
  const histIdxRef         = useRef(-1);

  // Sessions
  const [sessions,setSessions] = useState([]);
  useEffect(()=>{setSessions(loadSessions());},[]);

  // Modals
  const [showBar,setShowBar]     = useState(false);
  const [showFU,setShowFU]       = useState(false);
  const [fuTxt,setFuTxt]         = useState("");
  const [showRep,setShowRep]     = useState(false);
  const [repTxt,setRepTxt]       = useState("");
  const [showRel,setShowRel]     = useState(false);
  const [relLoad,setRelLoad]     = useState(false);
  const [relList,setRelList]     = useState([]);
  const relCache                 = useRef({});

  // keep refs in sync
  useEffect(()=>{treeRef.current=tree;},[tree]);
  useEffect(()=>{posRef.current=pos;},[pos]);

  // ── Log ───────────────────────────────────────────────────────────────────
  const lg=useCallback((c,t)=>{
    if(c==="_cb"){setLog(l=>l.filter(i=>i.c!=="b"));return;}
    setLog(l=>{const n=[...l,{c,t}];return n.length>80?n.slice(-80):n;});
    setTimeout(()=>{if(logRef.current)logRef.current.scrollTop=logRef.current.scrollHeight;},30);
  },[]);

  // ── Transform helpers ──────────────────────────────────────────────────────
  const applyT=useCallback(t=>{
    tfmRef.current=t;
    if(gRef.current)gRef.current.style.transform=`translate(${t.x}px,${t.y}px) scale(${t.scale})`;
  },[]);
  const flushT=useCallback(t=>{
    tfmRef.current=t;
    if(gRef.current)gRef.current.style.transform=`translate(${t.x}px,${t.y}px) scale(${t.scale})`;
  },[]);

  // ── Pointer / Drag ─────────────────────────────────────────────────────────
  const dragRef=useRef(null);
  const ib=()=>({width:28,height:28,borderRadius:5,background:"none",border:"none",cursor:"pointer",color:C.accentDim,display:"flex",alignItems:"center",justifyContent:"center"});
  const {onDown,onMove,onUp}=usePointerControls({
    getPos:()=>tfmRef.current,
    onStart:(ev,id,x,y)=>{
      dragRef.current={id,x0:x,y0:y,x:0,y:0};
    },
    onDrag:(ev,id,x,y)=>{
      if(!dragRef.current)return;
      dragRef.current.x=x-dragRef.current.x0;
      dragRef.current.y=y-dragRef.current.y0;
      flushT({x:tfmRef.current.x+dragRef.current.x,y:tfmRef.current.y+dragRef.current.y,scale:tfmRef.current.scale});
    },
    onEnd:(ev,id)=>{
      if(!dragRef.current)return;
      const t={x:tfmRef.current.x+dragRef.current.x,y:tfmRef.current.y+dragRef.current.y,scale:tfmRef.current.scale};
      flushT(t);
      dragRef.current=null;
    },
    onZoom:(scale,px,py)=>{
      const t=tfmRef.current;
      const nx=(t.x-px)*(scale/t.scale)+px;
      const ny=(t.y-py)*(scale/t.scale)+py;
      flushT({x:nx,y:ny,scale});
    }
  });

  // ── Effects ────────────────────────────────────────────────────────────────
  useEffect(()=>{
    const p=radial(tree,window.innerWidth,window.innerHeight);
    posRef.current=p;
    setPos(p);
    const t=fitAll(p,window.innerWidth,window.innerHeight);
    flushT(t);
  },[tree.nodes.length]);

  // ── Render ────────────────────────────────────────────────────────────────
  return(
    <div style={{width:"100%",height:"100%",position:"relative",overflow:"hidden",background:C.bg}}>
      <MatrixRain opacity={0.25}/>
      <svg ref={svgRef} width="100%" height="100%" onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} style={{touchAction:"none"}}>
        <g ref={gRef}>
          {tree.nodes.map(n=>{
            const p=pos[n?.id]; if(!p)return null;
            const style=NS[n.type]||NS.idea;
            return <Node key={n.id} node={n} x={p.x} y={p.y} style={style}/>;
          })}
        </g>
      </svg>
      <div ref={logRef} style={{position:"absolute",bottom:0,left:0,width:"100%",maxHeight:120,overflowY:"auto",color:C.text,fontSize:12,padding:8}}>{log.map((l,i)=><div key={i}>{l.t}</div>)}</div>
    </div>
  );
}