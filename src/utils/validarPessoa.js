// CPF, telefone e e-mail do entregador: máscara enquanto digita e conferência antes de enviar
// (contrato "Termo de uso + Regiões do cadastro", 05/11/2026).
//
// As regras são as mesmas do painel e do servidor — quem vale é o servidor. Aqui a tela só
// ajuda: formata, abre o teclado certo e mostra o erro embaixo do campo antes de enviar.
// As mensagens são as do contrato; não trocar uma sem trocar as outras.
import ibge from '../dados/ibge';

export const MSG = {
  cpf: 'Esse CPF não existe. Confira os números.',
  telefone: 'Telefone inválido. Confira o DDD e o número.',
  email: 'E-mail inválido. Confira o que foi digitado.',
  emailDescartavel: 'Use um e-mail seu de verdade; e-mails temporários não são aceitos.',
};

export const so = (t) => String(t || '').replace(/\D/g, '');

// ── CPF ──
export function mascararCpf(texto) {
  const d = so(texto).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

// 11 dígitos, não todos iguais e os 2 dígitos verificadores batendo.
export function cpfValido(texto) {
  const d = so(texto);
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  for (const n of [9, 10]) {
    let s = 0;
    for (let i = 0; i < n; i += 1) s += Number(d[i]) * (n + 1 - i);
    if (((s * 10) % 11) % 10 !== Number(d[n])) return false;
  }
  return true;
}

export function erroCpf(texto) {
  if (!so(texto)) return null;
  return cpfValido(texto) ? null : MSG.cpf;
}

// ── Telefone ──
// DDDs válidos = os DDDs dos municípios da base (montado uma vez, na primeira conferência).
let _ddds = null;
function ddds() {
  if (_ddds) return _ddds;
  _ddds = new Set();
  Object.values(ibge.municipios || {}).forEach((lista) => lista.forEach((m) => { if (m[2]) _ddds.add(String(m[2])); }));
  return _ddds;
}

function digitosTelefone(texto) {
  let d = so(texto);
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  return d.slice(0, 11);
}

// (71) 99876-5432 · (71) 3456-7890 — vai formatando conforme digita.
export function mascararTelefone(texto) {
  const d = digitosTelefone(texto);
  if (!d.length) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

// 10 ou 11 dígitos, DDD que existe e, com 11 dígitos, o 3º é 9 (celular).
export function telefoneValido(texto) {
  const d = digitosTelefone(texto);
  if (d.length !== 10 && d.length !== 11) return false;
  if (!ddds().has(d.slice(0, 2))) return false;
  if (d.length === 11 && d[2] !== '9') return false;
  return true;
}

export function erroTelefone(texto) {
  if (!so(texto)) return null;
  return telefoneValido(texto) ? null : MSG.telefone;
}

// Só os dígitos, do jeito que o servidor grava.
export const telefoneParaEnvio = (texto) => digitosTelefone(texto);

// ── E-mail ──
export function normalizarEmail(texto) {
  return String(texto || '').trim().toLowerCase();
}

const RE_EMAIL = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;

export function emailValido(texto) {
  const e = normalizarEmail(texto);
  if (!RE_EMAIL.test(e)) return false;
  const local = e.split('@')[0];
  if (e.includes('..') || local.startsWith('.') || local.endsWith('.')) return false;
  return true;
}

const DESCARTAVEIS = new Set([
  'mailinator.com', 'yopmail.com', 'guerrillamail.com', '10minutemail.com', 'temp-mail.org',
  'tempmail.com', 'trashmail.com', 'sharklasers.com', 'getnada.com', 'dispostable.com',
  'maildrop.cc', 'mohmal.com', 'emailondeck.com', 'fakeinbox.com', 'throwawaymail.com',
]);

const dominioDe = (e) => { const i = e.lastIndexOf('@'); return i >= 0 ? e.slice(i + 1) : ''; };

export function emailDescartavel(texto) {
  return DESCARTAVEIS.has(dominioDe(normalizarEmail(texto)));
}

// Domínio digitado errado → domínio certo. Só sugere, não bloqueia.
const NOMES_ERRADOS = {
  gmial: 'gmail.com', gmal: 'gmail.com', gmai: 'gmail.com', gnail: 'gmail.com', gamil: 'gmail.com',
  hotmial: 'hotmail.com', hotmal: 'hotmail.com', hotmai: 'hotmail.com',
  outlok: 'outlook.com', outloo: 'outlook.com',
  yaho: 'yahoo.com',
};
const DOMINIOS_ERRADOS = {
  'gmail.co': 'gmail.com', 'gmail.con': 'gmail.com', 'gmail.cm': 'gmail.com',
  'hotmail.co': 'hotmail.com', 'hotmail.con': 'hotmail.com',
  'outlook.co': 'outlook.com', 'outlook.con': 'outlook.com',
  'yahoo.co': 'yahoo.com', 'yahoo.con': 'yahoo.com',
  'icloud.co': 'icloud.com', 'icloud.con': 'icloud.com',
  'uol.com': 'uol.com.br', 'bol.com': 'bol.com.br',
};

// E-mail corrigido (ex.: joao@gmial.com → joao@gmail.com) ou null.
export function sugerirEmail(texto) {
  const e = normalizarEmail(texto);
  const i = e.lastIndexOf('@');
  if (i <= 0) return null;
  const local = e.slice(0, i);
  const dom = e.slice(i + 1);
  if (!dom) return null;
  let certo = DOMINIOS_ERRADOS[dom] || null;
  if (!certo) {
    const [nome, ...resto] = dom.split('.');
    // "gmial.com", "gmial.com.br", "gmial.con"…: o nome errado com qualquer final de .com.
    if (NOMES_ERRADOS[nome] && resto.length && /^(com|co|con|cm)(\.br)?$/.test(resto.join('.'))) certo = NOMES_ERRADOS[nome];
  }
  return certo && certo !== dom ? `${local}@${certo}` : null;
}

export function erroEmail(texto) {
  if (!normalizarEmail(texto)) return null;
  if (!emailValido(texto)) return MSG.email;
  if (emailDescartavel(texto)) return MSG.emailDescartavel;
  return null;
}
