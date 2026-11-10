import React from 'react';
import { OverallRankBadge, CardStatsCompact } from '../lib/statRank';

export default function MiniCard({ card, mode, isChecked, isTarget, onToggle, onLock, sellValue, onClick }) {
  const currentLevel = card.level || 1;
  const currentXp = card.xp || 0;
  const xpNeeded = currentLevel * 1000;
  const rarity = (card.classe || 'E').toLowerCase();
  const selectable = mode === 'feed' && !isTarget && !card.is_locked;

  const handleKeyDown = (e) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div
      className={
        'card mini-card' +
        (isTarget ? ' mini-card--target' : '') +
        (isChecked ? ' mini-card--checked' : '') +
        (selectable ? ' mini-card--selectable' : '')
      }
      data-rarity={card.classe?.toLowerCase()}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
    >
      <button
        type="button"
        className={'mini-card__lock' + (card.is_locked ? ' mini-card__lock--locked' : '')}
        aria-label={card.is_locked ? 'Destrancar carta' : 'Trancar carta'}
        aria-pressed={card.is_locked}
        onClick={(e) => onLock(e, card.id_card)}
      >
        {card.is_locked ? '🔒' : '🔓'}
      </button>

      {mode !== 'view' && (!isTarget || mode === 'sell') && (
        <label className="mini-card__check" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={isChecked}
            disabled={card.is_locked}
            aria-label={`Selecionar ${card.name}`}
            onChange={() => onToggle(card)}
            onClick={(e) => e.stopPropagation()}
          />
        </label>
      )}

      <div className="card__badges">
        <span className="badge badge--rarity" data-rarity={rarity}>
          {card.classe || 'E'}
        </span>
        <span className="badge badge--level">Nvl {currentLevel}</span>
        <OverallRankBadge card={card} />
      </div>

      <div className="card__art">
        {card.image_url ? (
          <img src={card.image_url} alt={card.name} />
        ) : (
          <div className="card__art--placeholder">Sem Imagem</div>
        )}
      </div>

      <div className="card__header">
        <h4 className="card__title">{card.name}</h4>
        <div className="mini-card__xp">
          XP: {currentXp} / {xpNeeded}
        </div>
        {mode === 'sell' && isChecked && sellValue !== undefined && (
          <div className="mini-card__sell">💰 {sellValue} Ryos</div>
        )}
      </div>

      <div className="card__stats">
        <CardStatsCompact card={card} fontSize="11px" gap="5px" />
      </div>
    </div>
  );
}