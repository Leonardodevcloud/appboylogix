// Termo de uso do entregador (contrato de 05/11/2026).
//
// · datas no formato da tela (dd/mm/aaaa, hh:mm);
// · nome da empresa que aparece nas telas de cadastro/termo;
// · trava do re-aceite: quando a central publica uma versão nova pedindo re-aceite, o
//   entregador logado só volta a operar depois de aceitar. A Início confere UMA vez ao abrir
//   o app e a cada volta do segundo plano (não no polling de 30 s). Servidor antigo, sem a
//   rota (404), ou qualquer erro: ignora — o app segue como antes.
import { router } from 'expo-router';
import { api, EMPRESA_NOME } from '../api';
import { telaAtual } from '../state/telaAtual';
import { ROTAS_ABAS } from '../navegacao/abas';

const dois = (n) => String(n).padStart(2, '0');

export function dataBR(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()}`;
}
export function horaBR(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${dois(d.getHours())}:${dois(d.getMinutes())}`;
}

// O contexto do cadastro traz a empresa como texto ou objeto, conforme a versão do servidor.
export function nomeEmpresa(ctx) {
  const e = ctx && ctx.empresa;
  if (typeof e === 'string' && e.trim()) return e.trim();
  if (e && typeof e === 'object') return e.nome_exibicao || e.nome_fantasia || e.nome || EMPRESA_NOME;
  return EMPRESA_NOME;
}

// ── Trava do re-aceite ──
let semRota = false;      // servidor sem /motoboys/app/termo: não pergunta de novo neste processo
let emVoo = false;
let pendente = false;     // precisa aceitar, mas ele estava numa tela de corrida: abre na próxima Início

const caminho = (c) => String(c || '').split('?')[0];
const abrirAceite = () => router.replace({ pathname: '/termo', params: { aceitar: '1' } });

export async function conferirTermo() {
  if (semRota || emVoo) return;
  emVoo = true;
  try {
    const r = await api.termoApp();
    pendente = !!(r && r.termo && r.precisa_aceitar);
    abrirAceiteSePendente();
  } catch (e) {
    if (e && e.status === 404) semRota = true;
  } finally {
    emVoo = false;
  }
}

// Só tira o entregador das abas (Início, Histórico, Ganhos, Perfil) — não no meio de uma
// corrida, de uma conclusão ou de um chat. Nesses casos espera ele voltar para a Início.
// `naInicio`: chamado pelo foco da própria Início (o caminho atual ainda pode não ter sido
// atualizado pelo _layout nesse instante).
export function abrirAceiteSePendente(naInicio = false) {
  if (!pendente) return;
  if (!naInicio && !ROTAS_ABAS.has(caminho(telaAtual()))) return;
  pendente = false;
  abrirAceite();
}

export function termoAceito() { pendente = false; }
