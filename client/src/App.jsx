import React, { useState } from 'react';
import Login from './views/Login';
import Dashboard from './views/Dashboard';
import Inventory from './views/Inventory';
import PvpArena from './views/PvpArena';
import AdminPanel from './views/AdminPanel';
import Gacha from './views/Gacha';
import './styles/global.css';

export default function App() {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('user');
    return stored ? JSON.parse(stored) : null;
  });

  const [currentView, setCurrentView] = useState('dashboard');

  const handleUpdateUser = (updatedData) => {
    setUser(prev => {
      const newUser = { ...prev, ...updatedData };
      localStorage.setItem('user', JSON.stringify(newUser));
      return newUser;
    });
  };

  const handleLogout = () => {
    localStorage.removeItem('user');
    setUser(null);
    setCurrentView('dashboard');
  };

  const handleNavClick = (view) => {
    setCurrentView(view);
  };

  if (!user) {
    return <Login onLoginSuccess={(loggedInUser) => {
      localStorage.setItem('user', JSON.stringify(loggedInUser));
      setUser(loggedInUser);
    }} />;
  }

  return (
    <div className="app-layout">
      {/* Checkbox invisível para controlar o estado do menu através de CSS puro */}
      <input type="checkbox" id="sidebar-toggle" className="sidebar-toggle-checkbox" />

      {/* Overlay escuro de fundo para ecrãs móveis */}
      <label htmlFor="sidebar-toggle" className="menu-overlay"></label>

      {/* Sidebar de Navegação */}
      <aside className="app-sidebar">
        <h2 className="sidebar-brand">🥷 NINJA LEGENDS</h2>
        
        <div className="sidebar-section-title">Menu</div>
        
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
            <div className="sidebar-section-title admin-title">Admin</div>
            <button onClick={() => handleNavClick('admin')} className={`nav-btn ${currentView === 'admin' ? 'active' : ''}`}>
              ⚙️ Painel ADM
            </button>
          </>
        )}

        <div className="sidebar-footer">
          <button onClick={handleLogout} className="logout-btn">
            Terminar Sessão
          </button>
        </div>
      </aside>

      {/* Conteúdo Principal / Top Bar */}
      <main className="app-main">
        <header className="app-header">
          <div className="header-left">
            {/* Botão Hambúrguer em formato de label ligada ao checkbox */}
            <label htmlFor="sidebar-toggle" className="hamburger-btn" aria-label="Abrir Menu">
              <span></span>
              <span></span>
              <span></span>
            </label>
            <div className="header-title">Centro de Controlo Ninja</div>
          </div>

          <div className="header-right">
            <span className="coin-badge">
              💰 <strong>{user.coins}</strong> Ryo
            </span>
            <span className="user-name">👤 <strong>{user.name}</strong></span>
          </div>
        </header>

        <div className="app-content-view">
          {currentView === 'dashboard' && <Dashboard user={user} setCurrentView={setCurrentView} />}
          {currentView === 'inventory' && <Inventory user={user} setUser={handleUpdateUser} />}
          {currentView === 'gacha' && <Gacha user={user} setUser={handleUpdateUser} />}
          {currentView === 'pvp' && <PvpArena user={user} setUser={handleUpdateUser} />}
          {currentView === 'admin' && user.role === 'admin' && <AdminPanel />}
        </div>
      </main>
    </div>
  );
}