import React from 'react';
import { OverallRankBadge, CardStatsCompact } from '../lib/statRank';
import { API_URL } from '../lib/api';

const imgSrc = (u) => (u && u.startsWith('/') ? `${API_URL}${u}` : u);

export default function PlayerResultCard({ side, isWinner }) {
  const delta = side.pointsDelta;
  return (
    <div className={`pvp-result-card ${isWinner ? 'pvp-result-card--winner' : 'pvp-result-card--loser'}`}>
      <div className="pvp-result-header">
        <div className="pvp-result-icon" aria-hidden="true">{isWinner ? '🏆' : '☠️'}</div>
        <strong className="pvp-result-name">{side.name}</strong>
        <div className={`pvp-result-status ${isWinner ? 'pvp-result-status--winner' : 'pvp-result-status--loser'}`}>
          {isWinner ? 'VENCEDOR' : 'DERROTADO'}
        </div>
      </div>
      <div className="pvp-result-stats">
        <div className="pvp-result-stat">
          <span className="pvp-result-stat-label">Posição</span>
          <strong className="pvp-result-stat-value">#{side.rankBefore}{side.rankAfter !== side.rankBefore ? ` → #${side.rankAfter}` : ''}</strong>
        </div>
        <div className="pvp-result-stat">
          <span className="pvp-result-stat-label">Pontos</span>
          <strong className={`pvp-result-stat-value ${delta >= 0 ? 'pvp-result-stat-value--gain' : 'pvp-result-stat-value--loss'}`}>{delta >= 0 ? `+${delta}` : delta}</strong>
        </div>
        <div className="pvp-result-stat">
          <span className="pvp-result-stat-label">Poder</span>
          <strong className="pvp-result-stat-value">{side.power}</strong>
        </div>
      </div>
      <div className="pvp-result-cards">
        {(side.cards || []).map((c, i) => (
          <div key={`${c.id_card}-${i}`} className="pvp-result-card-item">
            {c.image_url && <img src={imgSrc(c.image_url)} alt={c.name} className="pvp-result-card-img" />}
            <div className="pvp-result-card-info">
              <div className="pvp-result-card-name-row">
                <span className="pvp-result-card-name">{c.name}</span>
                <OverallRankBadge card={c} />
              </div>
              <div className="pvp-result-card-stats">
                <CardStatsCompact card={c} fontSize="10px" justify="flex-start" gap="5px" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
