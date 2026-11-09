import React from 'react';
import '../styles/cardDetail.css';

export default function CardDetail({ card, onBack, onPrev, onNext, onApply }) {
  if (!card) {
    return (
      <div className="card-detail">
        <div className="card-not-found">
          <div className="card-not-found-icon">📜</div>
          <h3 className="card-not-found-title">Carta não encontrada</h3>
          <p className="card-not-found-desc">O pergaminho que procuras desvaneceu-se nas brumas.</p>
          <button className="card-btn-ghost" onClick={onBack}>Voltar ao Inventário</button>
        </div>
      </div>
    );
  }

  // Simulação de dados de afinidade / progresso inspirados na referência
  const affinity = card.affinity || { current: 3500, max: 20000, level: 3 };
  const affinityPct = Math.min(100, (affinity.current / affinity.max) * 100);

  return (
    <div className="card-detail">
      {/* Barra de Navegação Superior */}
      <div className="card-nav-row">
        <button className="card-btn-ghost" onClick={onBack}>← Voltar</button>
        <div className="card-arrows">
          <span className="card-arrow-label">Navegar Cartas</span>
          <button className="card-arrow-btn" onClick={onPrev}>‹</button>
          <button className="card-arrow-btn" onClick={onNext}>›</button>
        </div>
      </div>

      {/* Layout Principal em 2 Colunas */}
      <div className="card-main-layout">
        
        {/* Coluna Esquerda: Termómetro de Afinidade / Níveis */}
        <div className="card-affinity-panel">
          <div className="card-affinity-header">
            Max Affection increased upon reaching Max Affinity Level!
          </div>

          <div className="card-affinity-track-container">
            {/* Ícones / Marcos de Nível (LV.5 até LV.1) */}
            <div className="card-affinity-milestones">
              <div className="milestone-node">📜</div>
              <div className="milestone-node">🛡️</div>
              <div className="milestone-node acquired">💎</div>
              <div className="milestone-node acquired">⚔️</div>
              <div className="milestone-node acquired">✨</div>
            </div>

            {/* Barra Vertical de Progresso */}
            <div className="affinity-vertical-bar">
              <div 
                className="affinity-progress-fill" 
                style={{ height: `${affinityPct}%` }}
              />
            </div>

            {/* Rótulos dos Níveis */}
            <div className="card-affinity-labels">
              <span>LV.5</span>
              <span>LV.4</span>
              <span>LV.3</span>
              <span>LV.2</span>
              <span>LV.1</span>
            </div>
          </div>

          {/* Contador de pontos atual / máximo */}
          <div className="affinity-counter-badge">
            {affinity.current} / {affinity.max}
          </div>
        </div>

        {/* Coluna Direita: Moldura do Herói & Raridade */}
        <div className="card-stage-container">
          <div className="card-header-badge-row">
            <span className="card-rarity-badge-large">{card.classe || 'UR'}</span>
            <div className="card-title-group">
              <span className="card-subtitle-tag">[{card.subtitle || 'Nunchaku'}]</span>
              <h2 className="card-title">{card.name || 'Adventurer Ban'}</h2>
            </div>
          </div>

          <div className="card-art-frame">
            {card.image_url ? (
              <img src={card.image_url} alt={card.name} className="card-art" />
            ) : (
              <div className="card-art-missing">🛡️</div>
            )}
            <button className="card-change-hero-btn">
              ⚙️ Change Hero
            </button>
          </div>
        </div>

      </div>

      {/* Secção Inferior: Slots de Itens e Botão de Ação */}
      <div className="card-footer-section">
        <div className="card-items-grid">
          {(card.items || [
            { icon: '🍾', count: 16 },
            { icon: '🍖', count: 10 },
            { icon: '💖', count: 1 },
            { icon: '🥗', count: 0 }
          ]).map((item, idx) => (
            <div key={idx} className="card-item-slot">
              <span className="card-item-icon">{item.icon}</span>
              <span className="card-item-count">{item.count}</span>
            </div>
          ))}
        </div>

        <button 
          className="card-apply-action-btn"
          onClick={onApply}
          disabled={!card}
        >
          Apply
        </button>
      </div>

    </div>
  );
}