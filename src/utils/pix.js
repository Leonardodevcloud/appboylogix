// Chave Pix com máscara enquanto o entregador digita (ADR-038 do backend).
//
// O servidor grava a chave no formato do banco (CPF/CNPJ só números, celular +55, e-mail
// em minúsculas) e recusa o que não bate com o tipo. Aqui a tela só ajuda: mostra a
// máscara, abre o teclado certo e avisa o erro antes de enviar. A regra que vale é a do
// servidor (logix/backend/src/shared/pix.js) — as duas precisam dizer a mesma coisa.
const so = (t) => String(t || '').replace(/\D/g, '');

function cpfValido(d) {
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  for (const n of [9, 10]) {
    let s = 0;
    for (let i = 0; i < n; i += 1) s += Number(d[i]) * (n + 1 - i);
    if (((s * 10) % 11) % 10 !== Number(d[n])) return false;
  }
  return true;
}
function cnpjValido(d) {
  if (!/^\d{14}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false;
  const pesos = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  for (const n of [12, 13]) {
    let s = 0;
    for (let i = 0; i < n; i += 1) s += Number(d[i]) * pesos[i + (13 - n)];
    const r = s % 11;
    if ((r < 2 ? 0 : 11 - r) !== Number(d[n])) return false;
  }
  return true;
}

// Máscara progressiva: vai formatando conforme digita.
export function mascararPix(tipo, texto) {
  const t = String(texto || '');
  if (tipo === 'cpf') {
    const d = so(t).slice(0, 11);
    return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
  }
  if (tipo === 'cnpj') {
    const d = so(t).slice(0, 14);
    return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2');
  }
  if (tipo === 'telefone') {
    let d = so(t);
    if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
    d = d.slice(0, 11);
    if (d.length <= 2) return d.length ? `(${d}` : '';
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }
  if (tipo === 'email' || tipo === 'aleatoria') return t.replace(/\s+/g, '').toLowerCase();
  return t;
}

// Motivo para mostrar antes de enviar, ou null se a chave está no formato.
export function conferirPix(tipo, texto) {
  const t = String(texto || '').trim();
  if (!t) return null;
  if (tipo === 'cpf') return so(t).length !== 11 ? 'O CPF da chave Pix tem 11 números' : cpfValido(so(t)) ? null : 'CPF da chave Pix com dígito errado. Confira os números.';
  if (tipo === 'cnpj') return so(t).length !== 14 ? 'O CNPJ da chave Pix tem 14 números' : cnpjValido(so(t)) ? null : 'CNPJ da chave Pix com dígito errado. Confira os números.';
  if (tipo === 'telefone') { let d = so(t); if (d.length > 11 && d.startsWith('55')) d = d.slice(2); return d.length === 10 || d.length === 11 ? null : 'Celular da chave Pix precisa de DDD + número'; }
  if (tipo === 'email') return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t) ? null : 'E-mail da chave Pix inválido';
  if (tipo === 'aleatoria') { const a = t.replace(/[\s-]/g, ''); return /^[0-9a-f]{32}$/i.test(a) ? null : 'Chave aleatória tem 32 letras e números'; }
  return null;
}

// Teclado e exemplo de cada tipo.
export function campoPix(tipo) {
  return {
    cpf: { keyboardType: 'number-pad', placeholder: '000.000.000-00' },
    cnpj: { keyboardType: 'number-pad', placeholder: '00.000.000/0000-00' },
    telefone: { keyboardType: 'phone-pad', placeholder: '(71) 99999-9999' },
    email: { keyboardType: 'email-address', placeholder: 'seu@email.com' },
    aleatoria: { keyboardType: 'default', placeholder: 'cole a chave que o banco gerou' },
  }[tipo] || { keyboardType: 'default', placeholder: '' };
}

// Mesma chave, ignorando a máscara (o servidor devolve no formato do banco).
export function mesmaChavePix(tipo, a, b) {
  const n = (x) => (['cpf', 'cnpj', 'telefone'].includes(tipo) ? so(x).replace(/^55(?=\d{10,11}$)/, '') : String(x || '').trim().toLowerCase());
  return n(a) === n(b);
}
