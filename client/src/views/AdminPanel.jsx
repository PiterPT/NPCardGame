import React, { useState, useEffect } from 'react';
import { API_URL, authFetch } from '../lib/api';

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
    <div style={{ padding: '20px', color: '#fff', fontFamily: 'sans-serif', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>⚙️ ADM-Painel de Controlo Ninja</h1>

      {errorMsg && <div style={{ padding: '10px', background: '#ff4d4d', color: '#fff', borderRadius: '5px', marginBottom: '15px' }}>{errorMsg}</div>}
      {loadingData && <div style={{ color: '#ff9900', marginBottom: '15px', fontWeight: 'bold' }}>A sincronizar dados...</div>}

      <div style={{ display: 'flex', gap: '10px', marginBottom: '25px', marginTop: '15px' }}>
        <button onClick={() => setActiveTab('cards')} style={{ padding: '10px 20px', background: activeTab === 'cards' ? '#ff9900' : '#2a2a2a', border: 'none', color: activeTab === 'cards' ? '#000' : '#fff', fontWeight: 'bold', cursor: 'pointer', borderRadius: '5px' }}>
          🎴 Modelos de Cartas ({cards.length})
        </button>
        <button onClick={() => setActiveTab('users')} style={{ padding: '10px 20px', background: activeTab === 'users' ? '#ff9900' : '#2a2a2a', border: 'none', color: activeTab === 'users' ? '#000' : '#fff', fontWeight: 'bold', cursor: 'pointer', borderRadius: '5px' }}>
          👥 Utilizadores ({users.length})
        </button>
      </div>

      {activeTab === 'cards' && (
        <div>
          <form onSubmit={handleSaveCard} style={{ background: '#1e1e2e', padding: '20px', borderRadius: '8px', marginBottom: '25px', border: '1px solid #444', display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <h3 style={{ margin: 0, color: '#ff9900' }}>{cardForm.id_modelcard ? '✏️ Editar Modelo de Carta' : '➕ Adicionar Novo Modelo de Carta'}</h3>
            
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <input 
                placeholder="Nome da Carta" 
                value={cardForm.name} 
                onChange={e => setCardForm({...cardForm, name: e.target.value})} 
                required 
                style={{ flex: 1, minWidth: '200px', background: '#2a2a2a', color: '#fff', border: '1px solid #444', padding: '10px', borderRadius: '5px' }} 
              />
              
              {/* 2. Campo de Seleção da Classe (E ou UR) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <label>⭐ Classe:</label>
                <select 
                  value={cardForm.classe} 
                  onChange={e => setCardForm({...cardForm, classe: e.target.value})}
                  style={{ background: '#2a2a2a', color: '#ff9900', border: '1px solid #444', padding: '10px', borderRadius: '5px', fontWeight: 'bold' }}>
                  <option value="E">E (Comum)</option>
                  <option value="R">R (Rara)</option>
                  <option value="SR">SR (Super Rara)</option>
                  <option value="SSR">SSR (Super Super Rara)</option>
                  <option value="UR">UR (Ultra Rara)</option>
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <label>❤️ Vida:</label>
                <input type="number" value={cardForm.vida} onChange={e => setCardForm({...cardForm, vida: Number(e.target.value)})} style={{ width: '80px', background: '#2a2a2a', color: '#fff', border: '1px solid #444', padding: '10px', borderRadius: '5px' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <label>⚔️ Tai:</label>
                <input type="number" value={cardForm.tai} onChange={e => setCardForm({...cardForm, tai: Number(e.target.value)})} style={{ width: '80px', background: '#2a2a2a', color: '#fff', border: '1px solid #444', padding: '10px', borderRadius: '5px' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <label>🌀 Nin:</label>
                <input type="number" value={cardForm.nin} onChange={e => setCardForm({...cardForm, nin: Number(e.target.value)})} style={{ width: '80px', background: '#2a2a2a', color: '#fff', border: '1px solid #444', padding: '10px', borderRadius: '5px' }} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', color: '#aaa' }}>Carregar Imagem (Guardada na BD):</label>
                <input type="file" accept="image/*" onChange={handleImageUpload} style={{ background: '#2a2a2a', color: '#fff', border: '1px solid #444', padding: '8px', borderRadius: '5px', width: '100%' }} />
              </div>
              {cardForm.image_url && (
                <div style={{ textAlign: 'center' }}>
                  <span style={{ fontSize: '12px', display: 'block', color: '#aaa' }}>Pré-visualização:</span>
                  <img src={cardForm.image_url} alt="Preview" style={{ width: '50px', height: '60px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #ff9900' }} />
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="submit" disabled={loadingAction} style={{ background: loadingAction ? '#555' : '#ff9900', color: '#000', fontWeight: 'bold', border: 'none', padding: '10px 20px', borderRadius: '5px', cursor: 'pointer' }}>
                {loadingAction ? '⏳ A processar...' : (cardForm.id_modelcard ? 'Guardar Alterações' : 'Criar Carta na BD')}
              </button>
              {cardForm.id_modelcard && (
                <button type="button" onClick={() => setCardForm({ id_modelcard: null, name: '', vida: 500, tai: 50, nin: 200, image_url: '', classe: 'E' })} style={{ background: '#444', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '5px', cursor: 'pointer' }}>
                  Cancelar Edição
                </button>
              )}
            </div>
          </form>

          {/* Grelha de Exibição das Cartas */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '15px' }}>
            {cards.map(c => (
              <div key={c.id_modelcard} style={{ background: '#1e1e2e', border: c.classe === 'UR' ? '2px solid #ffd700' : '1px solid #ff9900', padding: '15px', borderRadius: '8px', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  {/* Badge da Classe na Carta */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ background: c.classe === 'UR' ? '#ffd700' : '#444', color: c.classe === 'UR' ? '#000' : '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}>
                      {c.classe || 'E'}
                    </span>
                  </div>

                  {c.image_url ? (
                    <img src={c.image_url} alt={c.name} style={{ width: '120px', height: '150px', objectFit: 'cover', borderRadius: '6px', marginBottom: '10px', border: '1px solid #444' }} />
                  ) : (
                    <div style={{ width: '120px', height: '150px', background: '#2a2a2a', margin: '0 auto 10px auto', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', color: '#777', fontSize: '12px' }}>Sem Imagem</div>
                  )}
                  
                  <h4 style={{ color: '#ff9900', margin: '0 0 8px 0' }}>{c.name}</h4>
                  <div style={{ fontSize: '13px', color: '#ddd', display: 'flex', justifyContent: 'space-around', margin: '8px 0' }}>
                    <span>❤️ {c.vida}</span>
                    <span>⚔️ {c.tai}</span>
                    <span>🌀 {c.nin}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                  <button onClick={() => setCardForm(c)} style={{ flex: 1, background: '#ff9900', color: '#000', fontWeight: 'bold', border: 'none', padding: '6px', borderRadius: '4px', cursor: 'pointer' }}>Editar</button>
                  <button onClick={() => handleCardDelete(c.id_modelcard)} style={{ flex: 1, background: '#ff4d4d', color: '#fff', fontWeight: 'bold', border: 'none', padding: '6px', borderRadius: '4px', cursor: 'pointer' }}>Remover</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'users' && (
        <div style={{ background: '#1e1e2e', borderRadius: '8px', overflow: 'hidden', border: '1px solid #444' }}>
          <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#2a2a2a', color: '#ff9900', borderBottom: '1px solid #444' }}>
                <th style={{ padding: '12px' }}>ID</th>
                <th style={{ padding: '12px' }}>Nome</th>
                <th style={{ padding: '12px' }}>Email</th>
                <th style={{ padding: '12px' }}>Moedas (Ryo)</th>
                <th style={{ padding: '12px' }}>Cargo</th>
                <th style={{ padding: '12px' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id_user} style={{ borderBottom: '1px solid #333' }}>
                  <td style={{ padding: '12px' }}>{u.id_user}</td>
                  <td style={{ padding: '12px' }}>{u.name}</td>
                  <td style={{ padding: '12px' }}>{u.email}</td>
                  <td style={{ padding: '12px' }}>
                    <input type="number" defaultValue={u.coins} onBlur={(e) => handleUserUpdate(u.id_user, Number(e.target.value), u.role)} style={{ width: '90px', background: '#2a2a2a', color: '#fff', border: '1px solid #444', padding: '6px', borderRadius: '4px' }} />
                  </td>
                  <td style={{ padding: '12px' }}>
                    <select defaultValue={u.role} onChange={(e) => handleUserUpdate(u.id_user, u.coins, e.target.value)} style={{ background: '#2a2a2a', color: '#fff', border: '1px solid #444', padding: '6px', borderRadius: '4px' }}>
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td style={{ padding: '12px' }}>
                    <button onClick={() => handleUserDelete(u.id_user)} style={{ background: '#ff4d4d', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Eliminar</button>
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