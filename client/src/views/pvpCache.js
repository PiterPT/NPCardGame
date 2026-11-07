// Cache em memoria do modulo (sobrevive a desmontagens do componente, perde-se ao recarregar a pagina).
// Estrategia "stale-while-revalidate": mostra SEMPRE o ultimo modelo conhecido e so volta ao servidor
// se os dados forem mais antigos que o TTL, se o "fingerprint" mudou ou se foram invalidados.
import { authFetch } from '../lib/api';

export const TTL = {
  ranking: 15_000,
  user: 30_000,
  history: 30_000,
  notifications: 15_000,
  inventory: 60_000
};

const store = new Map();    // key -> { data, time, fingerprint }
const inflight = new Map(); // key -> Promise (deduplica pedidos iguais em curso)
const gens = new Map();     // key -> geracao (invalidate incrementa; respostas antigas nao sobrescrevem a cache)
let owner = null;           // userId a quem pertence a cache

// Se a conta mudar, nada da conta anterior pode ser mostrado.
function checkOwner(userId) {
  if (owner !== userId) {
    store.clear();
    inflight.clear();
    gens.clear();
    owner = userId;
  }
}

/** Ultimo modelo conhecido (pode estar desatualizado) ou undefined. Nunca faz pedidos. */
export function peek(userId, key) {
  checkOwner(userId);
  return store.get(key)?.data;
}

function isFresh(entry, ttl, fingerprint) {
  return (
    entry !== undefined &&
    Date.now() - entry.time < ttl &&
    (fingerprint === undefined || entry.fingerprint === fingerprint)
  );
}

/**
 * Carrega `url`:
 *  - se existir modelo em cache, entrega-o logo via onData;
 *  - so faz pedido se estiver desatualizado (ou force);
 *  - pedidos iguais em simultaneo partilham o mesmo fetch.
 * `parse` valida/transforma a resposta; se lancar erro, a cache antiga e mantida.
 * Devolve uma Promise que resolve quando os dados estiverem atuais (ou falhar sem rebentar).
 */
export async function load(userId, key, url, { ttl, force = false, fingerprint, onData, onError, parse, options } = {}) {
  checkOwner(userId);
  const entry = store.get(key);
  if (entry && onData) onData(entry.data);
  if (!force && isFresh(entry, ttl ?? TTL[key] ?? 0, fingerprint)) return entry.data;

  let promise = inflight.get(key);
  if (!promise) {
    const gen = gens.get(key) || 0;
    promise = (async () => {
      const res = await authFetch(url, options);
      let body = null;
      try { body = await res.json(); } catch { /* corpo vazio */ }
      if (!res.ok) throw new Error((body && body.error) || `o servidor respondeu ${res.status}`);
      const data = parse ? parse(body) : body;
      // Se foi invalidado entretanto (ex.: apos uma acao), esta resposta ja e antiga: nao a guardar.
      if ((gens.get(key) || 0) === gen) store.set(key, { data, time: Date.now(), fingerprint });
      return data;
    })().finally(() => {
      if (inflight.get(key) === promise) inflight.delete(key);
    });
    inflight.set(key, promise);
  }

  try {
    const data = await promise;
    if (onData) onData(data);
    return data;
  } catch (err) {
    if (onError) onError(err, Boolean(entry));
    else console.error(`[pvpCache] ${key}:`, err);
    return entry?.data;
  }
}

/** Grava diretamente um valor (ex.: depois de uma acao que ja devolve o novo estado). */
export function set(userId, key, data, fingerprint) {
  checkOwner(userId);
  store.set(key, { data, time: Date.now(), fingerprint });
}

/** Marca como desatualizado, mas MANTEM o modelo para continuar a ser mostrado enquanto recarrega. */
export function invalidate(userId, keys) {
  checkOwner(userId);
  for (const key of [].concat(keys)) {
    const e = store.get(key);
    if (e) e.time = 0;
    gens.set(key, (gens.get(key) || 0) + 1);
    inflight.delete(key);
  }
}

export function clear() {
  store.clear();
  inflight.clear();
  gens.clear();
  owner = null;
}
