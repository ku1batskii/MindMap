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

// ─── Radial layout ────────────────────────────────────────────────────────────
function radial(tree,W,H){
  const pos={},cx=W/2,cy=H/2;
  pos["ROOT"]={x:cx,y:cy};
  const orph=tree.nodes.filter(n=>!n.parentId);
  if(!orph.length)return pos;
  const L1=Math.max(280,(NW+60)*orph.length/(2*Math.PI));
  orph.forEach((n,i)=>{
    const a=(i/orph.length)*Math.PI*2-Math.PI/2;
    const nx=cx+L1*Math.cos(a),ny=cy+L1*Math.sin(a);
    pos[n.id]={x:nx,y:ny};
    const ch=tree.nodes.filter(c=>c.parentId===n.id);
    if(!ch.length)return;
    const L2=Math.max(180,(NW+50)*ch.length/(2*Math.PI*0.65));
    const sm=orph.length>1?(2*Math.PI/orph.length)*0.7:Math.PI*1.3;
    const fan=Math.min(sm,ch.length*0.55);
    ch.forEach((c,j)=>{
      const ca=ch.length===1?a:a-fan/2+(fan/(ch.length-1))*j;
      const cx2=nx+L2*Math.cos(ca),cy2=ny+L2*Math.sin(ca);
      pos[c.id]={x:cx2,y:cy2};
      const gc=tree.nodes.filter(g=>g.parentId===c.id);
      if(!gc.length)return;
      const L3=Math.max(140,(NW+40)*gc.length/(2*Math.PI*0.55));
      const gf=Math.min(fan/Math.max(ch.length,1)*0.75,gc.length*0.42);
      gc.forEach((g,k)=>{
        const ga=gc.length===1?ca:ca-gf/2+(gf/(gc.length-1))*k;
        pos[g.id]={x:cx2+L3*Math.cos(ga),y:cy2+L3*Math.sin(ga)};
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
  const ids=tree.nodes.map(n=>n.id);
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

  // ── Log ────────────────────────────────────────────────────────────────────
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
    setTfm({...t});
  },[]);

  // ── Layout ─────────────────────────────────────────────────────────────────
  const reLayout=useCallback((tr)=>{
    if(view!=="map")return;
    requestAnimationFrame(()=>{
      const svg=svgRef.current;if(!svg)return;
      const r=svg.getBoundingClientRect();
      const w=r.width>10?r.width:window.innerWidth;
      const h=r.height>10?r.height:window.innerHeight-200;
      const np=radial(tr,w,h);
      posRef.current=np;setPos(np);
      flushT(fitAll(np,w,h));
    });
  },[view,flushT]);

  useEffect(()=>{if(view==="map")reLayout(tree);},[tree,view]);

  const fit=useCallback(()=>{
    const svg=svgRef.current;if(!svg)return;
    const r=svg.getBoundingClientRect();
    const w=r.width>10?r.width:window.innerWidth;
    const h=r.height>10?r.height:window.innerHeight-200;
    flushT(fitAll(posRef.current,w,h));
  },[flushT]);

  // ── Wheel ──────────────────────────────────────────────────────────────────
  useEffect(()=>{
    const svg=svgRef.current;if(!svg||view!=="map")return;
    const h=e=>{
      e.preventDefault();
      const t=tfmRef.current,f=e.deltaY<0?1.1:0.91,rect=svg.getBoundingClientRect();
      const px=e.clientX-rect.left,py=e.clientY-rect.top;
      const ns=Math.min(5,Math.max(0.05,t.scale*f));
      flushT({scale:ns,x:px-(ns/t.scale)*(px-t.x),y:py-(ns/t.scale)*(py-t.y)});
    };
    svg.addEventListener("wheel",h,{passive:false});
    return()=>svg.removeEventListener("wheel",h);
  },[view,flushT]);

  // ── Pointer gestures ───────────────────────────────────────────────────────
  useEffect(()=>{
    const svg=svgRef.current;if(!svg||view!=="map")return;
    const ptrs=new Map();
    const mid=()=>{const p=[...ptrs.values()];return{x:(p[0].x+p[1].x)/2,y:(p[0].y+p[1].y)/2};};
    const pd=()=>{const p=[...ptrs.values()];const dx=p[0].x-p[1].x,dy=p[0].y-p[1].y;return Math.sqrt(dx*dx+dy*dy);};
    let drag=null,pan=null,lm=null,ld=null;

    const down=e=>{
      e.preventDefault();svg.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(ptrs.size===1){
        let el=e.target,nid=null;
        while(el&&el!==svg){if(el.dataset?.nodeid){nid=el.dataset.nodeid;break;}el=el.parentElement;}
        if(nid){
          const p=posRef.current[nid]||{x:0,y:0};
          drag={id:nid,ox:p.x,oy:p.y,sx:e.clientX,sy:e.clientY,moved:false};
        }else{
          const t=tfmRef.current;
          pan={ox:t.x,oy:t.y,sx:e.clientX,sy:e.clientY,moved:false};
          lm=null;ld=null;
        }
      }else if(ptrs.size===2){drag=null;pan=null;lm=mid();ld=pd();}
    };

    const move=e=>{
      if(!ptrs.has(e.pointerId))return;e.preventDefault();
      ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(ptrs.size===1&&drag){
        const dx=e.clientX-drag.sx,dy=e.clientY-drag.sy;
        if(Math.sqrt(dx*dx+dy*dy)>6)drag.moved=true;
        const np={x:drag.ox+dx,y:drag.oy+dy};
        posRef.current[drag.id]=np;
        setPos(prev=>({...prev,[drag.id]:np}));
      }else if(ptrs.size===1&&pan){
        const dx=e.clientX-pan.sx,dy=e.clientY-pan.sy;
        if(Math.sqrt(dx*dx+dy*dy)>4)pan.moved=true;
        applyT({...tfmRef.current,x:pan.ox+dx,y:pan.oy+dy});
      }else if(ptrs.size===2&&lm&&ld){
        const t=tfmRef.current,m=mid(),d=pd(),rect=svg.getBoundingClientRect();
        const px=m.x-rect.left,py=m.y-rect.top,ns=Math.min(5,Math.max(0.05,t.scale*d/ld)),sf=ns/t.scale;
        applyT({scale:ns,x:px-sf*(px-t.x)+(m.x-lm.x),y:py-sf*(py-t.y)+(m.y-lm.y)});
        lm=m;ld=d;
      }
    };

    const up=e=>{
      e.preventDefault();ptrs.delete(e.pointerId);
      if(ptrs.size===0){
        flushT(tfmRef.current);
        if(drag&&!drag.moved&&editModeRef.current&&drag.id!=="ROOT"){
          setSelId(prev=>prev===drag.id?null:drag.id);setEditId(null);
        }
        if(pan&&!pan.moved&&editModeRef.current){setSelId(null);setEditId(null);}
        drag=null;pan=null;lm=null;ld=null;
      }
      if(ptrs.size===1){
        const[,rp]=[...ptrs.entries()][0];const t=tfmRef.current;
        pan={ox:t.x,oy:t.y,sx:rp.x,sy:rp.y,moved:false};lm=null;ld=null;
      }
    };

    svg.addEventListener("pointerdown",down,{passive:false});
    svg.addEventListener("pointermove",move,{passive:false});
    svg.addEventListener("pointerup",up,{passive:false});
    svg.addEventListener("pointercancel",up,{passive:false});
    return()=>{
      svg.removeEventListener("pointerdown",down);svg.removeEventListener("pointermove",move);
      svg.removeEventListener("pointerup",up);svg.removeEventListener("pointercancel",up);
    };
  },[view,applyT,flushT]);

  // ── Process ────────────────────────────────────────────────────────────────
  const setTreeSave=useCallback((t)=>{
    treeRef.current=t;setTree(t);
    if(t.goal&&t.nodes.length){
      const ex=loadSessions();
      const entry={id:t.goal+"_"+Date.now(),goal:t.goal,nc:t.nodes.length,ts:Date.now(),tree:t};
      const upd=[entry,...ex.filter(s=>s.goal!==t.goal)].slice(0,20);
      saveSessions(upd);setSessions(upd);
    }
  },[]);

  const process=useCallback(async val=>{
    val=val.trim();if(!val)return;
    if(val==="/clear"){setTreeSave({goal:"",nodes:[]});setPos({});setHist([]);setHistIdx(-1);histIdxRef.current=-1;lg("s","- очищено -");return;}
    if(val==="/mock"){
      const m={goal:"ContentOS SaaS",nodes:[
        {id:"n1",title:"3 streams",note:"Agency, SaaS and digital products",type:"subgoal",confidence:"high",parentId:null},
        {id:"n2",title:"agency",note:"Fast cashflow through client projects",type:"step",confidence:"high",parentId:"n1"},
        {id:"n3",title:"SaaS scale",note:"ContentOS subscription, MRR grows",type:"step",confidence:"high",parentId:"n1"},
        {id:"n4",title:"dig products",note:"Templates, courses via Gumroad",type:"step",confidence:"medium",parentId:"n1"},
        {id:"n5",title:"autoposting",note:"Instagram via Meta API",type:"idea",confidence:"medium",parentId:"n3"},
        {id:"n6",title:"algo risk",note:"Meta may restrict API",type:"risk",confidence:"high",parentId:"n5"},
        {id:"n7",title:"validation",note:"Landing + waitlist before dev",type:"step",confidence:"high",parentId:"n3"},
        {id:"n8",title:"UI kits",note:"Figma kits if SaaS slow",type:"alternative",confidence:"medium",parentId:"n4"},
      ]};
      setTreeSave(m);setPos({});setHist([m]);setHistIdx(0);histIdxRef.current=0;lg("o","- mock -");return;
    }
    if(busy)return;
    setBusy(true);lg("u","▸ "+trunc(val,60));lg("b","строю карту…");
    const reqId=Date.now();_reqId=reqId;
    try{
      const upd=await fetchMap(val,treeRef.current,reqId);
      if(!upd||_reqId!==reqId)return;
      const prevIds=new Set(treeRef.current.nodes.map(n=>n.id));
      const fresh=upd.nodes.filter(n=>!prevIds.has(n.id)).map(n=>({...n,title:n.title||smartTitle(n.note)}));
      const base=treeRef.current.nodes,goal=upd.goal||treeRef.current.goal;
      const ids=new Set(base.map(n=>n.id));
      const merged=[...base,...fresh.filter(n=>!ids.has(n.id))];
      const saved=!goal&&merged.length?{goal:merged[0].title,nodes:merged}:{goal,nodes:merged};
      setTreeSave(saved);
      setHist(prev=>[...prev.slice(0,histIdxRef.current+1),saved]);
      setHistIdx(prev=>{const ni=prev+1;histIdxRef.current=ni;return ni;});
      const fids=fresh.map(n=>n.id);
      if(fids.length){setNewIds(new Set(fids));setTimeout(()=>setNewIds(new Set()),600);}
      lg("_cb","");lg("o","✓ готово");
    }catch(e){lg("e","ERR: "+e.message);console.error(e);}
    finally{setBusy(false);}
  },[busy,lg,setTreeSave]);

  // ── History nav ────────────────────────────────────────────────────────────
  const goBack=useCallback(()=>{
    if(histIdxRef.current<=0)return;
    const ni=histIdxRef.current-1;const t=hist[ni];
    setTreeSave(t);setPos({});setHistIdx(ni);histIdxRef.current=ni;
  },[hist,setTreeSave]);
  const goFwd=useCallback(()=>{
    if(histIdxRef.current>=hist.length-1)return;
    const ni=histIdxRef.current+1;const t=hist[ni];
    setTreeSave(t);setPos({});setHistIdx(ni);histIdxRef.current=ni;
  },[hist,setTreeSave]);

  // ── Node nav ───────────────────────────────────────────────────────────────
  const getOrder=useCallback(()=>{
    const order=[],vis=new Set();
    const bfs=ids=>{if(!ids.length)return;const next=[];ids.forEach(id=>{if(vis.has(id))return;vis.add(id);order.push(id);treeRef.current.nodes.filter(c=>c.parentId===id).forEach(c=>next.push(c.id));});bfs(next);};
    bfs(treeRef.current.nodes.filter(n=>!n.parentId).map(n=>n.id));return order;
  },[]);

  const focusNode=useCallback(id=>{
    const svg=svgRef.current;if(!svg)return;
    const p=posRef.current[id];if(!p)return;
    const r=svg.getBoundingClientRect();
    const W=r.width>10?r.width:window.innerWidth,H=r.height>10?r.height:window.innerHeight-200;
    flushT({x:W/2-1.55*p.x,y:H/2-1.55*p.y,scale:1.55});setNavSel(id);
  },[flushT]);

  const navNode=useCallback(dir=>{
    const order=getOrder();if(!order.length)return;
    const cur=order.indexOf(navSel);
    focusNode(order[cur===-1?(dir>0?0:order.length-1):(cur+dir+order.length)%order.length]);
  },[getOrder,navSel,focusNode]);

  // ── Busy fade ──────────────────────────────────────────────────────────────
  useEffect(()=>{
    if(busy)setBusyVis(true);
    else{const t=setTimeout(()=>setBusyVis(false),600);return()=>clearTimeout(t);}
  },[busy]);

  // ── Edit ───────────────────────────────────────────────────────────────────
  const startEdit=useCallback(()=>{
    if(!selId)return;
    const node=treeRef.current.nodes.find(n=>n.id===selId);if(!node)return;
    setEditTxt(node.note||"");setEditId(selId);
    setTimeout(()=>editRef.current?.focus(),80);
  },[selId]);

  const commitEdit=useCallback(()=>{
    if(editId){
      const upd={...treeRef.current,nodes:treeRef.current.nodes.map(n=>n.id===editId?{...n,note:editTxt}:n)};
      setTreeSave(upd);
    }
    setEditId(null);
  },[editId,editTxt,setTreeSave]);

  const deleteNode=useCallback(id=>{
    const nd=treeRef.current.nodes.find(n=>n.id===id);if(!nd)return;
    const upd={...treeRef.current,nodes:treeRef.current.nodes.filter(n=>n.id!==id).map(n=>n.parentId===id?{...n,parentId:nd.parentId}:n)};
    setTreeSave(upd);setPos(prev=>{const p={...prev};delete p[id];return p;});
    setSelId(null);setEditId(null);
  },[setTreeSave]);

  // ── Related ────────────────────────────────────────────────────────────────
  const fetchRelated=useCallback(async()=>{
    const goal=treeRef.current.goal;if(!goal)return;
    setShowRel(true);
    if(relCache.current[goal]){setRelList(relCache.current[goal]);return;}
    setRelLoad(true);setRelList([]);
    try{
      const raw=await callAI([{role:"user",content:`Given mind map topic "${goal}", suggest 7 related topics. ONLY JSON array of short strings (max 6 words). Same language.`}],300);
      const arr=JSON.parse((raw.replace(/```json|```/g,"").trim().match(/\[[\s\S]*\]/)||["[]"])[0]).slice(0,7);
      relCache.current[goal]=arr;setRelList(arr);
    }catch{}
    setRelLoad(false);
  },[]);

  // ── Save ───────────────────────────────────────────────────────────────────
  const saveMap=useCallback(async()=>{
    if(!tree.nodes.length)return;
    try{
      const res=await fetch("/api/save",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tree,pos})});
      const data=await res.json();lg("o","✓ /view/"+data.slug);
      try{await navigator.clipboard.writeText(window.location.origin+"/view/"+data.slug);}catch{}
    }catch(e){lg("e","ERR save: "+e.message);}
  },[tree,pos,lg]);

  const exportSVG=useCallback(()=>{
    const svg=svgRef.current;if(!svg)return;
    const a=document.createElement("a");
    a.href=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)],{type:"image/svg+xml"}));
    a.download=(tree.goal||"mindmap").replace(/\s+/g,"_")+".svg";
    a.click();URL.revokeObjectURL(a.href);
  },[tree.goal]);

  // ── Build edges ────────────────────────────────────────────────────────────
  const edges=[];
  if(tree.goal){
    const rp=pos["ROOT"];
    tree.nodes.filter(n=>!n.parentId).forEach(n=>{
      const p=pos[n.id],h=nh(n.title,n.note);
      if(rp&&p){
        const dx=p.x-rp.x,dy=p.y-rp.y;
        let sx,sy,tx,ty;
        if(Math.abs(dx)>=Math.abs(dy)){sx=dx>=0?rp.x+NW/2:rp.x-NW/2;sy=rp.y;tx=dx>=0?p.x-NW/2:p.x+NW/2;ty=p.y;}
        else{sx=rp.x;sy=dy>=0?rp.y+RH/2:rp.y-RH/2;tx=p.x;ty=dy>=0?p.y-h/2:p.y+h/2;}
        edges.push({id:"r-"+n.id,sx,sy,tx,ty});
      }
    });
  }
  tree.nodes.forEach(n=>{
    if(!n.parentId)return;
    const pp=pos[n.parentId],cp=pos[n.id];
    const pN=tree.nodes.find(x=>x.id===n.parentId);
    const ph=nh(pN?.title,pN?.note),ch=nh(n.title,n.note);
    if(pp&&cp){
      const dx=cp.x-pp.x,dy=cp.y-pp.y;
      let sx,sy,tx,ty;
      if(Math.abs(dx)>=Math.abs(dy)){sx=dx>=0?pp.x+NW/2:pp.x-NW/2;sy=pp.y;tx=dx>=0?cp.x-NW/2:cp.x+NW/2;ty=cp.y;}
      else{sx=pp.x;sy=dy>=0?pp.y+ph/2:pp.y-ph/2;tx=cp.x;ty=dy>=0?cp.y-ch/2:cp.y+ch/2;}
      edges.push({id:n.parentId+"-"+n.id,sx,sy,tx,ty});
    }
  });

  const logColor={b:"#ffdd44",s:"rgba(0,255,136,0.6)",u:"#00ccee",e:"#ff5566",o:"#00ff88"};
  const TH=44;
  const glass={background:dark?"rgba(9,9,9,0.88)":"rgba(240,247,240,0.88)",backdropFilter:"blur(14px)",WebkitBackdropFilter:"blur(14px)",border:`1px solid ${C.border}`,borderRadius:8};
  const pb=(dis=false,act=false)=>({width:36,height:36,borderRadius:6,background:act?(dark?"rgba(0,255,136,0.12)":"rgba(0,80,30,0.1)"):"none",border:"none",cursor:dis?"default":"pointer",color:dis?C.accentFaint:(act?C.accent:C.accentDim),display:"flex",alignItems:"center",justifyContent:"center",opacity:dis?0.3:1,flexShrink:0});
  const ib=()=>({width:28,height:28,borderRadius:5,background:"none",border:"none",cursor:"pointer",color:C.accentDim,display:"flex",alignItems:"center",justifyContent:"center"});
  const canBack=histIdx>0,canFwd=histIdx<hist.length-1;

  // ── INPUT SCREEN ───────────────────────────────────────────────────────────
  if(view==="input"){
    const faint=dark?"rgba(0,255,136,0.22)":"rgba(0,180,80,0.3)";
    const ac=dark?"#00ff88":"#006622";
    return(
      <div style={{position:"fixed",inset:0,zIndex:300,background:dark?"#000":"#e8f5ec",display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <MatrixRain opacity={dark?1:0.18}/>
        <div style={{position:"relative",zIndex:1,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 16px",borderBottom:`1px solid ${faint}`,flexShrink:0}}>
          <span style={{fontSize:9,color:dark?"rgba(0,255,136,0.45)":"rgba(0,100,40,0.6)",letterSpacing:4,fontFamily:"'Courier New',monospace"}}>MIND MAP</span>
          <button onClick={()=>setTheme(t=>t==="dark"?"light":"dark")} style={{width:30,height:30,borderRadius:5,background:"transparent",border:`1px solid ${faint}`,color:dark?"rgba(0,255,136,0.7)":"rgba(0,120,50,0.8)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
            {dark?<svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
                :<svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>}
          </button>
        </div>
        <div style={{position:"relative",zIndex:1,flex:1,display:"flex",flexDirection:"column",padding:"20px 16px 16px",gap:14}}>
          <textarea value={inputText} onChange={e=>setInputText(e.target.value)} autoFocus
            onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.metaKey){e.preventDefault();if(!inputText.trim()||busy)return;const v=inputText;setInputText("");setView("map");setTimeout(()=>process(v),80);}}}
            placeholder={CLIENT_CONFIG.placeholder||"вставь текст или идею…"}
            style={{flex:1,background:dark?"rgba(0,0,0,0.72)":"rgba(255,255,255,0.72)",border:`1px solid ${faint}`,color:dark?"#00ff88":"#003d18",fontFamily:"'Courier New',monospace",fontSize:15,lineHeight:1.65,padding:"16px",outline:"none",resize:"none",caretColor:ac,borderRadius:6}}/>
          <button
            onClick={()=>{if(!inputText.trim()||busy)return;const v=inputText;setInputText("");setView("map");setTimeout(()=>process(v),80);}}
            style={{background:"transparent",border:`1px solid ${inputText.trim()&&!busy?ac:"rgba(0,255,136,0.3)"}`,color:inputText.trim()&&!busy?(dark?"#00ff88":"#003d18"):"rgba(0,255,136,0.3)",fontFamily:"'Courier New',monospace",fontSize:11,padding:"14px",cursor:inputText.trim()&&!busy?"pointer":"default",letterSpacing:3,borderRadius:6,pointerEvents:inputText.trim()&&!busy?"all":"none"}}>
            {busy?"ГЕНЕРИРУЮ…":"↳ GENERATE MAP"}
          </button>
        </div>
        <style>{`*{box-sizing:border-box;}textarea::placeholder{color:${dark?"rgba(0,255,136,0.3)":"rgba(0,100,40,0.4)"};}`}</style>
      </div>
    );
  }

  // ── MAP SCREEN ─────────────────────────────────────────────────────────────
  return(
    <div style={{background:C.bg,color:C.text,fontFamily:"'Courier New',monospace",height:"100dvh",display:"flex",flexDirection:"column",overflow:"hidden"}}>

      {/* Top bar */}
      <div style={{position:"absolute",top:0,left:0,right:0,zIndex:30,display:"flex",alignItems:"flex-start",justifyContent:"space-between",padding:"14px 14px 0",pointerEvents:"none"}}>
        <button onClick={()=>setShowBar(true)} style={{...glass,width:36,height:36,color:C.accentDim,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"all"}}>
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
        <div style={{display:"flex",gap:1,...glass,borderRadius:6,padding:"4px 5px",pointerEvents:"all"}}>
          <button onClick={exportSVG} style={ib()}><svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg></button>
          <button onClick={()=>setTheme(t=>t==="dark"?"light":"dark")} style={ib()}>
            {dark?<svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>:<svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>}
          </button>
          <button onClick={()=>setShowRep(true)} style={ib()}><svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></button>
          <button onClick={saveMap} disabled={!tree.nodes.length} style={{...ib(),color:tree.nodes.length?C.accentDim:C.accentFaint,cursor:tree.nodes.length?"pointer":"default"}}><svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17,21 17,13 7,13 7,21"/><polyline points="7,3 7,8 15,8"/></svg></button>
        </div>
      </div>

      {/* SVG */}
      <div style={{flex:1,overflow:"hidden",position:"relative"}}>
        <svg ref={svgRef} style={{width:"100%",height:"100%",position:"absolute",inset:0,cursor:"grab",touchAction:"none"}}>
          <defs>
            <marker id="arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill={dark?"rgba(0,220,100,0.38)":"rgba(0,100,40,0.4)"}/></marker>
            <pattern id="dots" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="14" cy="14" r="0.7" fill={C.dots}/></pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#dots)"/>
          <g ref={gRef} style={{transform:`translate(${tfm.x}px,${tfm.y}px) scale(${tfm.scale})`,willChange:"transform",transformOrigin:"0 0"}}>
            {edges.map(e=>{
              const isH=Math.abs(e.tx-e.sx)>=Math.abs(e.ty-e.sy),mx=(e.sx+e.tx)/2,my=(e.sy+e.ty)/2;
              const d=isH?`M${e.sx},${e.sy} C${mx},${e.sy} ${mx},${e.ty} ${e.tx},${e.ty}`:`M${e.sx},${e.sy} C${e.sx},${my} ${e.tx},${my} ${e.tx},${e.ty}`;
              return<path key={e.id} d={d} fill="none" stroke={dark?"rgba(0,220,100,0.28)":"rgba(0,100,40,0.3)"} strokeWidth="1.2" markerEnd="url(#arr)"/>;
            })}
            {tree.goal&&pos["ROOT"]&&(
              <g transform={`translate(${pos["ROOT"].x},${pos["ROOT"].y})`} data-nodeid="ROOT">
                <rect x={-RW/2} y={-RH/2} width={RW} height={RH} rx={6} fill={C.cardBg} stroke={C.accent} strokeWidth={1.5}/>
                <text textAnchor="middle" dominantBaseline="middle" fill={C.accent} fontSize={11} fontFamily="'Courier New',monospace" style={{pointerEvents:"none"}}>{trunc(tree.goal,25)}</text>
              </g>
            )}
            {tree.nodes.map(n=>{
              const p=pos[n.id];if(!p)return null;
              const ns=NS[n.type]||NS.idea,h=nh(n.title,n.note);
              const tl=wrap(n.title||"",TITLE_MAX),nl=wrap(n.note||"",NOTE_MAX),TOP=-h/2;
              const isNew=newIds.has(n.id);
              const isSelNode=editMode&&selId===n.id;
              const isNavSel=!editMode&&navSel===n.id;
              return(
                <g key={n.id} transform={`translate(${p.x},${p.y})`} style={{cursor:editMode?"pointer":"grab",...(isNew?{animation:"nodeIn 0.35s ease-out"}:{})}} data-nodeid={n.id}>
                  {(isSelNode||isNavSel)&&<rect x={-NW/2-3} y={TOP-3} width={NW+6} height={h+6} rx={7} fill="none" stroke={C.accent} strokeWidth={2} opacity={0.85}/>}
                  {editMode&&!isSelNode&&<rect x={-NW/2-2} y={TOP-2} width={NW+4} height={h+4} rx={7} fill="none" stroke={C.accentFaint} strokeWidth={1} strokeDasharray="4 3"/>}
                  <rect x={-NW/2} y={TOP} width={NW} height={h} rx={6} fill={ns.fill} stroke={ns.stroke} strokeWidth={1.5} strokeDasharray={n.confidence==="low"?"4 3":undefined} opacity={n.confidence==="low"?0.75:1}/>
                  {tl.map((line,li)=><text key={"t"+li} x={-NW/2+9} y={TOP+PAD_TOP+TITLE_LH*0.82+li*TITLE_LH} fill={ns.color} fontSize={11} fontWeight="700" fontFamily="'Courier New',monospace" style={{pointerEvents:"none"}}>{line}</text>)}
                  {nl.length>0&&<line x1={-NW/2+9} y1={TOP+PAD_TOP+tl.length*TITLE_LH+DIV_GAP} x2={NW/2-9} y2={TOP+PAD_TOP+tl.length*TITLE_LH+DIV_GAP} stroke={ns.stroke} strokeWidth={0.5} opacity={0.3}/>}
                  {nl.map((line,li)=>{const dy=TOP+PAD_TOP+tl.length*TITLE_LH+DIV_GAP+DIV_H+NOTE_GAP+NOTE_LH*0.82;return<text key={"n"+li} x={-NW/2+9} y={dy+li*NOTE_LH} fill={ns.color} fontSize={9.5} opacity={dark?0.62:0.75} fontFamily="'Courier New',monospace" style={{pointerEvents:"none"}}>{line}</text>;})}
                  <text x={-NW/2+7} y={h/2-3} fill={ns.stroke} fontSize={6.5} opacity={0.35} letterSpacing={1} fontFamily="'Courier New',monospace" style={{pointerEvents:"none"}}>{n.type.toUpperCase()}</text>
                  <circle cx={NW/2-9} cy={h/2-6} r={2.5} fill={n.confidence==="high"?ns.stroke:"none"} stroke={ns.stroke} strokeWidth={1} opacity={0.38} style={{pointerEvents:"none"}}/>
                </g>
              );
            })}
          </g>
        </svg>

        {/* Inline text editor */}
        {editId&&pos[editId]&&(
          <div style={{position:"absolute",left:(pos[editId].x*tfm.scale+tfm.x)-79,top:(pos[editId].y*tfm.scale+tfm.y)-40,width:158,zIndex:50}}>
            <textarea ref={editRef} value={editTxt} onChange={e=>setEditTxt(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();commitEdit();}if(e.key==="Escape")setEditId(null);}}
              rows={4}
              style={{width:"100%",background:dark?"rgba(10,20,10,0.97)":"rgba(240,255,240,0.97)",border:`1.5px solid ${C.accent}`,borderRadius:6,color:C.text,fontFamily:"'Courier New',monospace",fontSize:11,padding:"8px",outline:"none",resize:"none",caretColor:C.accent,lineHeight:1.5,boxShadow:`0 0 12px ${C.accent}44`}}/>
          </div>
        )}

        {/* Toolbar */}
        <div style={{position:"absolute",bottom:36,left:0,right:0,display:"flex",alignItems:"center",justifyContent:"center",gap:8,paddingLeft:14,paddingRight:14,zIndex:20,pointerEvents:"none"}}>
          <button onClick={()=>{fetchRelated();}} style={{width:TH,height:TH,borderRadius:8,flexShrink:0,...glass,color:C.accentDim,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"all"}}>
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>
          </button>
          <div style={{height:TH,display:"flex",alignItems:"center",...glass,padding:"0 8px",pointerEvents:"all"}}>
            {editMode&&selId?(
              <>
                <button onClick={()=>deleteNode(selId)} style={{...pb(),color:"#ff4477"}}>
                  <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>
                </button>
                <button onClick={startEdit} style={pb(false,editId===selId)}>
                  <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="4,7 4,4 20,4 20,7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>
                </button>
                <div style={{width:1,height:20,background:C.border,margin:"0 3px"}}/>
              </>
            ):(
              <>
                <button onClick={fit} style={pb()}>
                  <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M8 3H5a2 2 0 00-2 2v3M21 8V5a2 2 0 00-2-2h-3M16 21h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/></svg>
                </button>
                <button onClick={()=>{setEditMode(m=>!m);setSelId(null);setEditId(null);}} style={pb()}>
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <div style={{width:1,height:20,background:C.border,margin:"0 3px"}}/>
              </>
            )}
            <button onClick={()=>navNode(-1)} style={pb(!tree.nodes.length)}><svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 12H5M12 5l-7 7 7 7"/></svg></button>
            <button onClick={()=>navNode(1)} style={pb(!tree.nodes.length)}><svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg></button>
          </div>
        </div>

        {/* Busy overlay */}
        {busyVis&&(
          <div style={{position:"absolute",inset:0,zIndex:10,opacity:busy?1:0,transition:busy?"opacity 0.25s ease-in":"opacity 0.55s ease-out",pointerEvents:busy?"all":"none"}}>
            <MatrixRain opacity={dark?0.92:0.18}/>
            <div style={{position:"absolute",inset:0,zIndex:1,background:dark?"rgba(0,0,0,0.55)":"rgba(220,245,225,0.72)",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <div style={{fontFamily:"'Courier New',monospace",fontSize:10,color:dark?"rgba(0,255,136,0.8)":"rgba(0,80,30,0.8)",letterSpacing:5,animation:"blink 0.7s step-end infinite"}}>ГЕНЕРИРУЮ</div>
            </div>
          </div>
        )}
      </div>

      {/* Log */}
      <div ref={logRef} style={{borderTop:`1px solid ${C.border}`,background:C.bgSub,maxHeight:"12vh",overflowY:"auto",padding:"4px 14px",flexShrink:0}}>
        {log.map((l,i)=><div key={i} style={{fontSize:10,lineHeight:1.6,color:logColor[l.c]||"#aaa"}}>{l.t}{l.c==="b"&&<span style={{animation:"blink 0.5s step-end infinite"}}> ...</span>}</div>)}
      </div>

      {/* Follow-up bar */}
      <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 14px calc(8px + env(safe-area-inset-bottom)) 14px",borderTop:`1px solid ${C.border}`,background:C.bgSub,flexShrink:0}}>
        <button onClick={goBack} disabled={!canBack} style={{background:"transparent",border:"none",color:canBack?C.accentDim:C.accentFaint,fontSize:18,cursor:canBack?"pointer":"default",padding:"0 2px",lineHeight:1}}>←</button>
        <button onClick={goFwd} disabled={!canFwd} style={{background:"transparent",border:"none",color:canFwd?C.accentDim:C.accentFaint,fontSize:18,cursor:canFwd?"pointer":"default",padding:"0 2px",lineHeight:1}}>→</button>
        <button onClick={()=>{setFuTxt("");setShowFU(true);}} style={{flex:1,background:C.cardBg,border:`1px solid ${C.border}`,color:C.textDim,fontFamily:"'Courier New',monospace",fontSize:13,padding:"10px 12px",cursor:"text",textAlign:"left",outline:"none",borderRadius:4}}>
          {busy?"…":"ask follow-up…"}
        </button>
        <button onClick={()=>{setFuTxt("");setShowFU(true);}} style={{width:36,height:36,borderRadius:6,background:"transparent",border:`1px solid ${C.accentDim}`,color:C.accentDim,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0}}>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </button>
      </div>

      {/* Follow-up modal */}
      {showFU&&(()=>{
        const faint=dark?"rgba(0,255,136,0.22)":"rgba(0,180,80,0.3)",ac=dark?"#00ff88":"#006622";
        return(
          <div style={{position:"fixed",inset:0,zIndex:300,background:dark?"#000":"#e8f5ec",display:"flex",flexDirection:"column",overflow:"hidden"}}>
            <MatrixRain opacity={dark?1:0.18}/>
            <div style={{position:"relative",zIndex:1,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 16px",borderBottom:`1px solid ${faint}`,flexShrink:0}}>
              <span style={{fontSize:9,color:dark?"rgba(0,255,136,0.45)":"rgba(0,100,40,0.6)",letterSpacing:4,fontFamily:"'Courier New',monospace"}}>INPUT</span>
              <button onClick={()=>setShowFU(false)} style={{background:"transparent",border:`1px solid ${faint}`,color:dark?"rgba(0,255,136,0.7)":"rgba(0,120,50,0.8)",fontFamily:"'Courier New',monospace",fontSize:9,padding:"4px 12px",cursor:"pointer",letterSpacing:2,borderRadius:4}}>✕ CLOSE</button>
            </div>
            <div style={{position:"relative",zIndex:1,flex:1,display:"flex",flexDirection:"column",padding:"20px 16px 16px",gap:14}}>
              <textarea value={fuTxt} onChange={e=>setFuTxt(e.target.value)} autoFocus
                onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.metaKey){e.preventDefault();if(!fuTxt.trim()||busy)return;const v=fuTxt;setFuTxt("");setShowFU(false);process(v);}}}
                placeholder="ask follow-up…"
                style={{flex:1,background:dark?"rgba(0,0,0,0.72)":"rgba(255,255,255,0.72)",border:`1px solid ${faint}`,color:dark?"#00ff88":"#003d18",fontFamily:"'Courier New',monospace",fontSize:15,lineHeight:1.65,padding:"16px",outline:"none",resize:"none",caretColor:ac,borderRadius:6}}/>
              <button onClick={()=>{if(!fuTxt.trim()||busy)return;const v=fuTxt;setFuTxt("");setShowFU(false);process(v);}}
                disabled={busy||!fuTxt.trim()}
                style={{background:"transparent",border:`1px solid ${busy||!fuTxt.trim()?faint:ac}`,color:busy||!fuTxt.trim()?faint:(dark?"#00ff88":"#003d18"),fontFamily:"'Courier New',monospace",fontSize:11,padding:"14px",cursor:busy||!fuTxt.trim()?"not-allowed":"pointer",letterSpacing:3,borderRadius:6,opacity:busy||!fuTxt.trim()?0.4:1}}>
                {busy?"ГЕНЕРИРУЮ…":"↳ SEND"}
              </button>
            </div>
          </div>
        );
      })()}

      {/* Sessions sidebar */}
      {showBar&&(
        <>
          <div onClick={()=>setShowBar(false)} style={{position:"fixed",inset:0,zIndex:190,background:"rgba(0,0,0,0.55)"}}/>
          <div style={{position:"fixed",top:0,left:0,bottom:0,width:"78vw",maxWidth:310,zIndex:200,background:C.bg,borderRight:`1px solid ${C.border}`,display:"flex",flexDirection:"column"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 14px 12px",borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
              <span style={{fontSize:10,letterSpacing:4,color:C.textDim,fontFamily:"'Courier New',monospace"}}>SESSIONS</span>
              <button onClick={()=>setShowBar(false)} style={{background:"none",border:"none",color:C.textDim,fontSize:20,cursor:"pointer",lineHeight:1}}>✕</button>
            </div>
            <button onClick={()=>{setShowBar(false);setView("input");setInputText("");}}
              style={{display:"flex",alignItems:"center",gap:10,margin:"10px 12px 4px",padding:"10px 12px",background:"none",border:`1px solid ${C.border}`,color:C.text,fontFamily:"'Courier New',monospace",fontSize:11,cursor:"pointer",borderRadius:6,letterSpacing:1}}>
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>New map
            </button>
            <div style={{flex:1,overflowY:"auto",padding:"4px 0"}}>
              {sessions.length===0&&<div style={{padding:"24px 16px",fontSize:11,color:C.textDim,fontFamily:"'Courier New',monospace",textAlign:"center"}}>No saved sessions yet</div>}
              {sessions.map(s=>(
                <div key={s.id} style={{display:"flex",alignItems:"center",borderBottom:`1px solid ${C.border}`,margin:"0 12px"}}>
                  <button onClick={()=>{setTreeSave(s.tree);setPos({});setHist([s.tree]);setHistIdx(0);histIdxRef.current=0;setShowBar(false);setView("map");}}
                    style={{flex:1,background:"none",border:"none",color:C.text,fontFamily:"'Courier New',monospace",fontSize:12,textAlign:"left",padding:"12px 4px",cursor:"pointer",lineHeight:1.3}}>
                    <div style={{fontSize:12,marginBottom:2}}>{trunc(s.goal||"Untitled",26)}</div>
                    <div style={{fontSize:9,color:C.textDim}}>{new Date(s.ts).toLocaleDateString()} · {s.nc} nodes</div>
                  </button>
                  <button onClick={()=>{const upd=loadSessions().filter(x=>x.id!==s.id);saveSessions(upd);setSessions(upd);}}
                    style={{background:"none",border:"none",color:C.textDim,fontSize:18,cursor:"pointer",padding:"8px 8px",flexShrink:0}}>×</button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Related */}
      {showRel&&(
        <div style={{position:"fixed",inset:0,zIndex:200,background:"rgba(0,0,0,0.72)",display:"flex",alignItems:"flex-end"}} onClick={e=>{if(e.target===e.currentTarget)setShowRel(false);}}>
          <div style={{width:"100%",background:C.bg,border:`1px solid ${C.border}`,borderRadius:"8px 8px 0 0",padding:"20px 16px calc(24px + env(safe-area-inset-bottom))",maxHeight:"65vh",overflowY:"auto"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
              <span style={{fontSize:9,letterSpacing:4,color:C.textDim}}>RELATED TOPICS</span>
              <button onClick={()=>setShowRel(false)} style={{background:"none",border:"none",color:C.accentDim,fontSize:20,cursor:"pointer",lineHeight:1}}>✕</button>
            </div>
            {relLoad&&<div style={{fontSize:11,color:C.textDim}}><span style={{animation:"blink 0.5s step-end infinite"}}>generating…</span></div>}
            {relList.map((t,i)=>(
              <button key={i} onClick={()=>{setShowRel(false);setTimeout(()=>process(t),50);}}
                style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",padding:"13px 0",background:"none",border:"none",borderBottom:`1px solid ${C.border}`,cursor:"pointer",color:C.text,fontSize:12,fontFamily:"'Courier New',monospace",textAlign:"left"}}>
                <span>{t}</span><span style={{color:C.accentDim,fontSize:16}}>→</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Report */}
      {showRep&&(
        <div style={{position:"fixed",inset:0,zIndex:200,background:"rgba(0,0,0,0.72)",display:"flex",alignItems:"flex-end"}} onClick={e=>{if(e.target===e.currentTarget)setShowRep(false);}}>
          <div style={{width:"100%",background:C.bg,border:`1px solid ${C.border}`,borderRadius:"8px 8px 0 0",padding:"24px 16px calc(28px + env(safe-area-inset-bottom))"}}>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:2,marginBottom:6,color:C.accent}}>MIND MAP ISSUE?</div>
            <div style={{fontSize:10,color:C.textDim,marginBottom:16}}>Describe what went wrong.</div>
            <textarea value={repTxt} onChange={e=>setRepTxt(e.target.value)} placeholder="Describe the issue…" rows={4}
              style={{width:"100%",background:C.cardBg,border:`1px solid ${C.border}`,color:C.text,fontFamily:"'Courier New',monospace",fontSize:12,padding:"10px 12px",outline:"none",resize:"none",boxSizing:"border-box",borderRadius:4}}/>
            <div style={{display:"flex",gap:10,marginTop:14}}>
              <button onClick={()=>setShowRep(false)} style={{flex:1,background:"transparent",border:`1px solid ${C.border}`,color:C.accentDim,fontFamily:"'Courier New',monospace",fontSize:10,padding:"11px 0",cursor:"pointer",letterSpacing:2,borderRadius:4}}>CANCEL</button>
              <button onClick={()=>{setShowRep(false);setRepTxt("");lg("o","✓ report sent");}} style={{flex:1,background:"transparent",border:`1px solid ${C.accent}`,color:C.accent,fontFamily:"'Courier New',monospace",fontSize:10,padding:"11px 0",cursor:"pointer",letterSpacing:2,borderRadius:4}}>SUBMIT</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
        @keyframes nodeIn{from{opacity:0;transform:scale(0.5)}to{opacity:1;transform:scale(1)}}
        *{box-sizing:border-box;}
        input::placeholder,textarea::placeholder{color:rgba(0,255,136,0.3);}
        button{outline:none;}
      `}</style>
    </div>
  );
}