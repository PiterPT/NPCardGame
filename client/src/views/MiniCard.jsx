import React, { useState } from 'react';
import { API_URL } from '../lib/api';

// Tenta vários nomes de campo comuns para a imagem da carta.
// Se o teu campo tiver outro nome, acrescenta-o aqui.
const IMAGE_FIELDS = ['image_url', 'imageUrl', 'image', 'img', 'imagem', 'url_imagem', 'art', 'thumbnail'];

function resolveImage(card) {
  for (const key of IMAGE_FIELDS) {
    const v = card?.[key];
    if (typeof v === 'string' && v.trim() !== '') {
      if (/^(https?:|data:|blob:)/i.test(v)) return v;
      return `${API_URL}${v.startsWith('/') ? '' : '/'}${v}`;
    }
  }
  return null;
}

export default function MiniCard({ card, mode, isChecked, isTarget, onToggle, onLock, onClick }) {
  const [imgFailed, setImgFailed] = useState(false);
  const src = resolveImage(card);
  const showCheckbox = (mode === 'sell' || mode === 'feed') && !isTarget;
  const selectable = mode === 'feed' || mode === 'view';

  const classes = [
    'card',
    'mini-card',
    isChecked ? 'mini-card--checked' : '',
    isTarget ? 'mini-card--target' : '',
    selectable ? 'mini-card--selectable' : ''
  ].filter(Boolean).join(' ');

  return (
    <div
      className={classes}
      onClick={onClick}
      role={selectable ? 'button' : undefined}
      tabIndex={selectable ? 0 : undefined}
      onKeyDown={(e) => {
        if (selectable && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick?.();
        }
      }}
      title={card.name}
    >
      <button
        type="button"
        className={`mini-card__lock${card.is_locked ? ' mini-card__lock--locked' : ''}`}
        onClick={(e) => onLock?.(e, card.id_card)}
        aria-label={card.is_locked ? 'Destrancar carta' : 'Trancar carta'}
        aria-pressed={!!card.is_locked}
      >
        {card.is_locked ? '🔒' : '🔓'}
      </button>

      {showCheckbox && (
        <label className="mini-card__check" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={!!isChecked}
            disabled={!!card.is_locked}
            onChange={() => onToggle?.(card)}
            aria-label={`Selecionar ${card.name}`}
          />
        </label>
      )}

      {src && !imgFailed ? (
        <div className="card__art">
          <img src={src} alt={card.name} loading="lazy" onError={() => setImgFailed(true)} />
        </div>
      ) : (
        <div className="card__art card__art--placeholder">{card.name}</div>
      )}

      {/* Mantido no DOM para acessibilidade; o CSS esconde-o e o Inventory mostra nível/estrelas */}
      <div className="card__header">
        <span className="card__name">{card.name}</span>
      </div>
    </div>
  );
}
