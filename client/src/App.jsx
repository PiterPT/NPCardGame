import React, { useState, useEffect } from 'react';
import Login from './views/Login';
import Dashboard from './views/Dashboard';
import Inventory from './views/Inventory';
import PvpArena from './views/PvpArena';
import AdminPanel from './views/AdminPanel';
import Gacha from './views/Gacha';
import CardDetail from './views/CardDetail';
import { API_URL, authFetch, clearSession } from './lib/api';

export default function App() {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('user');
    return stored ? JSON.parse(stored) : null;
  });

  const [currentView, setCurrentView] = useState('dashboard');
  const [cardId, setCardId] = useState(null);

  const handleUpdateUser = (updatedData) => {
    setUser(prev => {
      // Gacha, Inventario, Combate e Arena chamam setUser(prev => ({ ...prev, coins })) (funcao);
      // outros podem passar um objeto. Suporta as duas formas.
      const patch = typeof updatedData === 'function' ? updatedData(prev) : updatedData;
      // Sem alteracoes reais: devolve o mesmo estado (evita re-renders e novos pedidos desnecessarios).
      if (!patch || Object.keys(patch).every(k => prev[k] === patch[k])) return prev;
      const newUser = { ...prev, ...patch };
      localStorage.setItem('user', JSON.stringify(newUser));
      return newUser;
    });
  };

  const handleLogout = () => {
    clearSession(); // remove o token e o utilizador guardados
    setUser(null);
    setCurrentView('dashboard');
  };

  // Presenca online: envia um sinal ao servidor ao entrar e depois de 4 em 4 minutos (o servidor considera
  // online quem renovou nos ultimos 10). So renova com a pagina visivel: separador escondido deixa de renovar
  // e passa a offline ao fim de 10 minutos.
  const presenceUserId = user ? (user.id_user || user.id) : null;
  useEffect(() => {
    if (!presenceUserId) return undefined;
    let lastBeat = 0;

    const beat = () => {
      if (document.visibilityState === 'hidden') return;
      const now = Date.now();
      if (now - lastBeat < 30_000) return; // nunca mais de um sinal por 30 s
      lastBeat = now;
      // Pedido autenticado (o servidor deriva o jogador do token JWT).
      authFetch(`${API_URL}/api/presence/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      }).catch(() => { /* sem ligacao: tenta no proximo ciclo */ });
    };

    beat();
    const timer = setInterval(beat, 4 * 60 * 1000);
    const onVisible = () => { if (document.visibilityState === 'visible') beat(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [presenceUserId]);

  const handleNavClick = (view) => {
    setCurrentView(view);
  };

  // Detalhe de carta: /cartas/:id (estrutura atual usa estado em vez de router).
  const openCard = (id) => {
    setCardId(id);
    setCurrentView('card');
  };

  const goBackToInventory = () => {
    setCurrentView('inventory');
  };

  if (!user) {
    return <Login onLoginSuccess={(loggedInUser) => {
      localStorage.setItem('user', JSON.stringify(loggedInUser));
      setUser(loggedInUser);
    }} />;
  }

  return (
    <div className="app-shell">
      {/* Mobile sidebar toggle checkbox */}
      <input type="checkbox" id="sidebar-toggle" className="sidebar-toggle-checkbox" />

      {/* Overlay for mobile sidebar */}
      <label htmlFor="sidebar-toggle" className="menu-overlay"></label>

      {/* Top HUD */}
      <header className="app-hud">
        <div className="app-hud__left">
          <label htmlFor="sidebar-toggle" className="hamburger-btn" aria-label="Abrir Menu">
            <span></span>
            <span></span>
            <span></span>
          </label>
        </div>
        <div className="app-hud__center">
          <div className="header-title">Centro de Controlo Ninja</div>
        </div>
        <div className="app-hud__right">
          <span className="coin-badge">
            💰 <strong>{user.coins ?? 0}</strong> Ryo
          </span>
          <span className="coin-badge" title="Diamantes">
            💎 <strong>{user.diamonds ?? 0}</strong>
          </span>
          <span className="user-name">👤 <strong>{user.name}</strong></span>
        </div>
      </header>

      {/* Sidebar */}
      <aside className="app-sidebar">
        <div className="app-sidebar__brand">
          <h2 className="sidebar-brand">🥷 NINJA LEGENDS</h2>
        </div>

        <div className="app-sidebar__section">
          <div className="app-sidebar__section-title">Menu</div>
          <nav className="app-sidebar__nav">
            <button onClick={() => handleNavClick('dashboard')} className={`nav-btn ${currentView === 'dashboard' ? 'active' : ''}`}>
              📊 Dashboard
            </button>
            <button onClick={() => handleNavClick('inventory')} className={`nav-btn ${currentView === 'inventory' ? 'active' : ''}`}>
              📜 Inventário / Equipa
            </button>
            <button onClick={() => handleNavClick('gacha')} className={`nav-btn ${currentView === 'gacha' ? 'active' : ''}`}>
              🔮 Portal Gacha
            </button>
            <button onClick={() => handleNavClick('pvp')} className={`nav-btn ${currentView === 'pvp' ? 'active' : ''}`}>
              ⚔️ Arena PvP & Infinito
            </button>

            {user.role === 'admin' && (
              <>
                <div className="app-sidebar__section-title app-sidebar__section-title--admin">Admin</div>
                <button onClick={() => handleNavClick('admin')} className={`nav-btn ${currentView === 'admin' ? 'active' : ''}`}>
                  ⚙️ Painel ADM
                </button>
              </>
            )}
          </nav>
        </div>

        <div className="app-sidebar__footer">
          <button onClick={handleLogout} className="logout-btn">
            Terminar Sessão
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="app-main">
        <div className="app-content">
          {currentView === 'dashboard' && <Dashboard user={user} setCurrentView={setCurrentView} />}
          {currentView === 'inventory' && <Inventory user={user} setUser={handleUpdateUser} openCard={openCard} />}
          {currentView === 'gacha' && <Gacha user={user} setUser={handleUpdateUser} />}
          {currentView === 'card' && (
            <CardDetail
              key={cardId}
              cardId={cardId}
              userId={user ? (user.id_user || user.id) : null}
              onBack={goBackToInventory}
              onPrev={(id) => { if (id != null) setCardId(id); }}
              onNext={(id) => { if (id != null) setCardId(id); }}
            />
          )}
          {currentView === 'pvp' && <PvpArena user={user} setUser={handleUpdateUser} />}
          {currentView === 'admin' && user.role === 'admin' && <AdminPanel />}
        </div>
      </main>

      {/* Bottom Navigation (Mobile) */}
      <nav className="app-nav-bottom" role="navigation" aria-label="Navegação principal">
        <button className="app-nav-bottom__item" onClick={() => handleNavClick('dashboard')} aria-label="Taberna">
          <span className="app-nav-bottom__icon">🏠</span>
          <span>Taberna</span>
        </button>
        <button className="app-nav-bottom__item" onClick={() => handleNavClick('inventory')} aria-label="Inventário">
          <span className="app-nav-bottom__icon">📜</span>
          <span>Missões</span>
        </button>
        <button className="app-nav-bottom__item" onClick={() => handleNavClick('inventory')} aria-label="Heróis">
          <span className="app-nav-bottom__icon">🎴</span>
          <span>Heróis</span>
        </button>
        <button className="app-nav-bottom__item" onClick={() => handleNavClick('gacha')} aria-label="Gacha">
          <span className="app-nav-bottom__icon">🔮</span>
          <span>Sorteio</span>
        </button>
        <button className="app-nav-bottom__item" onClick={() => handleNavClick('admin')} aria-label="Loja/Menu" style={{ display: user.role === 'admin' ? 'flex' : 'none' }}>
          <span className="app-nav-bottom__icon">⚙️</span>
          <span>Menu</span>
        </button>
      </nav>
    </div>
  );
}