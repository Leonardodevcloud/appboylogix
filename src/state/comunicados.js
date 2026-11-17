// Comunicados da central (módulo vendável do painel). O servidor diz o que este entregador
// ainda não confirmou; o ComunicadoHost mostra, um de cada vez, quando ele está numa tela calma.
//
// O ok é por pessoa e fica gravado no servidor. "Ver depois" vale até o app ser reaberto.
// Central sem o módulo responde 403: tratamos como "nada a mostrar", sem aviso.
import { api, getToken } from '../api';

let pendentes = [];        // comunicados no ar que este entregador ainda não confirmou
let disponivel = null;     // null = ainda não sabemos · true/false = a central tem o módulo
const adiados = new Set(); // "Ver depois" nesta abertura do app
const ouvintes = new Set();
let buscando = null;
let tokenDaLista = null;

const avisar = () => { for (const f of ouvintes) { try { f(estado()); } catch {} } };
export function estado() { return { pendentes, disponivel, fila: pendentes.filter((c) => c.exige_ok || !adiados.has(c.id)) }; }
export function assinarComunicados(f) { ouvintes.add(f); f(estado()); return () => ouvintes.delete(f); }

export async function conferirComunicados() {
  if (buscando) return buscando;
  buscando = (async () => {
    try {
      const token = await getToken();
      // Saiu ou entrou outra pessoa neste celular: o que estava guardado não é dela.
      if (token !== tokenDaLista) { tokenDaLista = token; pendentes = []; adiados.clear(); avisar(); }
      if (!token) return;
      const r = await api.get('/comunicados/app/pendentes');
      pendentes = (r && r.comunicados) || [];
      disponivel = true;
    } catch (e) {
      if (e?.status === 403 || e?.status === 404) { pendentes = []; disponivel = false; }
      // Sem sinal ou servidor fora: mantém o que já tinha; a próxima conferência resolve.
    } finally { buscando = null; avisar(); }
  })();
  return buscando;
}

export function adiarComunicado(id) { adiados.add(id); avisar(); }
// "Ver depois" desfeito: o entregador abriu o aviso de novo pelo histórico.
export function reabrirComunicado(id) { adiados.delete(id); avisar(); }

// Registra no servidor o que a pessoa fez. acao: 'visto' | 'midia-fim' | 'ok'.
export async function registrarComunicado(id, acao) {
  const r = await api.post(`/comunicados/app/${id}/${acao}`, {});
  if (acao === 'ok') { pendentes = pendentes.filter((c) => c.id !== id); avisar(); }
  if (acao === 'midia-fim') { pendentes = pendentes.map((c) => (c.id === id ? { ...c, midia_fim_em: c.midia_fim_em || new Date().toISOString() } : c)); avisar(); }
  return r;
}
