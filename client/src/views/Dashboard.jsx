import React, { useState, useEffect } from 'react';
import Loader from '../components/Loader';
import '../styles/dashboard.css';

export default function Dashboard({ user, setCurrentView }) {
  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const userId = user.id_user || user.id;

    // Vai buscar os dados reais do perfil, moedas e inventário do utilizador
    fetch(`http://localhost:3000/api/user/${userId}/profile`)
      .then(res => res.json())
      .then(data => {
        setProfileData(data);
        setLoading(false);
      })
      .catch(err => {
        console.error("Erro ao carregar dados do Dashboard:", err);
        setLoading(false);
      });
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
            NÍVEL 12
          </div>
        </div>
        <div className="xp-container">
          <div className="xp-info">
            <span>Experiência da Conta</span>
            <span>2.400 / 3.000 XP (80%)</span>
          </div>
          <div className="xp-bar-bg">
            <div className="xp-bar-fill" style={{ width: '80%' }}></div>
          </div>
        </div>
      </div>

      {/* 4.2. Estatísticas Gerais da Conta */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">💰</div>
          <div>
            <p className="stat-value">{user.coins} Ryo</p>
            <p className="stat-label">Coins</p>
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
          <div className="stat-icon">👥</div>
          <div>
            <p className="stat-value">{Math.min(totalCards, 5)} / 5</p>
            <p className="stat-label">Equipa Ativa</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">🏆</div>
          <div>
            <p className="stat-value">18</p>
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
                <img src={card.image_url || 'https://via.placeholder.com/90x115'} alt={card.name} />
                <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#ff9900', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.name}</div>
                <div style={{ fontSize: '11px', color: '#aaa' }}>❤️ {card.vida} | ⚔️ {card.tai}</div>
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
                <span style={{ fontSize: '10px', background: '#333', padding: '1px 6px', borderRadius: '4px', color: '#ff9900', fontWeight: 'bold' }}>{card.classe || 'E'}</span>
                <img src={card.image_url || 'https://via.placeholder.com/90x115'} alt={card.name} style={{ marginTop: '6px' }} />
                <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.name}</div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}