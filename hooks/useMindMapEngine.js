import { useState, useRef, useCallback } from "react";
import { fetchMap, fetchRelatedTopics, setLastReqId, getLastReqId } from "../lib/mindmap-api.js";
import { smartTitle, trunc } from "../lib/mindmap-utils.js";
import { loadSessions, upsertSession, deleteSession } from "../lib/sessions.js";

export function useMindMapEngine({ onLog }) {
  const [tree, setTree]       = useState({ goal: "", nodes: [] });
  const [busy, setBusy]       = useState(false);
  const [mapHistory, setMapHistory] = useState([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [sessions, setSessions] = useState(() => loadSessions());
  const [relatedList, setRelatedList]   = useState([]);
  const [relatedLoad, setRelatedLoad]   = useState(false);
  const relatedCache = useRef({});
  const histIdxRef   = useRef(-1);
  const treeRef      = useRef(tree);

  const syncTree = useCallback(t => { treeRef.current = t; setTree(t); }, []);

  // ── Process ─────────────────────────────────────────────────────────────────
  const process = useCallback(async val => {
    val = val.trim(); if (!val) return;

    if (val === "/clear") {
      syncTree({ goal: "", nodes: [] });
      setMapHistory([]); setHistIdx(-1); histIdxRef.current = -1;
      onLog("s", "- очищено -");
      return;
    }
    if (val === "/mock") {
      const mock = { goal: "ContentOS SaaS", nodes: [
        { id:"n1", title:"3 streams",    note:"Agency, SaaS and digital products as independent revenue streams",    type:"subgoal",     confidence:"high",   parentId:null },
        { id:"n2", title:"agency",       note:"Fast cashflow through client projects",                               type:"step",        confidence:"high",   parentId:"n1" },
        { id:"n3", title:"SaaS scale",   note:"ContentOS subscription, MRR grows without linear costs",             type:"step",        confidence:"high",   parentId:"n1" },
        { id:"n4", title:"dig products", note:"Templates, courses — passive income via Gumroad",                    type:"step",        confidence:"medium", parentId:"n1" },
        { id:"n5", title:"autoposting",  note:"Automatic Instagram publishing via Meta API",                         type:"idea",        confidence:"medium", parentId:"n3" },
        { id:"n6", title:"algo risk",    note:"Meta may restrict API or reduce reach",                               type:"risk",        confidence:"high",   parentId:"n5" },
        { id:"n7", title:"validation",   note:"Landing + waitlist before dev",                                       type:"step",        confidence:"high",   parentId:"n3" },
        { id:"n8", title:"UI kits",      note:"Selling Figma kits as alternative if SaaS slow",                     type:"alternative", confidence:"medium", parentId:"n4" },
      ]};
      syncTree(mock);
      setMapHistory([mock]); setHistIdx(0); histIdxRef.current = 0;
      onLog("o", "- mock " + mock.nodes.length + " nodes -");
      return;
    }

    if (busy) return;
    setBusy(true);
    onLog("u", "▸ " + trunc(val, 60));
    onLog("b", "строю карту…");

    const reqId = Date.now();
    setLastReqId(reqId);

    try {
      const updated = await fetchMap(val, treeRef.current, reqId);
      if (!updated || getLastReqId() !== reqId) return; // stale response

      const prevIds = new Set(treeRef.current.nodes.map(n => n.id));
      const fresh = updated.nodes
        .filter(n => !prevIds.has(n.id))
        .map(n => ({ ...n, title: n.title || smartTitle(n.note) }));

      const base = treeRef.current.nodes;
      const goal = updated.goal || treeRef.current.goal;
      const ids = new Set(base.map(n => n.id));
      const merged = [...base, ...fresh.filter(n => !ids.has(n.id))];
      const saved = !goal && merged.length ? { goal: merged[0].title, nodes: merged } : { goal, nodes: merged };

      syncTree(saved);

      // Persist session
      const updatedSessions = upsertSession(saved);
      if (updatedSessions) setSessions(updatedSessions);

      // History
      setMapHistory(prev => [...prev.slice(0, histIdxRef.current + 1), saved]);
      setHistIdx(prev => { const ni = prev + 1; histIdxRef.current = ni; return ni; });

      onLog("o", "✓ готово");
      return fresh.map(n => n.id); // returns new node ids for animation
    } catch (e) {
      onLog("e", "ERR: " + e.message);
      console.error(e);
    } finally {
      setBusy(false);
    }
  }, [busy, onLog, syncTree]);

  // ── History nav ──────────────────────────────────────────────────────────────
  const navBack = useCallback(() => {
    if (histIdxRef.current <= 0) return;
    const ni = histIdxRef.current - 1;
    syncTree(mapHistory[ni]);
    setHistIdx(ni); histIdxRef.current = ni;
  }, [mapHistory, syncTree]);

  const navForward = useCallback(() => {
    if (histIdxRef.current >= mapHistory.length - 1) return;
    const ni = histIdxRef.current + 1;
    syncTree(mapHistory[ni]);
    setHistIdx(ni); histIdxRef.current = ni;
  }, [mapHistory, syncTree]);

  // ── Sessions ─────────────────────────────────────────────────────────────────
  const loadSession = useCallback(s => {
    syncTree(s.tree);
    setMapHistory([s.tree]); setHistIdx(0); histIdxRef.current = 0;
  }, [syncTree]);

  const removeSession = useCallback(id => {
    const updated = deleteSession(id);
    setSessions(updated);
  }, []);

  // ── Related ──────────────────────────────────────────────────────────────────
  const fetchRelated = useCallback(async () => {
    if (!treeRef.current.goal) return;
    const goal = treeRef.current.goal;
    if (relatedCache.current[goal]) { setRelatedList(relatedCache.current[goal]); return; }
    setRelatedLoad(true); setRelatedList([]);
    try {
      const topics = await fetchRelatedTopics(goal);
      relatedCache.current[goal] = topics;
      setRelatedList(topics);
    } catch {}
    setRelatedLoad(false);
  }, []);

  // ── Edit node ────────────────────────────────────────────────────────────────
  const deleteNode = useCallback(id => {
    const nd = treeRef.current.nodes.find(n => n.id === id);
    if (!nd) return;
    syncTree({
      ...treeRef.current,
      nodes: treeRef.current.nodes
        .filter(n => n.id !== id)
        .map(n => n.parentId === id ? { ...n, parentId: nd.parentId } : n)
    });
  }, [syncTree]);

  const editNodeNote = useCallback((id, note) => {
    syncTree({ ...treeRef.current, nodes: treeRef.current.nodes.map(n => n.id === id ? { ...n, note } : n) });
  }, [syncTree]);

  return {
    tree, treeRef, busy,
    process,
    navBack, navForward,
    canBack: histIdx > 0,
    canFwd: histIdx < mapHistory.length - 1,
    sessions, loadSession, removeSession,
    relatedList, relatedLoad, fetchRelated,
    deleteNode, editNodeNote,
  };
}