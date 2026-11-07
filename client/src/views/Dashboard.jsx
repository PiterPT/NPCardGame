import React, { useState, useEffect } from 'react';
import Loader from '../components/Loader';
import { API_URL, authFetch } from '../lib/api';
import { OverallRankBadge, CardStatsCompact } from '../lib/statRank';
import '../styles/dashboard.css';

export default function Dashboard({ user, setCurrentView }) {
  const [profileData, setProfileData] = useState(null);
  const [pvpStats, setPvpStats] = useState(null);
  const [loading, setLoading] = useState(true);

 useEffect(() => {
    if (!user) return;
    const userId = user.id_user || user.id;

    // Pedido autenticado: a rota de perfil só aceita o próprio utilizador (JWT).
    authFetch(`${API_URL}/api/user/${userId}/profile`)
      .then(res => res.json())
      .then(data => {
        setProfileData(data);
        setLoading(false);
      })
      .catch(err => {
        console.error("Erro ao carregar dados do Dashboard:", err);
        setLoading(false);
      });

    // Estatísticas PvP reais (antes as vitórias eram um número fixo: "18").
    authFetch(`${API_URL}/api/pvp/user/${userId}`)
      .then(res => res.json())
      .then(data => setPvpStats(data.stats || null))
      .catch(() => { /* sem PvP: mantém o traço no cartão de vitórias */ });
  }, [user]);

  if (loading) {
    return <Loader text="A carregar centro de controlo do Shinobi..." />;
  }

  const totalCards = profileData?.cards?.length || 0;
  const recentCards = profileData?.cards?.slice(-4).reverse() || [];

  return (
    <div className="dashboard-container">
      
      {/* 4.1. Boas-vindas e Perfil do Jogador */}
      <div className="welcome-card">
        <div className="welcome-header">
          <div>
            <h2 className="welcome-title">Bem-vindo de volta, {user.name}!</h2>
            <p className="welcome-subtitle">Continua a tua jornada para te tornares Hokage.</p>
          </div>
          <div className="level-badge">
            NÍVEL {user.level || 1}
          </div>
        </div>
        <div className="xp-container">
          <div className="xp-info">
            <span>Experiência da Conta</span>
            <span>{user.xp || 0} / {user.xp_required || 3000} XP ({Math.round((user.xp || 0) / (user.xp_required || 3000) * 100)}%)</span>
          </div>
          <div className="xp-bar-bg">
            <div className="xp-bar-fill" style={{ width: `${Math.min(100, (user.xp || 0) / (user.xp_required || 3000) * 100)}%` }}></div>
          </div>
        </div>
      </div>

      {/* 4.2. Estatísticas Gerais da Conta */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">💰</div>
          <div>
            <p className="stat-value">{user.coins ?? 0} Ryo</p>
            <p className="stat-label">Coins</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">💎</div>
          <div>
            <p className="stat-value">{user.diamonds ?? 0}</p>
            <p className="stat-label">Diamantes</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">🎴</div>
          <div>
            <p className="stat-value">{totalCards}</p>
            <p className="stat-label">Cartas Posuídas</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">🏆</div>
          <div>
            <p className="stat-value">{pvpStats ? pvpStats.wins : '-'}</p>
            <p className="stat-label">Vitórias</p>
          </div>
        </div>
      </div>

      {/* 4.3. A Minha Equipa */}
      <div className="dashboard-section">
        <div className="section-header">
          <h3 className="section-title">⚔️ A Minha Equipa</h3>
          <button className="section-action" onClick={() => setCurrentView('inventory')}>Gerir Equipa →</button>
        </div>
        {recentCards.length === 0 ? (
          <p style={{ color: '#aaa', fontSize: '14px' }}>Ainda não tens cartas equipadas. Visita o Portal Gacha para invocar ninjas!</p>
        ) : (
          <div className="cards-row">
            {recentCards.slice(0, 3).map((card, idx) => (
              <div key={idx} className={`mini-card ${card.classe === 'UR' ? 'ur' : ''}`}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '4px' }}>
                  <OverallRankBadge card={card} />
                </div>
                <img src={card.image_url || 'https://via.placeholder.com/90x115'} alt={card.name} />
                <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#ff9900', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.name}</div>
                <div style={{ marginTop: '4px' }}>
                  <CardStatsCompact card={card} fontSize="10px" gap="4px" showNin={false} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4.6. Atividades e Acesso Rápido */}
      <div className="dashboard-section">
        <div className="section-header">
          <h3 className="section-title">⚡ Atividades Rápidas</h3>
        </div>
        <div className="activities-grid">
          <div className="activity-card">
            <div>
              <h4 style={{ margin: '0 0 5px 0', color: '#ff9900' }}>Portal Gacha</h4>
              <p style={{ margin: 0, fontSize: '13px', color: '#aaa' }}>Invoca novas cartas lendárias para o teu esquadrão.</p>
            </div>
            <button className="activity-btn" onClick={() => setCurrentView('gacha')}>Sortear</button>
          </div>
          <div className="activity-card">
            <div>
              <h4 style={{ margin: '0 0 5px 0', color: '#ff9900' }}>Inventário</h4>
              <p style={{ margin: 0, fontSize: '13px', color: '#aaa' }}>Consulta a tua coleção completa de cartas.</p>
            </div>
            <button className="activity-btn" onClick={() => setCurrentView('inventory')}>Ver Coleção</button>
          </div>
          <div className="activity-card">
            <div>
              <h4 style={{ margin: '0 0 5px 0', color: '#ff9900' }}>Batalhas / Farm</h4>
              <p style={{ margin: 0, fontSize: '13px', color: '#aaa' }}>Enfrenta adversários para ganhar recompensas e Ryo.</p>
            </div>
            <button className="activity-btn" onClick={() => alert('Sistema de combate em breve!')}>Combater</button>
          </div>
        </div>
      </div>

      {/* 4.4. Aquisições Recentes */}
      <div className="dashboard-section">
        <div className="section-header">
          <h3 className="section-title">📜 Aquisições Recentes</h3>
          <button className="section-action" onClick={() => setCurrentView('inventory')}>Ver Inventário →</button>
        </div>
        {recentCards.length === 0 ? (
          <p style={{ color: '#aaa', fontSize: '14px' }}>Nenhuma aquisição recente registada.</p>
        ) : (
          <div className="cards-row">
            {recentCards.map((card, idx) => (
              <div key={idx} className={`mini-card ${card.classe === 'UR' ? 'ur' : ''}`}>
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '10px', background: '#333', padding: '1px 6px', borderRadius: '4px', color: '#ff9900', fontWeight: 'bold' }}>{card.classe || 'E'}</span>
                  <OverallRankBadge card={card} />
                </div>
                <img src={card.image_url || 'https://via.placeholder.com/90x115'} alt={card.name} style={{ marginTop: '6px' }} />
                <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.name}</div>
                <div style={{ marginTop: '4px' }}>
                  <CardStatsCompact card={card} fontSize="10px" gap="4px" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}