import React, { useState } from 'react';
import Login from './views/Login';
import Dashboard from './views/Dashboard';
import Inventory from './views/Inventory';
import PvpArena from './views/PvpArena'; // 👈 Novo componente importado
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

  if (!user) {
    return <Login onLoginSuccess={(loggedInUser) => {
      localStorage.setItem('user', JSON.stringify(loggedInUser));
      setUser(loggedInUser);
    }} />;
  }

  return (
    <div className="app-layout" style={{ display: 'flex', minHeight: '100vh', background: '#121212', color: '#fff' }}>
      
      {/* Sidebar de Navegação */}
      <aside style={{ width: '240px', background: '#191926', borderRight: '1px solid #2a2a3a', padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <h2 style={{ color: '#ff9900', fontSize: '18px', marginBottom: '20px' }}>🥷 NINJA LEGENDS</h2>
        
        <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', marginBottom: '5px', letterSpacing: '1px' }}>Menu</div>
        
        <button onClick={() => setCurrentView('dashboard')} style={{ background: currentView === 'dashboard' ? '#ff9900' : 'transparent', color: currentView === 'dashboard' ? '#000' : '#fff', border: 'none', padding: '10px 15px', borderRadius: '8px', textAlign: 'left', fontWeight: 'bold', cursor: 'pointer' }}>
          📊 Dashboard
        </button>
        <button onClick={() => setCurrentView('inventory')} style={{ background: currentView === 'inventory' ? '#ff9900' : 'transparent', color: currentView === 'inventory' ? '#000' : '#fff', border: 'none', padding: '10px 15px', borderRadius: '8px', textAlign: 'left', fontWeight: 'bold', cursor: 'pointer' }}>
          📜 Inventário / Equipa
        </button>
        <button onClick={() => setCurrentView('gacha')} style={{ background: currentView === 'gacha' ? '#ff9900' : 'transparent', color: currentView === 'gacha' ? '#000' : '#fff', border: 'none', padding: '10px 15px', borderRadius: '8px', textAlign: 'left', fontWeight: 'bold', cursor: 'pointer' }}>
          🔮 Portal Gacha
        </button>
        <button onClick={() => setCurrentView('pvp')} style={{ background: currentView === 'pvp' ? '#ff9900' : 'transparent', color: currentView === 'pvp' ? '#000' : '#fff', border: 'none', padding: '10px 15px', borderRadius: '8px', textAlign: 'left', fontWeight: 'bold', cursor: 'pointer' }}>
          ⚔️ Arena PvP & Infinito
        </button>

        {user.role === 'admin' && (
          <>
            <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', marginTop: '15px', marginBottom: '5px', letterSpacing: '1px' }}>Admin</div>
            <button onClick={() => setCurrentView('admin')} style={{ background: currentView === 'admin' ? '#ff9900' : 'transparent', color: currentView === 'admin' ? '#000' : '#fff', border: 'none', padding: '10px 15px', borderRadius: '8px', textAlign: 'left', fontWeight: 'bold', cursor: 'pointer' }}>
              ⚙️ Painel ADM
            </button>
          </>
        )}

        <div style={{ marginTop: 'auto', paddingTop: '20px', borderTop: '1px solid #2a2a3a' }}>
          <button onClick={handleLogout} style={{ width: '100%', background: '#ff4d4d', color: '#fff', border: 'none', padding: '10px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
            Terminar Sessão
          </button>
        </div>
      </aside>

      {/* Conteúdo Principal / Top Bar */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <header style={{ height: '70px', background: '#191926', borderBottom: '1px solid #2a2a3a', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 30px' }}>
          <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#ff9900' }}>Centro de Controlo Ninja</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <span style={{ background: '#222233', padding: '6px 14px', borderRadius: '20px', border: '1px solid #333', fontSize: '14px' }}>
              💰 <strong>{user.coins}</strong> Ryo
            </span>
            <span>👤 <strong>{user.name}</strong></span>
          </div>
        </header>

        <div style={{ flex: 1, overflowY: 'auto' }}>
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