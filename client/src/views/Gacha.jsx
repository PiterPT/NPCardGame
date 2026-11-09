import React, { useEffect, useState } from 'react';
import { API_URL, authFetch } from '../lib/api';
import { OverallRankBadge, CardStatsCompact } from '../lib/statRank';
import '../styles/gacha.css';

// Cores de raridade tratadas pelo CSS via data-rarity (theme.css --rarity-*)
const CLASS_META = {
  R: { label: 'R' },
  SR: { label: 'SR' },
  SSR: { label: 'SSR' }
};

const rarityKey = (classe) => String(classe || '').toLowerCase();

const fmtPct = (p) => {
  const value = (p * 100).toFixed(2);
  return `${value.replace(/\.?0+$/, '')}%`;
};

export default function Gacha({ user, setUser }) {
  const [banners, setBanners] = useState(null);
  const [selectedBannerId, setSelectedBannerId] = useState(1);
  const [pulledCards, setPulledCards] = useState(null);
  const [pulling, setPulling] = useState(false);
  const [loadingBanners, setLoadingBanners] = useState(true);
  const [error, setError] = useState('');

  // Carregar a configuração REAL do servidor (taxas, custos, pity).
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await authFetch(`${API_URL}/api/gacha/banners`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Erro ao carregar banners.');
        if (active) setBanners(data.banners);
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoadingBanners(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const banner = banners?.find((b) => b.id === selectedBannerId) || null;
  const diamonds = user?.diamonds ?? 0;

  const handlePull = async (times) => {
    if (!banner || pulling) return;
    const cost = times === 1 ? banner.cost1x : banner.cost10x;

    if (diamonds < cost) {
      setError(`Diamantes insuficientes: precisas de ${cost} 💎 e tens ${diamonds} 💎.`);
      return;
    }

    setError('');
    setPulling(true);
    setPulledCards(null);

    try {
      const response = await authFetch(`${API_URL}/api/gacha/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bannerId: selectedBannerId, times })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Erro ao realizar o sorteio.');

      setPulledCards(data.pulledCards);
      setUser((prev) => ({
        ...prev,
        coins: data.remainingCoins,
        diamonds: data.remainingDiamonds
      }));

      // Atualizar o medidor de pity com o valor real devolvido pelo servidor.
      setBanners((prevBanners) => prevBanners.map((b) => (
        b.id === selectedBannerId
          ? { ...b, pity: { ...b.pity, diamondsSinceSsr: data.pity.diamondsSinceSsr } }
          : b
      )));
    } catch (err) {
      setError(err.message);
    } finally {
      setPulling(false);
    }
  };

  if (loadingBanners) {
    return (
      <div className="gacha-container">
        <div className="state" role="status">
          <p className="state__desc">A carregar banners…</p>
        </div>
      </div>
    );
  }

  if (!banner) {
    return (
      <div className="gacha-container">
        <div className="state state--error" role="alert">
          <p className="state__desc">{error || 'Banners indisponíveis.'}</p>
        </div>
      </div>
    );
  }

  const pity = banner.pity;
  const pityPct = Math.min(100, (pity.diamondsSinceSsr / pity.hardDiamonds) * 100);
  const pityLeft = Math.max(0, pity.hardDiamonds - pity.diamondsSinceSsr);

  return (
    <div className="gacha-container">
      <h2 className="gacha-title">🔮 Portal de Invocação Gacha</h2>

      {/* Seletor de banners (nomes vindos do servidor) */}
      <div className="banner-selector" role="group" aria-label="Selecionar banner">
        {banners.map((b) => (
          <button
            key={b.id}
            aria-pressed={selectedBannerId === b.id}
            className={`banner-card${selectedBannerId === b.id ? ' banner-card--active' : ''}`}
            onClick={() => { setSelectedBannerId(b.id); setPulledCards(null); setError(''); }}
          >
            {b.name}
          </button>
        ))}
      </div>

      <div className="gacha-panel">
        <h3 className="gacha-panel__title">{banner.name}</h3>

        {/* Taxas reais por raridade */}
        <div className="rates-panel" role="group" aria-label="Taxas por raridade">
          {Object.entries(banner.probabilities).map(([classe, prob]) => (
            <div key={classe} className="gacha-rate" data-rarity={rarityKey(classe)}>
              <span className="gacha-rate__label">{classe}</span>
              <strong className="gacha-rate__value">{fmtPct(prob)}</strong>
            </div>
          ))}
        </div>

        {/* Progresso do pity */}
        <div className="pity-panel">
          <div className="pity-panel__header">
            <span>Pity SSR</span>
            <span>
              {pity.diamondsSinceSsr} / {pity.hardDiamonds} 💎
              {pityLeft > 0 ? ` (faltam ${pityLeft} 💎)` : ' — SSR garantido no próximo roll!'}
            </span>
          </div>
          <div
            className="pity-bar"
            role="progressbar"
            aria-label="Progresso do pity SSR"
            aria-valuemin={0}
            aria-valuemax={pity.hardDiamonds}
            aria-valuenow={pity.diamondsSinceSsr}
          >
            <div
              className={`pity-bar__fill${pityLeft === 0 ? ' pity-bar__fill--ready' : ''}`}
              style={{ width: `${pityPct}%` }}
            />
          </div>
          {pity.softDiamonds && (
            <p className="pity-panel__note">
              Pity suave a partir de {pity.softDiamonds} 💎 (SSR +{(pity.softRateStep * 100).toFixed(1)}%/roll).
            </p>
          )}
          <p className="pity-panel__note pity-panel__note--muted">
            SSR garantido em {pity.hardRolls} rolls de 1x.
          </p>
        </div>

        <p className="gacha-balance">
          💎 O teu saldo: <strong className="gacha-balance__value">{diamonds} diamantes</strong>
        </p>

        {error && (
          <div className="notice notice--error" role="alert">
            {error}
          </div>
        )}

        <div className="gacha-pull-actions">
          <button
            disabled={pulling}
            onClick={() => handlePull(1)}
            className="btn btn--md btn--primary btn--cost gacha-pull-btn gacha-pull-btn--info"
            data-cost={`${banner.cost1x} 💎`}
          >
            {pulling ? '✨ A invocar…' : 'Invocação x1'}
          </button>
          <button
            disabled={pulling}
            onClick={() => handlePull(10)}
            className="btn btn--md btn--primary btn--cost gacha-pull-btn"
            data-cost={`${banner.cost10x} 💎`}
          >
            {pulling ? '✨ A invocar…' : 'Invocação x10'}
          </button>
        </div>
      </div>

      {/* Resultados */}
      {pulledCards && (
        <section className="gacha-results-panel">
          <h3 className="gacha-results-title">📜 Resultado da Invocação:</h3>
          <div className="gacha-results">
            {pulledCards.map((card, i) => {
              const meta = CLASS_META[card.classe] || { label: card.classe };
              const rarity = rarityKey(card.classe);
              return (
                <div key={i} className="gacha-result-card" data-rarity={rarity}>
                  <div className="gacha-result-card__head">
                    <span className="gacha-result-card__rarity" data-rarity={rarity}>{meta.label}</span>
                    <OverallRankBadge card={card} />
                  </div>
                  {card.image_url ? (
                    <img className="gacha-result-card__img" src={card.image_url} alt={card.name} />
                  ) : (
                    <div className="gacha-result-card__noimg" aria-hidden="true">Sem Img</div>
                  )}
                  <div className="gacha-result-card__name" title={card.name}>{card.name}</div>
                  <div className="gacha-result-card__stats">
                    <CardStatsCompact card={card} fontSize="10px" gap="4px" />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
