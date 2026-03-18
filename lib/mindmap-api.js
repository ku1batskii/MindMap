import CLIENT_CONFIG from '../config.js';
import { uid, fallback, smartTitle } from './mindmap-utils.js';

// ─── Race condition guard ─────────────────────────────────────────────────────
let _lastReqId = 0;

async function callAI(messages, maxTokens = 1600) {
  const res = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: maxTokens, messages }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "API error");
  return (data.content?.[0]?.text) || "";
}

function parseJSON(raw) {
  const clean = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const match = clean.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

// ─── Main map generation ──────────────────────────────────────────────────────
export async function fetchMap(input, tree, reqId) {
  const ids = tree.nodes.map(n => n.id);
  const maxN = ids.reduce((m, id) => { const n = parseInt(id.replace(/\D/g, ""), 10); return isNaN(n) ? m : Math.max(m, n); }, 0);
  const compact = {
    goal: tree.goal,
    nodes: tree.nodes.map(n => ({ id: n.id, title: n.title, note: n.note, type: n.type, parentId: n.parentId }))
  };

  const prompt =
    "Return ONLY raw JSON, no markdown, no backticks.\n" +
    'Schema: {"goal":"string","nodes":[{"id":"n1","note":"1-2 sentences","type":"idea|subgoal|step|risk|alternative","confidence":"high|medium|low","parentId":null}]}\n' +
    "Rules: Extract 4-10 distinct ideas. note=clear summary 1-2 sentences. " +
    "type: idea=concept, subgoal=goal, step=action, risk=danger/problem, alternative=other option. risk for ANYTHING negative. " +
    CLIENT_CONFIG.systemContext +
    " Keep existing nodes. New IDs from n" + (maxN + 1) + ". parentId refs existing or null. Same language as input.\n" +
    "Existing: " + JSON.stringify(compact) + "\nInput: " + input;

  const raw1 = await callAI([{ role: "user", content: prompt }]);

  // Check if this request is still current
  if (reqId !== undefined && reqId !== _lastReqId) return null;

  const p = parseJSON(raw1);
  if (!p) return fallback(input);

  const VT = ["idea", "subgoal", "step", "risk", "alternative"];
  const VC = ["high", "medium", "low"];
  p.goal = p.goal || tree.goal || input.slice(0, 50) || "Map";
  p.nodes = (Array.isArray(p.nodes) ? p.nodes : []).map(n => ({
    id: String(n.id || uid()),
    title: "",
    note: String(n.note || "").replace(/"/g, "'"),
    type: VT.includes(n.type) ? n.type : "idea",
    confidence: VC.includes(n.confidence) ? n.confidence : "medium",
    parentId: n.parentId || null,
  }));

  const newNodes = p.nodes.filter(n => !tree.nodes.find(e => e.id === n.id));

  // Generate titles for new nodes
  if (newNodes.length > 0) {
    const notesList = newNodes.map((n, i) => (i + 1) + ". " + n.note).join("\n");
    const titlePrompt =
      "For each numbered note, write a UNIQUE 2-3 word title.\n" +
      "Rules:\n- Thematic label, like chapter title.\n- NEVER use first words of note.\n" +
      "- Return ONLY JSON array of strings. No markdown. Same language.\n\n" +
      "Already used: " + tree.nodes.filter(n => n.title).map(n => n.title).join(", ") + "\n\n" +
      "Notes:\n" + notesList;

    try {
      const raw2 = await callAI([{ role: "user", content: titlePrompt }], 800);
      if (reqId !== undefined && reqId !== _lastReqId) return null;
      const clean2 = raw2.replace(/```json/gi, "").replace(/```/g, "").trim();
      const arr = JSON.parse(clean2.match(/\[[\s\S]*\]/)?.[0] || "[]");
      newNodes.forEach((n, i) => { n.title = String(arr[i] || "").trim() || n.note.split(" ").slice(0, 3).join(" "); });
    } catch {
      newNodes.forEach(n => { n.title = n.note.split(" ").slice(0, 3).join(" "); });
    }
  }

  // Preserve existing titles
  tree.nodes.forEach(old => { const f = p.nodes.find(n => n.id === old.id); if (f) f.title = old.title; });
  return p;
}

export async function fetchRelatedTopics(goal) {
  const prompt = `Given mind map topic "${goal}", suggest 7 related topics. Return ONLY a JSON array of short strings (max 6 words each). Same language.`;
  const raw = await callAI([{ role: "user", content: prompt }], 300);
  const clean = raw.replace(/```json|```/g, "").trim();
  return JSON.parse(clean.match(/\[[\s\S]*\]/)?.[0] || "[]").slice(0, 7);
}

export function setLastReqId(id) { _lastReqId = id; }
export function getLastReqId() { return _lastReqId; }