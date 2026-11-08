import React, { useState, useEffect } from 'react';
import { API_URL, authFetch } from '../lib/api';
import { OverallRankBadge } from '../lib/statRank';
import Loader from '../components/Loader';
import '../styles/cardDetail.css';

const EVOLUTION_COST = 50000;
const fmt = (v) => Number(v || 0).toLocaleString('pt-PT');

export default function CardDetail({
  card: cardProp,
  cardId = null,
  userId = null,
  onBack,
  onPrev,
  onNext,
  hasPrev = null,
  hasNext = null
}) {
  const [card, setCard] = useState(cardProp || null);
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(!cardProp);
  const [notFound, setNotFound] = useState(!cardProp);

  // Sem carta via props: carrega a carta do inventário do utilizador autenticado.
  useEffect(() => {
    if (cardProp) {
      setCard(cardProp);
      setNotFound(false);
      setLoading(false);
      return;
    }
    if (!userId || !cardId) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    (async () => {
      try {
        const res = await authFetch(`${API_URL}/api/user/${userId}/profile`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao carregar a carta.');
        const list = (data.cards || []).slice().sort((a, b) => (Number(a.id_card) || 0) - (Number(b.id_card) || 0));
        if (cancelled) return;
        setCards(list);
        const found = list.find((c) => String(c.id_card) === String(cardId)) || null;
        setCard(found);
        setNotFound(!found);
      } catch (err) {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [cardProp, userId, cardId]);

  const currentIndex = card ? cards.findIndex((c) => String(c.id_card) === String(card.id_card)) : -1;
  const prevCard = currentIndex > 0 ? cards[currentIndex - 1] : null;
  const nextCard = currentIndex >= 0 && currentIndex < cards.length - 1 ? cards[currentIndex + 1] : null;
  const canPrev = prevCard != null;
  const canNext = nextCard != null;
  const showPrev = hasPrev ?? canPrev;
  const showNext = hasNext ?? canNext;

  const handlePrev = () => { if (prevCard && onPrev) onPrev(prevCard.id_card); };
  const handleNext = () => { if (nextCard && onNext) onNext(nextCard.id_card); };

  const currentLevel = card?.level || 1;
  const evolution = card?.evolution;
  const nextStats = evolution?.nextStats;
  const hasEvolution = Boolean(evolution && (evolution.notice || nextStats || evolution.nextLevel));

  const statRows = card ? [
    { key: 'level', label: 'Nível', icon: '⭐', current: currentLevel, next: evolution?.nextLevel ?? null },
    { key: 'hp', label: 'HP', icon: '❤️', current: card.vida ?? 0, next: nextStats?.vida ?? null },
    { key: 'atk', label: 'Ataque', icon: '⚔️', current: card.tai ?? 0, next: nextStats?.tai ?? null },
    { key: 'def', label: 'Defesa', icon: '🛡️', current: card.nin ?? 0, next: nextStats?.nin ?? null }
  ] : [];

  const evolutionNotice = evolution?.notice;
  const items = card?.items || [];

  if (loading) {
    return <Loader text="A carregar a carta..." />;
  }

  if (notFound || !card) {
    return (
      <div className="card-detail">
        <nav className="card-nav-row" aria-label="Navegação entre cartas">
          <button type="button" className="card-btn-ghost" onClick={onBack}>← Voltar</button>
        </nav>
        <div className="card-not-found">
          <div className="card-not-found-icon">🧭</div>
          <h1 className="card-not-found-title">Carta não encontrada</h1>
          <p className="card-not-found-desc">A lenda que procuras não existe ou ainda não foi revelada ao teu arsenal.</p>
          {onBack && <button type="button" className="card-btn-ghost" onClick={onBack}>← Voltar à lista</button>}
        </div>
      </div>
    );
  }

  const imageSrc = card.image_url || card.image || '';
  const cardPosition = currentIndex >= 0 ? currentIndex + 1 : (card.index ?? 1);
  const cardTotal = cards.length;

  return (
    <div className="card-detail">
      {/* Navegação entre cartas */}
      <nav className="card-nav-row" aria-label="Navegação entre cartas">
        <button type="button" className="card-btn-ghost" onClick={onBack}>← Voltar</button>
        <div className="card-arrows">
          <button type="button" className="card-arrow-btn" onClick={handlePrev} disabled={!showPrev} aria-label="Carta anterior">‹</button>
          <span className="card-arrow-label">{cardPosition} / {cardTotal > 0 ? cardTotal : '–'}</span>
          <button type="button" className="card-arrow-btn" onClick={handleNext} disabled={!showNext} aria-label="Carta seguinte">›</button>
        </div>
      </nav>

      {/* Header: taverna + título + descrição */}
      <header className="card-header">
        <div className="card-tavern">🏰 Tavern do Boar Hat</div>
        <h1 className="card-title">{card.name}</h1>
        <p className="card-desc">{card.description}</p>
        <div className="card-badges">
          <OverallRankBadge card={card} />
          <span className="card-level-badge">Nível {currentLevel}</span>
          <span className="card-classe-badge">{card.classe}</span>
        </div>
      </header>

      {/* Zona central: arte + versão evoluída (antes/depois) */}
      <section className="card-stage">
        <div className="card-art-frame">
          {imageSrc ? (
            <>
              <img className="card-art" src={imageSrc} alt={card.name} />
              {hasEvolution && <img className="card-art card-art--evolved" src={imageSrc} alt="" aria-hidden="true" />}
            </>
          ) : (
            <div className="card-art-missing">🎴</div>
          )}
        </div>
        {hasEvolution && <button type="button" className="card-change-hero">Trocar Herói</button>}
      </section>

      {/* Aviso de evolução */}
      {evolutionNotice && <div className="card-notice">✨ {evolutionNotice}</div>}

      {/* Atributos: atual → pós-evolução */}
      <section className="card-stats">
        <h2 className="card-stats-title">Estatísticas</h2>
        <table className="card-stats-table">
          <thead>
            <tr>
              <th>Atributo</th>
              <th className="num">Atual</th>
              {hasEvolution && (
                <>
                  <th className="num">→</th>
                  <th className="num">Pós-Evolução</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {statRows.map((row) => (
              <tr key={row.key}>
                <td>{row.icon} {row.label}</td>
                <td className="num current">{fmt(row.current)}</td>
                {hasEvolution && (
                  <>
                    <td className="num arrow">→</td>
                    <td className="num next">{row.next != null ? fmt(row.next) : '–'}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Itens de evolução: 3 slots */}
      {hasEvolution && items.length > 0 && (
        <section className="card-items">
          <h2 className="card-items-title">Itens de Evolução</h2>
          <div className="card-slots">
            {items.map((item) => (
              <div className="card-slot" key={item.name || item.icon}>
                <span className="card-slot-icon">{item.icon}</span>
                <span className="card-slot-name">{item.name}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Accão de evolução */}
      {hasEvolution && (
        <button type="button" className="card-action">
          <span className="card-action-label">Evoluir Herói</span>
          <span className="card-action-cost">💰 {fmt(EVOLUTION_COST)} Ryo</span>
        </button>
      )}
    </div>
  );
}
