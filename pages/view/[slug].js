import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const TFILL   = {idea:'#002a38',subgoal:'#00210f',step:'#181e18',risk:'#280010',alternative:'#160028'};
const TSTROKE = {idea:'#00d4ff',subgoal:'#00ff55',step:'#88bb88',risk:'#ff2255',alternative:'#bb66ff'};
const TCOLOR  = {idea:'#33eeff',subgoal:'#00ffaa',step:'#aaccaa',risk:'#ff4477',alternative:'#cc88ff'};
const NW = 180, RW = 210, RH = 52;

function wrapText(text, max) {
  const words = (text || '').split(' ');
  const lines = []; let cur = '';
  for (const w of words) {
    const c = cur ? cur + ' ' + w : w;
    if (c.length <= max) cur = c;
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

function nodeHeight(title, note) {
  const tl = Math.max(wrapText(title || '', 17).length, 1);
  const nl = note ? wrapText(note, 21).length : 0;
  return 9 + tl * 16 + (nl > 0 ? 5 + 1 + 6 + nl * 13 : 5) + 14 + 8;
}

function trunc(s, n) { return s && s.length > n ? s.slice(0, n) + '…' : s || ''; }

export default function ViewPage({ tree, pos }) {
  if (!tree) return <div style={{ background: '#090909', color: '#ff4477', height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace' }}>Карта не найдена</div>;

  const edges = [];
  if (tree.goal) {
    const rp = pos['ROOT'];
    tree.nodes.filter(n => !n.parentId).forEach(n => {
      const p = pos[n.id];
      const nh = nodeHeight(n.title, n.note);
      if (rp && p) edges.push({ id: 'r-' + n.id, sx: rp.x, sy: rp.y + RH / 2, tx: p.x, ty: p.y - nh / 2 });
    });
  }
  tree.nodes.forEach(n => {
    if (!n.parentId) return;
    const pp = pos[n.parentId], cp = pos[n.id];
    const pNode = tree.nodes.find(x => x.id === n.parentId);
    const pnh = nodeHeight(pNode?.title, pNode?.note);
    const cnh = nodeHeight(n.title, n.note);
    if (pp && cp) edges.push({ id: n.parentId + '-' + n.id, sx: pp.x, sy: pp.y + pnh / 2, tx: cp.x, ty: cp.y - cnh / 2 });
  });

  const pts = Object.values(pos);
  const pad = 110;
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad;
  const y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad;
  const vb = `${x0} ${y0} ${x1 - x0} ${y1 - y0}`;

  return (
    <div style={{ background: '#090909', height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px', borderBottom: '1px solid #1e4428', flexShrink: 0 }}>
        <span style={{ fontSize: 10, color: 'rgba(0,255,136,0.55)', letterSpacing: 4, fontFamily: 'monospace' }}>MIND MAP</span>
        <span style={{ fontSize: 10, color: '#44aa66', marginLeft: 'auto', fontFamily: 'monospace' }}>{tree.nodes.length} nodes · read only</span>
      </div>
      <svg style={{ flex: 1 }} viewBox={vb} preserveAspectRatio="xMidYMid meet">
        <defs>
          <marker id="arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" fill="rgba(0,220,100,0.45)" />
          </marker>
          <pattern id="dots" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
            <circle cx="14" cy="14" r="0.7" fill="#1a221a" />
          </pattern>
        </defs>
        <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill="url(#dots)" />
        {edges.map(e => {
          const isH = Math.abs(e.tx - e.sx) >= Math.abs(e.ty - e.sy);
          const mx = (e.sx + e.tx) / 2, my = (e.sy + e.ty) / 2;
          const d = isH
            ? `M${e.sx},${e.sy} C${mx},${e.sy} ${mx},${e.ty} ${e.tx},${e.ty}`
            : `M${e.sx},${e.sy} C${e.sx},${my} ${e.tx},${my} ${e.tx},${e.ty}`;
          return <path key={e.id} d={d} fill="none" stroke="rgba(0,220,100,0.35)" strokeWidth="1.5" markerEnd="url(#arr)" />;
        })}
        {tree.goal && pos['ROOT'] && (
          <g transform={`translate(${pos['ROOT'].x},${pos['ROOT'].y})`}>
            <rect x={-RW/2} y={-RH/2} width={RW} height={RH} rx={7} fill="#002210" stroke="#00ff88" strokeWidth={1.5} />
            <text textAnchor="middle" dominantBaseline="middle" fill="#00ff88" fontSize={12} fontFamily="'Courier New',monospace">{trunc(tree.goal, 28)}</text>
          </g>
        )}
        {tree.nodes.map(n => {
          const p = pos[n.id]; if (!p) return null;
          const fill = TFILL[n.type] || '#111';
          const stroke = TSTROKE[n.type] || '#444';
          const color = TCOLOR[n.type] || '#aaa';
          const nh = nodeHeight(n.title, n.note);
          const titleLines = wrapText(n.title || '', 17);
          const noteLines = wrapText(n.note || '', 21);
          const TOP = -nh / 2;
          let curY = TOP + 9 + 16 * 0.82;
          return (
            <g key={n.id} transform={`translate(${p.x},${p.y})`}>
              <rect x={-NW/2} y={TOP} width={NW} height={nh} rx={6} fill={fill} stroke={stroke} strokeWidth={1.5} />
              {titleLines.map((line, li) => (
                <text key={'t'+li} x={-NW/2+10} y={curY+li*16} fill={color} fontSize={11} fontWeight="700" fontFamily="'Courier New',monospace">{line}</text>
              ))}
              {noteLines.length > 0 && (() => {
                const divY = TOP + 9 + titleLines.length * 16 + 5;
                return <line x1={-NW/2+10} y1={divY} x2={NW/2-10} y2={divY} stroke={stroke} strokeWidth={0.5} opacity={0.3} />;
              })()}
              {noteLines.map((line, li) => {
                const divY = TOP + 9 + titleLines.length * 16 + 5 + 1;
                const noteY0 = divY + 6 + 13 * 0.82;
                return <text key={'n'+li} x={-NW/2+10} y={noteY0+li*13} fill={color} fontSize={10} opacity={0.62} fontFamily="'Courier New',monospace">{line}</text>;
              })}
              <text textAnchor="start" x={-NW/2+8} y={nh/2-3} fill={stroke} fontSize={7} opacity={0.4} letterSpacing={1} fontFamily="'Courier New',monospace">{n.type.toUpperCase()}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export async function getServerSideProps({ params }) {
  try {
    const redis = new Redis({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    });
    const data = await redis.get(`map:${params.slug}`);
    if (!data) return { notFound: true };
    const { tree, pos } = typeof data === 'string' ? JSON.parse(data) : data;
    return { props: { tree, pos } };
  } catch (e) {
    return { notFound: true };
  }
}
