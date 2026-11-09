import React from 'react';

// Ranks de estatísticas (UI) — R1-B1
// Fallback: D+ (pos 6, code 'D+', mult 1.0) quando statRanks ausente/nulo.
export const DEFAULT_RANK = { pos: 6, code: 'D+', mult: 1.0 };

// Mapa de posição de rank (1-24+) para variável CSS --rank-*
// D+ (pos 6) = --rank-d, C (7-9) = --rank-c, B (10-12) = --rank-b, A (13-15) = --rank-a,
// S (16-18) = --rank-s, SS (19-21) = --rank-ss, SSS (22+) = --rank-sss
// F (1-3) e D (4-5) usam --rank-d como fallback (não há variáveis dedicadas)
const RANK_POS_TO_VAR = {
  1: '--rank-d', 2: '--rank-d', 3: '--rank-d', // F
  4: '--rank-d', 5: '--rank-d',                // D
  6: '--rank-d',                               // D+
  7: '--rank-c', 8: '--rank-c', 9: '--rank-c', // C
  10: '--rank-b', 11: '--rank-b', 12: '--rank-b', // B
  13: '--rank-a', 14: '--rank-a', 15: '--rank-a', // A
  16: '--rank-s', 17: '--rank-s', 18: '--rank-s', // S
  19: '--rank-ss', 20: '--rank-ss', 21: '--rank-ss', // SS
  22: '--rank-sss', 23: '--rank-sss', 24: '--rank-sss', // SSS
};

function rankVar(pos) {
  const p = Number(pos);
  if (!Number.isFinite(p)) return '--rank-d';
  return RANK_POS_TO_VAR[p] ?? '--rank-sss';
}

export function getStatRanks(card) {
  const sr = card && typeof card.statRanks === 'object' && card.statRanks ? card.statRanks : {};
  const norm = (entry, fallbackValue) => {
    if (entry && typeof entry === 'object' && entry.code != null) {
      return {
        pos: Number.isFinite(Number(entry.pos)) ? Number(entry.pos) : DEFAULT_RANK.pos,
        code: String(entry.code),
        mult: entry.mult != null ? entry.mult : DEFAULT_RANK.mult,
        value: entry.value != null ? entry.value : fallbackValue
      };
    }
    return { ...DEFAULT_RANK, value: fallbackValue };
  };
  const vidaVal = card?.vida ?? 0;
  const taiVal = card?.tai ?? 0;
  const ninVal = card?.nin ?? 0;
  const overallEntry = sr.overall && typeof sr.overall === 'object' && sr.overall.code != null
    ? {
        pos: Number.isFinite(Number(sr.overall.pos)) ? Number(sr.overall.pos) : DEFAULT_RANK.pos,
        code: String(sr.overall.code),
        mult: sr.overall.mult != null ? sr.overall.mult : DEFAULT_RANK.mult
      }
    : { ...DEFAULT_RANK };
  return {
    vida: norm(sr.vida, vidaVal),
    tai: norm(sr.tai, taiVal),
    nin: norm(sr.nin, ninVal),
    overall: overallEntry
  };
}

// Legado: mantido para compatibilidade caso algum código externo chame diretamente
// Novo código deve usar a variável CSS via `var(${rankVar(pos)})` no estilo inline
export function rankColor(pos) {
  // Fallback cores para contexto não-CSS (ex: canvas, emails)
  const p = Number(pos);
  if (!Number.isFinite(p)) return '#94a3b8';
  if (p <= 3) return '#ef4444';
  if (p <= 5) return '#f97316';
  if (p === 6) return '#9ca3af';
  if (p <= 9) return '#6b7280';
  if (p <= 12) return '#3b82f6';
  if (p <= 15) return '#8b5cf6';
  if (p <= 18) return '#f59e0b';
  if (p <= 21) return '#ef4444';
  return '#d946ef';
}

export function rankGlow(pos) {
  const p = Number(pos);
  if (Number.isFinite(p) && p >= 22) return '0 0 6px rgba(217,70,239,0.55)';
  if (Number.isFinite(p) && p >= 19) return '0 0 5px rgba(239,68,68,0.35)';
  if (Number.isFinite(p) && p >= 16) return '0 0 5px rgba(245,158,11,0.3)';
  return 'none';
}

export function OverallRankBadge({ card, size = 'sm', style = {} }) {
  const { overall } = getStatRanks(card);
  const colorVar = rankVar(overall.pos);
  const fontSize = size === 'md' ? '12px' : '10px';
  const pad = size === 'md' ? '2px 8px' : '1px 6px';
  return (
    <span
      title={`Rank geral ${overall.code}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '3px',
        fontSize,
        fontWeight: 'bold',
        color: `var(${colorVar})`,
        border: `1px solid var(${colorVar})`,
        background: 'rgba(0,0,0,0.35)',
        borderRadius: '999px',
        padding: pad,
        lineHeight: 1.4,
        boxShadow: rankGlow(overall.pos),
        whiteSpace: 'nowrap',
        ...style
      }}
    >
      <span style={{ opacity: 0.85 }}>RK</span> {overall.code}
    </span>
  );
}

export function StatValue({ label, icon, stat }) {
  const colorVar = rankVar(stat.pos);
  return (
    <span
      title={`${label}: ${stat.value} (rank ${stat.code})`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', whiteSpace: 'nowrap' }}
    >
      <span>{icon}</span>
      <span style={{ color: '#ddd' }}>{stat.value}</span>
      <span
        style={{
          fontSize: '10px',
          fontWeight: 'bold',
          color: `var(${colorVar})`,
          border: `1px solid var(${colorVar})55`,
          background: `var(${colorVar})18`,
          borderRadius: '4px',
          padding: '0 3px',
          lineHeight: '14px'
        }}
      >
        {stat.code}
      </span>
    </span>
  );
}

export function CardStatsCompact({ card, showNin = true, fontSize = '11px', justify = 'center', gap = '6px' }) {
  const r = getStatRanks(card);
  return (
    <div style={{ fontSize, display: 'flex', justifyContent: justify, gap, flexWrap: 'wrap', alignItems: 'center' }}>
      <StatValue label="Vida" icon="❤️" stat={r.vida} />
      <StatValue label="Tai" icon="⚔️" stat={r.tai} />
      {showNin && <StatValue label="Nin/Chakra" icon="🌀" stat={r.nin} />}
    </div>
  );
}

export function CardStatsRows({ card }) {
  const r = getStatRanks(card);
  const rows = [
    { label: 'Vida', icon: '❤️', stat: r.vida },
    { label: 'Tai', icon: '⚔️', stat: r.tai },
    { label: 'Nin/Chakra', icon: '🌀', stat: r.nin }
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '11px' }}>
      {rows.map((row) => {
        const colorVar = rankVar(row.stat.pos);
        return (
          <div key={row.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', color: '#aaa' }}>
            <span>{row.icon} {row.label}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <strong style={{ color: '#ddd' }}>{row.stat.value}</strong>
              <span style={{ fontSize: '10px', fontWeight: 'bold', color: `var(${colorVar})`, border: `1px solid var(${colorVar})55`, background: `var(${colorVar})18`, borderRadius: '4px', padding: '0 4px' }}>{row.stat.code}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}