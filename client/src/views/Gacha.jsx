import React, { useEffect, useState } from 'react';
import { API_URL, authFetch } from '../lib/api';
import { OverallRankBadge, CardStatsCompact } from '../lib/statRank';

const CLASS_META = {
  R: { label: 'R', color: '#60a5fa', border: '1px solid #3b82f6' },
  SR: { label: 'SR', color: '#c084fc', border: '2px solid #a855f7' },
  SSR: { label: 'SSR', color: '#fbbf24', border: '2px solid #f59e0b' }
};

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
    return <div style={{ padding: '40px', textAlign: 'center', color: '#fff' }}>A carregar banners…</div>;
  }

  if (!banner) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#f87171' }}>{error || 'Banners indisponíveis.'}</div>;
  }

  const pity = banner.pity;
  const pityPct = Math.min(100, (pity.diamondsSinceSsr / pity.hardDiamonds) * 100);
  const pityLeft = Math.max(0, pity.hardDiamonds - pity.diamondsSinceSsr);

  return (
    <div style={{ padding: '20px', color: '#fff', maxWidth: '960px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h2 style={{ color: '#ff9900', textAlign: 'center', marginBottom: '20px' }}>🔮 Portal de Invocação Gacha</h2>

      {/* Seletor de banners (nomes vindos do servidor) */}
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '25px', flexWrap: 'wrap' }}>
        {banners.map((b) => (
          <button
            key={b.id}
            onClick={() => { setSelectedBannerId(b.id); setPulledCards(null); setError(''); }}
            style={{
              padding: '10px 20px',
              background: selectedBannerId === b.id ? '#ff9900' : '#1e1e2e',
              color: selectedBannerId === b.id ? '#000' : '#fff',
              border: '1px solid #ff9900',
              borderRadius: '8px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            {b.name}
          </button>
        ))}
      </div>

      <div style={{ background: '#1e1e2e', border: '2px solid #ff9900', borderRadius: '12px', padding: '25px', textAlign: 'center', marginBottom: '25px', boxShadow: '0 4px 15px rgba(0,0,0,0.5)' }}>
        <h3 style={{ color: '#ff9900', fontSize: '22px', marginBottom: '10px' }}>{banner.name}</h3>

        {/* Taxas reais por raridade */}
        <div style={{ background: '#121212', padding: '12px', borderRadius: '8px', marginBottom: '20px', display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap', gap: '10px' }}>
          {Object.entries(banner.probabilities).map(([classe, prob]) => (
            <div key={classe} style={{ fontSize: '13px', textAlign: 'center' }}>
              <span style={{ color: CLASS_META[classe]?.color || '#aaa', display: 'block', fontWeight: 'bold' }}>{classe}</span>
              <strong style={{ color: '#fff' }}>{fmtPct(prob)}</strong>
            </div>
          ))}
        </div>

        {/* Progresso do pity */}
        <div style={{ marginBottom: '18px', textAlign: 'left' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#aaa', marginBottom: '6px' }}>
            <span>Pity SSR</span>
            <span>
              {pity.diamondsSinceSsr} / {pity.hardDiamonds} 💎
              {pityLeft > 0 ? ` (faltam ${pityLeft} 💎)` : ' — SSR garantido no próximo roll!'}
            </span>
          </div>
          <div style={{ height: '10px', background: '#333', borderRadius: '5px', overflow: 'hidden' }}>
            <div style={{ width: `${pityPct}%`, height: '100%', background: pityLeft === 0 ? '#f59e0b' : '#00bcd4' }} />
          </div>
          {pity.softDiamonds && (
            <div style={{ fontSize: '12px', color: '#aaa', marginTop: '6px' }}>
              Pity suave a partir de {pity.softDiamonds} 💎 (SSR +{(pity.softRateStep * 100).toFixed(1)}%/roll).
            </div>
          )}
          <div style={{ fontSize: '12px', color: '#777', marginTop: '4px' }}>
            SSR garantido em {pity.hardRolls} rolls de 1x.
          </div>
        </div>

        <div style={{ marginBottom: '15px', fontSize: '15px' }}>
          💎 O teu saldo: <strong style={{ color: '#00bcd4' }}>{diamonds} diamantes</strong>
        </div>

        {error && (
          <div style={{ marginBottom: '15px', padding: '10px', borderRadius: '6px', background: 'rgba(248,113,113,0.15)', color: '#f87171', fontSize: '14px' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'center', gap: '15px', flexWrap: 'wrap' }}>
          <button
            disabled={pulling}
            onClick={() => handlePull(1)}
            style={{ padding: '12px 25px', background: '#00bcd4', color: '#000', fontWeight: 'bold', border: 'none', borderRadius: '8px', cursor: pulling ? 'not-allowed' : 'pointer', opacity: pulling ? 0.6 : 1 }}
          >
            {pulling ? '✨ A invocar…' : `Invocação x1 (${banner.cost1x} 💎)`}
          </button>
          <button
            disabled={pulling}
            onClick={() => handlePull(10)}
            style={{ padding: '12px 25px', background: '#ff9900', color: '#000', fontWeight: 'bold', border: 'none', borderRadius: '8px', cursor: pulling ? 'not-allowed' : 'pointer', opacity: pulling ? 0.6 : 1 }}
          >
            {pulling ? '✨ A invocar…' : `Invocação x10 (${banner.cost10x} 💎)`}
          </button>
        </div>
      </div>

      {/* Resultados */}
      {pulledCards && (
        <div style={{ background: '#1e1e2e', border: '1px solid #00bcd4', borderRadius: '12px', padding: '20px', textAlign: 'center' }}>
          <h3 style={{ color: '#00bcd4', marginBottom: '15px' }}>📜 Resultado da Invocação:</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '15px' }}>
            {pulledCards.map((card, i) => {
              const meta = CLASS_META[card.classe] || { label: card.classe, color: '#aaa', border: '1px solid #444' };
              return (
                <div key={i} style={{ background: '#121212', border: meta.border, borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '11px', background: '#333', padding: '2px 6px', borderRadius: '4px', color: meta.color, fontWeight: 'bold' }}>{meta.label}</span>
                    <OverallRankBadge card={card} />
                  </div>
                  {card.image_url ? (
                    <img src={card.image_url} alt={card.name} style={{ width: '90px', height: '110px', objectFit: 'cover', borderRadius: '4px', margin: '8px auto', display: 'block' }} />
                  ) : (
                    <div style={{ width: '90px', height: '110px', background: '#222', margin: '8px auto', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#777' }}>Sem Img</div>
                  )}
                  <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.name}</div>
                  <div style={{ marginTop: '6px' }}>
                    <CardStatsCompact card={card} fontSize="10px" gap="4px" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
