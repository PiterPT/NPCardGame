import React from 'react';
import { useNavigate, Link } from 'react-router-dom'; // Ajusta conforme o teu router

export default function Header() {
  const navigate = useNavigate();

  // 1. Obtém os dados do utilizador guardados no localStorage
  const storedUser = localStorage.getItem('user');
  const user = storedUser ? JSON.parse(storedUser) : null;

  const handleLogout = () => {
    localStorage.removeItem('user');
    navigate('/login');
    window.location.reload();
  };

  return (
    <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 30px', background: '#1e1e2e', color: '#fff', borderBottom: '1px solid #444' }}>
      <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
        <h2 style={{ margin: 0, color: '#ff9900' }}>🏯 Ninja Legends</h2>
        <nav style={{ display: 'flex', gap: '15px' }}>
          <Link to="/dashboard" style={{ color: '#fff', textDecoration: 'none' }}>Painel</Link>
          <Link to="/inventory" style={{ color: '#fff', textDecoration: 'none' }}>Inventário</Link>
          <Link to="/gacha" style={{ color: '#fff', textDecoration: 'none' }}>Invocação</Link>
          <Link to="/combat" style={{ color: '#fff', textDecoration: 'none' }}>Combate</Link>

          {/* 2. MOSTRA O BOTÃO APENAS SE FOR ADMIN */}
          {user && user.role === 'admin' && (
            <Link 
              to="/admin" 
              style={{ color: '#ff9900', textDecoration: 'none', fontWeight: 'bold', background: 'rgba(255, 153, 0, 0.1)', padding: '5px 10px', borderRadius: '5px', border: '1px solid #ff9900' }}>
              ⚙️ ADM-Painel
            </Link>
          )}
        </nav>
      </div>

      {user ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <span> shinobi: <strong>{user.name}</strong></span>
          <button onClick={handleLogout} style={{ background: '#ff4d4d', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}>
            Sair
          </button>
        </div>
      ) : (
        <Link to="/login" style={{ color: '#ff9900', textDecoration: 'none', fontWeight: 'bold' }}>Entrar</Link>
      )}
    </header>
  );
}