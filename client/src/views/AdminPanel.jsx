import React, { useState, useEffect } from 'react';
import { API_URL, authFetch } from '../lib/api';
import '../styles/admin.css';

export default function AdminPanel() {
  const [users, setUsers] = useState([]);
  const [cards, setCards] = useState([]);
  const [activeTab, setActiveTab] = useState('cards');

  const [loadingData, setLoadingData] = useState(false);
  const [loadingAction, setLoadingAction] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // 1. Adicionado o campo 'classe' com o valor padrão 'E'
  const [cardForm, setCardForm] = useState({
    id_modelcard: null,
    name: '',
    vida: 500,
    tai: 50,
    nin: 200,
    image_url: '',
    classe: 'E'
  });

  const getHeaders = () => ({ 'Content-Type': 'application/json' });

  useEffect(() => {
    fetchUsers();
    fetchCards();
  }, []);

  // Helper: completa requisições autenticadas de admins, lançando os erros para o utilizador
  // (antes, os erros só apareciam na consola e o painel ficava silenciosamente vazio).
  const adminFetchJson = async (url, options = {}) => {
    const res = await authFetch(url, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Erro do servidor (${res.status}).`);
    return data;
  };

  const fetchUsers = async () => {
    setLoadingData(true);
    try {
      const data = await adminFetchJson(`${API_URL}/api/admin/users`);
      if (Array.isArray(data)) setUsers(data);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoadingData(false);
    }
  };

  const fetchCards = async () => {
    setLoadingData(true);
    try {
      const data = await adminFetchJson(`${API_URL}/api/admin/cards`);
      if (Array.isArray(data)) setCards(data);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoadingData(false);
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // UPLOAD VALIDADO (2 MB, imagens): antes qualquer ficheiro, de qualquer tamanho,
    // era convertido em base64 e guardado diretamente nos dados da base de dados.
    const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Trata-se apenas de ficheiros de imagem.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setErrorMsg(`Imagem demasiado grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Máximo: 2 MB.`);
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setCardForm(prev => ({ ...prev, image_url: reader.result }));
      setErrorMsg(''); // limpa erro anterior de validação, se persistisse
    };
    reader.readAsDataURL(file);
  };

  const handleSaveCard = async (e) => {
    e.preventDefault();
    setLoadingAction(true);

    try {
      const method = cardForm.id_modelcard ? 'PUT' : 'POST';
      const url = cardForm.id_modelcard
        ? `${API_URL}/api/admin/cards/${cardForm.id_modelcard}`
        : `${API_URL}/api/admin/cards`;

      await adminFetchJson(url, { method, headers: getHeaders(), body: JSON.stringify(cardForm) });
      fetchCards();
      setCardForm({ id_modelcard: null, name: '', vida: 500, tai: 50, nin: 200, image_url: '', classe: 'E' });
    } catch (err) {
      setErrorMsg(`Erro ao guardar a carta: ${err.message}`);
    } finally {
      setLoadingAction(false);
    }
  };

  const handleCardDelete = async (id) => {
    if (!window.confirm('Tens a certeza que queres remover este modelo de carta?')) return;
    try {
      await adminFetchJson(`${API_URL}/api/admin/cards/${id}`, { method: 'DELETE' });
      fetchCards();
    } catch (err) {
      setErrorMsg(`Erro ao eliminar a carta: ${err.message}`);
    }
  };

  const handleUserUpdate = async (id, coins, role) => {
    try {
      await adminFetchJson(`${API_URL}/api/admin/users/${id}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ coins, role })
      });
      fetchUsers();
    } catch (err) {
      setErrorMsg(`Erro ao atualizar o utilizador: ${err.message}`);
    }
  };

  const handleUserDelete = async (id) => {
    if (!window.confirm('Tens a certeza que queres eliminar este utilizador?')) return;
    try {
      await adminFetchJson(`${API_URL}/api/admin/users/${id}`, { method: 'DELETE' });
      fetchUsers();
    } catch (err) {
      setErrorMsg(`Erro ao eliminar o utilizador: ${err.message}`);
    }
  };

  return (
    <div className="admin-container">
      <h1 className="admin-title">⚙️ ADM-Painel de Controlo Ninja</h1>

      {errorMsg && <div className="admin-error-banner">{errorMsg}</div>}
      {loadingData && <div className="admin-loading">A sincronizar dados...</div>}

      <div className="admin-tabs">
        <button
          onClick={() => setActiveTab('cards')}
          className={`admin-tab ${activeTab === 'cards' ? 'admin-tab--active' : ''}`}
        >
          🎴 Modelos de Cartas ({cards.length})
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`admin-tab ${activeTab === 'users' ? 'admin-tab--active' : ''}`}
        >
          👥 Utilizadores ({users.length})
        </button>
      </div>

      {activeTab === 'cards' && (
        <div>
          <form onSubmit={handleSaveCard} className="admin-card-form">
            <h3 className="admin-card-form__title">{cardForm.id_modelcard ? '✏️ Editar Modelo de Carta' : '➕ Adicionar Novo Modelo de Carta'}</h3>

            <div className="admin-field-group">
              <input
                placeholder="Nome da Carta"
                value={cardForm.name}
                onChange={e => setCardForm({...cardForm, name: e.target.value})}
                required
                className="admin-input"
              />

              {/* 2. Campo de Seleção da Classe (E ou UR) */}
              <div className="admin-field-row">
                <label className="admin-field-label">⭐ Classe:</label>
                <select
                  value={cardForm.classe}
                  onChange={e => setCardForm({...cardForm, classe: e.target.value})}
                  className="admin-select"
                >
                  <option value="E">E (Comum)</option>
                  <option value="R">R (Rara)</option>
                  <option value="SR">SR (Super Rara)</option>
                  <option value="SSR">SSR (Super Super Rara)</option>
                  <option value="UR">UR (Ultra Rara)</option>
                </select>
              </div>

              <div className="admin-field-row">
                <label className="admin-field-label">❤️ Vida:</label>
                <input type="number" value={cardForm.vida} onChange={e => setCardForm({...cardForm, vida: Number(e.target.value)})} className="admin-input" />
              </div>
              <div className="admin-field-row">
                <label className="admin-field-label">⚔️ Tai:</label>
                <input type="number" value={cardForm.tai} onChange={e => setCardForm({...cardForm, tai: Number(e.target.value)})} className="admin-input" />
              </div>
              <div className="admin-field-row">
                <label className="admin-field-label">🌀 Nin:</label>
                <input type="number" value={cardForm.nin} onChange={e => setCardForm({...cardForm, nin: Number(e.target.value)})} className="admin-input" />
              </div>
            </div>

            <div className="admin-field-group">
              <div className="admin-file-group">
                <label className="admin-field-label">Carregar Imagem (Guardada na BD):</label>
                <input type="file" accept="image/*" onChange={handleImageUpload} className="admin-file-input" />
              </div>
              {cardForm.image_url && (
                <div className="admin-preview">
                  <span className="admin-preview-text">Pré-visualização:</span>
                  <img src={cardForm.image_url} alt="Preview" className="admin-preview-img" />
                </div>
              )}
            </div>

            <div className="admin-field-group">
              <button type="submit" disabled={loadingAction} className="admin-btn-submit">
                {loadingAction ? '⏳ A processar...' : (cardForm.id_modelcard ? 'Guardar Alterações' : 'Criar Carta na BD')}
              </button>
              {cardForm.id_modelcard && (
                <button type="button" onClick={() => setCardForm({ id_modelcard: null, name: '', vida: 500, tai: 50, nin: 200, image_url: '', classe: 'E' })} className="admin-btn-cancel">
                  Cancelar Edição
                </button>
              )}
            </div>
          </form>

          {/* Grelha de Exibição das Cartas */}
          <div className="admin-card-grid">
            {cards.map(c => (
              <div key={c.id_modelcard} className={`admin-card ${c.classe === 'UR' ? 'admin-card--rarity-ur' : ''}`}>
                <div>
                  {/* Badge da Classe na Carta */}
                  <div className="admin-card-badge-container">
                    <span className={`admin-card-badge ${c.classe === 'UR' ? 'admin-card-badge--ur' : ''}`}>
                      {c.classe || 'E'}
                    </span>
                  </div>

                  {c.image_url ? (
                    <img src={c.image_url} alt={c.name} className="admin-card-art" />
                  ) : (
                    <div className="admin-card-art--missing">Sem Imagem</div>
                  )}

                  <h4 className="admin-card-name">{c.name}</h4>
                  <div className="admin-card-stats">
                    <span className="admin-card-stat">❤️ {c.vida}</span>
                    <span className="admin-card-stat">⚔️ {c.tai}</span>
                    <span className="admin-card-stat">🌀 {c.nin}</span>
                  </div>
                </div>

                <div className="admin-card-actions">
                  <button onClick={() => setCardForm(c)} className="admin-btn-edit">Editar</button>
                  <button onClick={() => handleCardDelete(c.id_modelcard)} className="admin-btn-delete">Remover</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'users' && (
        <div className="admin-users-table">
          <table className="admin-table">
            <thead>
              <tr className="admin-table--head">
                <th className="admin-table--cell">ID</th>
                <th className="admin-table--cell">Nome</th>
                <th className="admin-table--cell">Email</th>
                <th className="admin-table--cell">Moedas (Ryo)</th>
                <th className="admin-table--cell">Cargo</th>
                <th className="admin-table--cell">Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id_user} className="admin-table--row">
                  <td className="admin-table--cell">{u.id_user}</td>
                  <td className="admin-table--cell">{u.name}</td>
                  <td className="admin-table--cell">{u.email}</td>
                  <td className="admin-table--cell">
                    <input type="number" defaultValue={u.coins} onBlur={(e) => handleUserUpdate(u.id_user, Number(e.target.value), u.role)} className="admin-table-input" />
                  </td>
                  <td className="admin-table--cell">
                    <select defaultValue={u.role} onChange={(e) => handleUserUpdate(u.id_user, u.coins, e.target.value)} className="admin-table-select">
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="admin-table--cell">
                    <button onClick={() => handleUserDelete(u.id_user)} className="admin-btn-delete">Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
