import React, { useState } from 'react';
import '../styles/login.css';

export default function Login({ onLoginSuccess }) {
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false); // 👈 Estado de carregamento

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true); // 👈 Desativa o botão e mostra estado a processar

    const endpoint = isRegister ? 'http://localhost:3000/api/auth/register' : 'http://localhost:3000/api/auth/login';
    const bodyData = isRegister ? { name, email, password } : { email, password };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyData)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro na autenticação.');
      }

      if (isRegister) {
        alert('Registo efetuado com sucesso! Podes fazer login.');
        setIsRegister(false);
      } else {
        onLoginSuccess(data.user);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false); // 👈 Reativa o botão após terminar
    }
  };

  return (
    <div className="login-wrapper">
      <div className="login-card">
        <h2 className="login-title">🥷 Ninja Legends</h2>
        
        {error && <div className="error-banner">{error}</div>}

        <form onSubmit={handleSubmit} className="login-form">
          {isRegister && (
            <input
              type="text"
              placeholder="Nome do Shinobi"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="login-input"
              required
              disabled={loading}
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="login-input"
            required
            disabled={loading}
          />
          <input
            type="password"
            placeholder="Palavra-passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="login-input"
            required
            disabled={loading}
          />
          
          {/* Botão com comportamento dinâmico de carregamento */}
          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? '⏳ A processar...' : (isRegister ? 'Registar Conta' : 'Entrar na Vila')}
          </button>
        </form>

        <button 
          onClick={() => { setIsRegister(!isRegister); setError(''); }} 
          className="toggle-mode-btn"
          disabled={loading}
        >
          {isRegister ? 'Já tens conta? Clica aqui para Entrar' : 'Não tens conta? Regista-te aqui'}
        </button>
      </div>
    </div>
  );
}