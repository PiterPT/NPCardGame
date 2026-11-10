import React, { useState, useEffect, useMemo } from 'react';
import Loader from '../components/Loader';
import MiniCard from '../components/MiniCard';
import { API_URL, authFetch } from '../lib/api';
import { OverallRankBadge, CardStatsCompact } from '../lib/statRank';
import '../styles/inventory.css';
 
export default function Inventory({ user, setUser, openCard }) {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('view'); // 'view', 'sell', 'feed'
  const [selectedCards, setSelectedCards] = useState([]);
  const [targetCardForFeed, setTargetCardForFeed] = useState(null);
  const [notification, setNotification] = useState(null);

  // Estados de Filtro, Ordenação e Paginação
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('name-asc');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 40; // 5 colunas × 8 linhas (ou 8 × 5 em ecrãs largos)

  // Previsões em tempo real
  const [sellPreview, setSellPreview] = useState(0);
  const [feedPreview, setFeedPreview] = useState(null);
  const [sellValues, setSellValues] = useState({});
  const [processing, setProcessing] = useState(false);

  const showNotice = (text, type = 'info') => {
    setNotification({ text, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const getUserId = () => {
    if (!user) return null;
    return user.id_user || user.id || null;
  };

  const fetchInventory = async (userId) => {
    const res = await authFetch(`${API_URL}/api/user/${userId}/profile`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao carregar o inventário.');
    setCards(prev => {
      const locked = new Set(prev.filter(c => c.is_locked).map(c => c.id_card));
      return (data.cards || []).map(c => ({ ...c, is_locked: locked.has(c.id_card) }));
    });
    return data;
  };

  const syncCoins = (coins) => {
    if (typeof coins !== 'number') return;
    if (typeof setUser === 'function') setUser(prev => ({ ...prev, coins }));
    try {
      const stored = JSON.parse(localStorage.getItem('user')) || {};
      stored.coins = coins;
      localStorage.setItem('user', JSON.stringify(stored));
    } catch (e) {}
  };

  useEffect(() => {
    const userId = getUserId();
    if (!userId) {
      setLoading(false);
      showNotice('Acesso negado. Sem identificação.', 'error');
      return;
    }

    fetchInventory(userId)
      .catch((err) => {
        console.error('Erro ao carregar inventário:', err);
        showNotice('Erro ao carregar o inventário do servidor.', 'error');
      })
      .finally(() => setLoading(false));
  }, [user]);

  // Hierarquia real de raridades/classes
  const classRank = { 'E': 1, 'R': 2, 'SR': 3, 'SSR': 4, 'UR': 5 };
  const starsFor = (classe) => classRank[classe] || 1;

  // Processamento unificado: Pesquisa -> Ordenação -> Paginação
  const processedCards = useMemo(() => {
    let result = [...cards];

    // 1. Pesquisa por nome (ignorando maiúsculas/minúsculas e espaços)
    if (searchTerm.trim() !== '') {
      const term = searchTerm.trim().toLowerCase();
      result = result.filter(c => c.name && c.name.toLowerCase().includes(term));
    }

    // 2. Ordenação
    result.sort((a, b) => {
      if (sortBy === 'name-asc') {
        return (a.name || '').localeCompare(b.name || '');
      }
      if (sortBy === 'name-desc') {
        return (b.name || '').localeCompare(a.name || '');
      }
      if (sortBy === 'rarity-asc') {
        return (classRank[a.classe] || 1) - (classRank[b.classe] || 1);
      }
      if (sortBy === 'rarity-desc') {
        return (classRank[b.classe] || 1) - (classRank[a.classe] || 1);
      }
      if (sortBy === 'level-asc') {
        return (a.level || 1) - (b.level || 1);
      }
      if (sortBy === 'level-desc') {
        return (b.level || 1) - (a.level || 1);
      }
      return 0;
    });

    return result;
  }, [cards, searchTerm, sortBy]);

  // Paginação com reposicionamento automático para a página 1 ao filtrar/ordenar
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, sortBy]);

  const totalPages = Math.ceil(processedCards.length / pageSize) || 1;
  const paginatedCards = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return processedCards.slice(start, start + pageSize);
  }, [processedCards, currentPage]);

  // Previsões dinâmicas
  useEffect(() => {
    const userId = getUserId();
    if (!userId) return;
    let cancelled = false;

    const postJson = async (path, body) => {
      const res = await authFetch(`${API_URL}/api/cards/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro no servidor.');
      return data;
    };

    if (mode === 'sell') {
      if (selectedCards.length === 0) {
        setSellPreview(0);
        setSellValues({});
        return;
      }
      postJson('preview-sell', { userId, cardIds: selectedCards })
        .then(data => {
          if (cancelled) return;
          setSellPreview(Number(data.totalRyos) || 0);
          setSellValues(data.perCard || {});
        })
        .catch(err => { if (!cancelled) showNotice(`Erro ao calcular venda: ${err.message}`, 'error'); });
    } else if (mode === 'feed' && targetCardForFeed) {
      const sacrificeCardIds = selectedCards.filter(id => id !== targetCardForFeed.id_card);
      if (sacrificeCardIds.length === 0) {
        setFeedPreview(null);
        return;
      }
      postJson('preview-feed', { userId, targetCardId: targetCardForFeed.id_card, sacrificeCardIds })
        .then(data => { if (!cancelled) setFeedPreview(data); })
        .catch(err => { if (!cancelled) showNotice(`Erro no preview feed: ${err.message}`, 'error'); });
    } else {
      setFeedPreview(null);
    }

    return () => { cancelled = true; };
  }, [selectedCards, targetCardForFeed, mode, user]);

  const toggleLock = (e, cardId) => {
    e.stopPropagation();
    setCards(prev => prev.map(c => {
      if (c.id_card === cardId) {
        const newStatus = !c.is_locked;
        showNotice(newStatus ? '📌 Carta trancada!' : '🔓 Carta destrancada.', newStatus ? 'warning' : 'info');
        return { ...c, is_locked: newStatus };
      }
      return c;
    }));
  };

  const handleCheckboxToggle = (card) => {
    if (card.is_locked) {
      showNotice('🔒 Esta carta está trancada!', 'warning');
      return;
    }
    if (selectedCards.includes(card.id_card)) {
      setSelectedCards(prev => prev.filter(id => id !== card.id_card));
    } else {
      setSelectedCards(prev => [...prev, card.id_card]);
    }
  };

  const handleSelectAllUnlocked = () => {
    const unlockedIds = processedCards.filter(c => !c.is_locked).map(c => c.id_card);
    const allUnlockedSelected = unlockedIds.every(id => selectedCards.includes(id));

    if (allUnlockedSelected) {
      // Se todas as desbloqueadas já estão selecionadas, remove-as da seleção
      setSelectedCards(prev => prev.filter(id => !unlockedIds.includes(id)));
    } else {
      // Caso contrário, adiciona todas as desbloqueadas à seleção atual (sem duplicados)
      setSelectedCards(prev => Array.from(new Set([...prev, ...unlockedIds])));
    }
  };

  const handleConfirmSell = async () => {
    const userId = getUserId();
    if (!userId || selectedCards.length === 0 || processing) return;
    setProcessing(true);

    try {
      const res = await authFetch(`${API_URL}/api/cards/sell`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, cardIds: selectedCards })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Erro na venda.');

      syncCoins(data.newCoins);
      setSelectedCards([]);
      setSellPreview(0);
      setSellValues({});
      await fetchInventory(userId);
      showNotice(`💰 Venda concluída! +${data.totalRyos} Ryos.`, 'success');
    } catch (err) {
      showNotice(err.message || 'Erro ao vender.', 'error');
    } finally {
      setProcessing(false);
    }
  };

  const handleConfirmFeed = async () => {
    const userId = getUserId();
    if (!userId || !targetCardForFeed || processing) return;
    const sacrificeCardIds = selectedCards.filter(id => id !== targetCardForFeed.id_card);
    if (sacrificeCardIds.length === 0) return;
    setProcessing(true);

    try {
      const res = await authFetch(`${API_URL}/api/cards/feed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, targetCardId: targetCardForFeed.id_card, sacrificeCardIds })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Erro no feed.');

      setSelectedCards([]);
      setTargetCardForFeed(null);
      setFeedPreview(null);
      setMode('view');
      await fetchInventory(userId);
      showNotice(data.message, 'success');
    } catch (err) {
      showNotice(err.message || 'Erro no feed.', 'error');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) return <Loader text="A carregar o inventário..." />;

  return (
    <div className="inventory-container">
      <h2 className="inventory-title">📜 Inventário <span className="inventory-title__count">{cards.length}</span></h2>

      {notification && (
        <div className={`notice notice--${notification.type}`}>{notification.text}</div>
      )}

      {/* Barra de Pesquisa, Ordenação e Botão Select All */}
      <div className="filter-bar">
        <div className="field filter-bar__search">
          <input
            type="text"
            className="field__input"
            placeholder="🔍 Enter search term."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {mode !== 'view' && (
          <button className="btn btn--sm btn--secondary" onClick={handleSelectAllUnlocked}>
            ☑️ Selecionar Desbloqueadas
          </button>
        )}

        <div className="field filter-bar__sort">
          <label className="field__label sr-only" htmlFor="inventory-sort">Ordenar</label>
          <select
            id="inventory-sort"
            className="field__select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="name-asc">Nome (A–Z)</option>
            <option value="name-desc">Nome (Z–A)</option>
            <option value="rarity-desc">Raridade (Decrescente)</option>
            <option value="rarity-asc">Raridade (Crescente)</option>
            <option value="level-desc">Level (Decrescente)</option>
            <option value="level-asc">Level (Crescente)</option>
          </select>
        </div>
      </div>

      {/* Painel de Modos */}
      <div className="mode-panel">
                <button
          className={`btn btn--sm ${mode === 'view' ? 'btn--primary' : 'btn--secondary'}`}
          onClick={() => { setMode('view'); setSelectedCards([]); setTargetCardForFeed(null); }}
        >
          👁️ Ver
        </button>
        <button
          className={`btn btn--sm ${mode === 'sell' ? 'btn--danger' : 'btn--secondary'}`}
          onClick={() => { setMode('sell'); setSelectedCards([]); setTargetCardForFeed(null); }}
        >
          💰 Vender
        </button>
        <button
          className={`btn btn--sm ${mode === 'feed' ? 'mode-btn--feed' : 'btn--secondary'}`}
          onClick={() => { setMode('feed'); setSelectedCards([]); setTargetCardForFeed(null); }}
        >
          ✨ Feed
        </button>

        {mode === 'sell' && (
          <div className="mode-panel__actions">
            <span className="mode-panel__total">Total: 💰 {sellPreview} Ryos</span>
            {selectedCards.length > 0 && (
              <button className="btn btn--sm btn--success" onClick={handleConfirmSell} disabled={processing}>
                {processing ? '⏳ A processar...' : `Vender (${selectedCards.length})`}
              </button>
            )}
          </div>
        )}

        {mode === 'feed' && targetCardForFeed && selectedCards.filter(id => id !== targetCardForFeed.id_card).length > 0 && (
          <div className="mode-panel__actions">
            {feedPreview && (() => {
              const previewStats = feedPreview.previewStats || {};
              const previewCard = {
                vida: previewStats.vida ?? feedPreview.targetStatRanks?.vida?.value,
                tai:  previewStats.tai  ?? feedPreview.targetStatRanks?.tai?.value,
                nin:  previewStats.nin  ?? feedPreview.targetStatRanks?.nin?.value,
                statRanks: feedPreview.targetStatRanks
              };
              const levelUp = (feedPreview.previewLevel || 1) > (targetCardForFeed.level || 1);
              return (
                <div className="preview-panel">
                  <span className="preview-panel__xp">
                    ✨ +{feedPreview.totalXpGanha || 0} XP
                    {levelUp ? ` · Nvl ${targetCardForFeed.level || 1} → ${feedPreview.previewLevel}` : ` · Nvl ${feedPreview.previewLevel || 1}`}
                  </span>
                  <OverallRankBadge card={previewCard} />
                  <CardStatsCompact card={previewCard} fontSize="11px" gap="6px" />
                </div>
              );
            })()}
            <button className="btn btn--sm btn--success" onClick={handleConfirmFeed} disabled={processing}>
              {processing ? '⏳ A processar...' : 'Alimentar'}
            </button>
          </div>
        )}
      </div>

      {/* Grid de Cards Paginar */}
      {paginatedCards.length === 0 ? (
        <div className="empty-state">
          {cards.length === 0 ? 'Nenhuma carta encontrada no teu inventário.' : 'Nenhum resultado corresponde à tua pesquisa.'}
        </div>
      ) : (
        <div className="cards-grid">
          {paginatedCards.map((card) => {
            const isChecked = selectedCards.includes(card.id_card);
            const isTarget = targetCardForFeed?.id_card === card.id_card;

            return (
              <div
                key={card.id_card}
                className={`inv-slot inv-slot--${(card.classe || 'e').toLowerCase()}${card.is_locked ? ' inv-slot--locked' : ''}`}
              >
                <MiniCard
                  card={card}
                  mode={mode}
                  isChecked={isChecked}
                  isTarget={isTarget}
                  onToggle={handleCheckboxToggle}
                  onLock={toggleLock}
                  sellValue={sellValues[card.id_card]}
                  onClick={() => {
                    // Modo 'feed': seleciona a carta alvo para alimentação (comportamento original).
                    if (mode === 'feed') {
                      if (!targetCardForFeed && !card.is_locked) {
                        setTargetCardForFeed(card);
                      }
                      return;
                    }
                    // Modo 'view': clicar na carta abre o detalhe (/cartas/:id).
                    if (mode === 'view') openCard(card.id_card);
                  }}
                />
                <span className="inv-stars" aria-label={`Raridade ${card.classe}`}>
                  {Array.from({ length: starsFor(card.classe) }).map((_, i) => <i key={i}>★</i>)}
                </span>
                <span className="inv-level">
                  <small>Lv</small>{card.level || 1}
                </span>
                {mode === 'sell' && sellValues[card.id_card] != null && (
                  <span className="inv-sell">💰{sellValues[card.id_card]}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Controlo de Paginação */}
      {totalPages > 1 && (
        <div className="pagination">
          <button
            className="paginated-title__btn"
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
          >
            ← Anterior
          </button>
          <span className="paginated-title__label">
            <strong>{currentPage}</strong> / <strong>{totalPages}</strong>
          </span>
          <button
            className="paginated-title__btn"
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
            disabled={currentPage === totalPages}
          >
            Seguinte →
          </button>
        </div>
      )}
    </div>
  );
}