import React from 'react';

// Ranks de estatísticas (UI) — R1-B1
// Fallback: D+ (pos 6, code 'D+', mult 1.0) quando statRanks ausente/nulo.
export const DEFAULT_RANK = { pos: 6, code: 'D+', mult: 1.0 };

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

// Cor por tier/nível (hierarquia clara, acessível em fundo escuro)
export function rankColor(pos) {
  const p = Number(pos);
  if (!Number.isFinite(p)) return '#94a3b8';
  if (p <= 1) return '#dc2626';       // F→ muito negativo
  if (p <= 3) return '#ef4444';       // negativo
  if (p <= 5) return '#f97316';       // D baixo (laranja)
  if (p === 6) return '#94a3b8';      // D+ neutro
  if (p <= 9) return '#4ade80';       // C verde
  if (p <= 12) return '#60a5fa';      // B azul
  if (p <= 15) return '#c084fc';      // A roxo
  if (p <= 18) return '#fbbf24';      // S dourado
  if (p <= 21) return '#f472b6';      // SS rosa/magenta
  return '#22d3ee';                    // SSS ciano/brilhante (22-24+)
}

export function rankGlow(pos) {
  const p = Number(pos);
  if (Number.isFinite(p) && p >= 22) return '0 0 6px rgba(34,211,238,0.55)';
  if (Number.isFinite(p) && p >= 19) return '0 0 5px rgba(244,114,182,0.35)';
  if (Number.isFinite(p) && p >= 16) return '0 0 5px rgba(251,191,36,0.3)';
  return 'none';
}

export function OverallRankBadge({ card, size = 'sm', style = {} }) {
  const { overall } = getStatRanks(card);
  const color = rankColor(overall.pos);
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
        color,
        border: `1px solid ${color}`,
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
  const color = rankColor(stat.pos);
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
          color,
          border: `1px solid ${color}55`,
          background: `${color}18`,
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
        const color = rankColor(row.stat.pos);
        return (
          <div key={row.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', color: '#aaa' }}>
            <span>{row.icon} {row.label}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <strong style={{ color: '#ddd' }}>{row.stat.value}</strong>
              <span style={{ fontSize: '10px', fontWeight: 'bold', color, border: `1px solid ${color}55`, background: `${color}18`, borderRadius: '4px', padding: '0 4px' }}>{row.stat.code}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}