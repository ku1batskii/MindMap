import { useEffect } from "react";

export default function usePointerControls(svgRef, posRef, tfmRef, applyT, flushT, editModeRef, setSelId, setEditId){
  useEffect(() => {
    const svg = svgRef.current; if(!svg) return;
    const pointers = new Map(); let drag=null, pan=null, lastMid=null, lastDist=null;

    const getMid = () => { const [p1,p2] = [...pointers.values()]; return {x:(p1.x+p2.x)/2, y:(p1.y+p2.y)/2}; };
    const getDist = () => { const [p1,p2] = [...pointers.values()]; const dx=p1.x-p2.x, dy=p1.y-p2.y; return Math.sqrt(dx*dx+dy*dy); };

    const down = (e) => {
      e.preventDefault(); svg.setPointerCapture(e.pointerId); pointers.set(e.pointerId,{x:e.clientX, y:e.clientY});
      if(pointers.size===1){
        let el=e.target,nid=null; while(el && el!==svg){ if(el.dataset?.nodeid){ nid=el.dataset.nodeid; break;} el=el.parentElement; }
        if(nid){ const p=posRef.current[nid]||{x:0,y:0}; drag={id:nid, ox:p.x, oy:p.y, sx:e.clientX, sy:e.clientY, moved:false}; } 
        else { const t=tfmRef.current; pan={ox:t.x, oy:t.y, sx:e.clientX, sy:e.clientY, moved:false}; }
      }
      if(pointers.size===2){ drag=null; pan=null; lastMid=getMid(); lastDist=getDist(); }
    };

    const move=(e)=>{ if(!pointers.has(e.pointerId)) return; e.preventDefault(); pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(pointers.size===1 && drag){ const dx=e.clientX-drag.sx, dy=e.clientY-drag.sy; if(Math.sqrt(dx*dx+dy*dy)>4) drag.moved=true; posRef.current[drag.id]={x:drag.ox+dx,y:drag.oy+dy}; }
      else if(pointers.size===1 && pan){ const dx=e.clientX-pan.sx, dy=e.clientY-pan.sy; if(Math.sqrt(dx*dx+dy*dy)>2) pan.moved=true; applyT({...tfmRef.current,x:pan.ox+dx,y:pan.oy+dy}); }
      else if(pointers.size===2 && lastMid && lastDist){ const t=tfmRef.current, mid=getMid(), dist=getDist(); const rect=svg.getBoundingClientRect();
        const px=mid.x-rect.left, py=mid.y-rect.top;
        const newScale=Math.min(5,Math.max(0.05,(t.scale*dist)/lastDist));
        const factor=newScale/t.scale;
        applyT({ scale:newScale, x:px-factor*(px-t.x)+(mid.x-lastMid.x), y:py-factor*(py-t.y)+(mid.y-lastMid.y)}); lastMid=mid; lastDist=dist;
      }
    };

    const up=(e)=>{ e.preventDefault(); pointers.delete(e.pointerId);
      if(pointers.size===0){ flushT(tfmRef.current);
        if(drag && !drag.moved && editModeRef.current && drag.id!=="ROOT"){ setSelId(prev=>prev===drag.id?null:drag.id); setEditId(null); }
        if(pan && !pan.moved && editModeRef.current){ setSelId(null); setEditId(null); }
        drag=null; pan=null; lastMid=null; lastDist=null;
      }
    };

    svg.addEventListener("pointerdown", down, { passive:false });
    svg.addEventListener("pointermove", move, { passive:false });
    svg.addEventListener("pointerup", up);
    svg.addEventListener("pointercancel", up);
    return ()=>{ svg.removeEventListener("pointerdown", down); svg.removeEventListener("pointermove", move); svg.removeEventListener("pointerup", up); svg.removeEventListener("pointercancel", up); };
  }, [svgRef, posRef, tfmRef, applyT, flushT, editModeRef, setSelId, setEditId]);
}