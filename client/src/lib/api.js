// Centralização do acesso à API do cliente:
//  - um único sítio para o URL da API (antes estava hardcoded em vários ficheiros);
//  - todos os pedidos autenticados levam o JWT (que antes nem sequer existia).
const RAW_API_URL = import.meta.env.API_URL || 'https://npcardgame.onrender.com';
export const API_URL = RAW_API_URL.replace(/\/$/, '');

const TOKEN_KEY = 'token';
const USER_KEY = 'user';

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* armazenamento indisponível */ }
}

// Remove toda a sessão local (usado no logout ou quando um 401 expira a sessão).
export function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch { /* armazenamento indisponível */ }
}

// Força o logout (sessão expirada): limpa o armazenamento e recarrega a página,
// de forma a resetar todo o estado React em memória e mostrar o ecrã de login.
function forceLogout() {
  clearSession();
  if (!window.location.pathname.endsWith('/')) {
    // reload garante a limpeza de TODO o estado React em memória
  }
  window.location.reload();
}

/**
 * fetch com o JWT no cabeçalho Authorization. Num 401 (token ausente/inválido/expirado)
 * limpa a sessão e reinicia a aplicação de forma a mostrar o ecrã de login.
 * Uso: authFetch(`${API_URL}/api/...`, { method: 'POST', body: JSON.stringify(...) })
 */
export async function authFetch(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    forceLogout();
    // Lançada após o reload agendado; evita que o código continue a processar a resposta.
    throw new Error('Sessão expirada. Volta a entrar.');
  }
  return res;
}

// Cabeçalhos autenticados, para quando um módulo quer usar fetch diretamente (ex.: pvpCache).
export function authHeaders(extra = {}) {
  const headers = { ...extra };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}
