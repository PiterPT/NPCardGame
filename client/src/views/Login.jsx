import React, { useState } from 'react';
import { API_URL, setToken } from '../lib/api';
import '../styles/login.css';

export default function Login({ onLoginSuccess }) {
  const [mode, setMode] = useState('login'); // 'login', 'register', 'forgot'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    setLoading(true);

    let endpoint = `${API_URL}/api/auth/login`;
    let bodyData = { email, password };

    if (mode === 'register') {
      endpoint = `${API_URL}/api/auth/register`;
      bodyData = { name, email, password };
    } else if (mode === 'forgot') {
      endpoint = `${API_URL}/api/auth/forgot-password`;
      bodyData = { email };
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyData)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro na operação.');
      }

      if (mode === 'forgot') {
        setSuccessMessage(data.message || 'Instruções enviadas para o email.');
      } else if (mode === 'register') {
        alert('Registo efetuado com sucesso! Podes fazer login.');
        setMode('login');
      } else {
        if (data.token) setToken(data.token);
        onLoginSuccess(data.user);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrapper">
      <div className="login-card panel--parchment">
        <h2 className="login-title">🥷 Ninja Legends</h2>
        
        {error && <div className="error-banner">{error}</div>}
        {successMessage && <div className="success-banner">{successMessage}</div>}

        <form onSubmit={handleSubmit} className="login-form">
          {mode === 'register' && (
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

          {mode !== 'forgot' && (
            <input
              type="password"
              placeholder="Palavra-passe"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="login-input"
              required
              disabled={loading}
            />
          )}
          
          <button type="submit" className="login-btn" disabled={loading}>
            {loading 
              ? '⏳ A processar...' 
              : mode === 'register' 
                ? 'Registar Conta' 
                : mode === 'forgot' 
                  ? 'Enviar Instruções' 
                  : 'Entrar na Vila'}
          </button>
        </form>

        <div className="login-mode-switch">
          {mode !== 'login' && (
            <button 
              onClick={() => { setMode('login'); setError(''); setSuccessMessage(''); }} 
              className="toggle-mode-btn"
              disabled={loading}
            >
              Voltar ao Login
            </button>
          )}

          {mode !== 'register' && (
            <button 
              onClick={() => { setMode('register'); setError(''); setSuccessMessage(''); }} 
              className="toggle-mode-btn"
              disabled={loading}
            >
              Não tens conta? Regista-te aqui
            </button>
          )}

          {mode !== 'forgot' && (
            <button 
              onClick={() => { setMode('forgot'); setError(''); setSuccessMessage(''); }} 
              className="toggle-mode-btn"
              disabled={loading}
            >
              Esqueceste-te da palavra-passe?
            </button>
          )}
        </div>
      </div>
    </div>
  );
}