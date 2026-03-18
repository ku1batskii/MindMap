const LS_KEY = "mindmap_sessions";
const VERSION = 2;
const MAX_SESSIONS = 20;

function read() {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) || "null");
    // Version migration
    if (!raw) return [];
    if (raw.version !== VERSION) return []; // clear on schema change
    return raw.data || [];
  } catch { return []; }
}

function write(sessions) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ version: VERSION, data: sessions.slice(0, MAX_SESSIONS) }));
  } catch {}
}

export function loadSessions() {
  return read();
}

export function upsertSession(tree) {
  if (!tree.goal || !tree.nodes.length) return;
  const existing = read();
  const entry = {
    id: tree.goal + "_" + Date.now(),
    goal: tree.goal,
    nodeCount: tree.nodes.length,
    ts: Date.now(),
    tree,
  };
  // Replace session with same goal, or prepend
  const updated = [entry, ...existing.filter(s => s.goal !== tree.goal)];
  write(updated);
  return updated;
}

export function deleteSession(id) {
  const updated = read().filter(s => s.id !== id);
  write(updated);
  return updated;
}