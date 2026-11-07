// Termo de uso formatado (06/11/2026): o painel guarda o termo como HTML de um subconjunto
// fechado (o servidor já limpa tudo o que estiver fora dele — ADR-072):
//   blocos  <p> <h3> <ul> <ol> <li> <br>
//   inline  <b> <i> <u> <mark> <span data-cor="marca|vermelho|verde|azul">
// Aqui isso vira <Text>/<View> do React Native, sem WebView. Qualquer tag fora da lista é
// ignorada (fica só o texto), então um termo antigo ou estranho nunca quebra a tela.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { T } from '../tema';

const CORES = { marca: T.primario, vermelho: '#c0362c', verde: '#13724c', azul: '#185fa5' };
const BLOCOS = new Set(['p', 'h3', 'ul', 'ol', 'li']);
const INLINE = new Set(['b', 'i', 'u', 'mark', 'span']);

function decodificar(s) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

// HTML → árvore { tag, cor, filhos } | string. Tolera tag sem fechar e fechamento sobrando.
export function lerTermo(html) {
  const raiz = { tag: 'raiz', filhos: [] };
  const pilha = [raiz];
  const re = /<(\/?)([a-z0-9]+)([^>]*)>|([^<]+)/gi;
  let m;
  while ((m = re.exec(String(html || '')))) {
    if (m[4] != null) { pilha[pilha.length - 1].filhos.push(decodificar(m[4])); continue; }
    const fecha = m[1] === '/'; const tag = m[2].toLowerCase();
    if (tag === 'br') { pilha[pilha.length - 1].filhos.push('\n'); continue; }
    if (!BLOCOS.has(tag) && !INLINE.has(tag)) continue;
    if (fecha) {
      const i = pilha.map((n) => n.tag).lastIndexOf(tag);
      if (i > 0) pilha.length = i;
      continue;
    }
    const cor = tag === 'span' ? ((m[3].match(/data-cor\s*=\s*"([a-z]+)"/) || [])[1] || null) : null;
    const no = { tag, cor, filhos: [] };
    pilha[pilha.length - 1].filhos.push(no);
    pilha.push(no);
  }
  return raiz;
}

// Texto puro (formato 'texto'): uma linha em branco separa parágrafos, como antes.
export function textoParaArvore(texto) {
  return { tag: 'raiz', filhos: String(texto || '').split(/\n{2,}/).map((p) => ({ tag: 'p', filhos: [p] })) };
}

function estiloInline(no) {
  if (no.tag === 'b') return st.b;
  if (no.tag === 'i') return st.i;
  if (no.tag === 'u') return st.u;
  if (no.tag === 'mark') return st.mark;
  if (no.tag === 'span' && CORES[no.cor]) return { color: CORES[no.cor] };
  return null;
}

// Conteúdo inline (texto + b/i/u/mark/span aninhados) dentro de um <Text>.
function Inline({ filhos }) {
  return filhos.map((f, i) => (typeof f === 'string'
    ? f
    : <Text key={i} style={estiloInline(f)}>{f.tag === 'ul' || f.tag === 'ol' || f.tag === 'li' || f.tag === 'p' || f.tag === 'h3' ? textoDe(f) : <Inline filhos={f.filhos} />}</Text>));
}
const textoDe = (no) => (typeof no === 'string' ? no : no.filhos.map(textoDe).join(''));

function Lista({ no }) {
  const itens = no.filhos.filter((f) => typeof f !== 'string' || f.trim());
  return (
    <View style={st.lista}>
      {itens.map((li, i) => (
        <View key={i} style={st.item}>
          <Text style={st.marcador}>{no.tag === 'ol' ? `${i + 1}.` : '•'}</Text>
          <Text style={[st.texto, { flex: 1 }]}>{typeof li === 'string' ? li : <Inline filhos={li.filhos} />}</Text>
        </View>
      ))}
    </View>
  );
}

export default function TermoFormatado({ termo }) {
  const arvore = termo && termo.formato === 'html' ? lerTermo(termo.texto) : textoParaArvore(termo && termo.texto);
  // Junta texto/inline soltos no nível de cima num parágrafo implícito.
  const blocos = []; let solto = null;
  for (const f of arvore.filhos) {
    if (typeof f !== 'string' && BLOCOS.has(f.tag)) { solto = null; blocos.push(f); continue; }
    if (!solto) { solto = { tag: 'p', filhos: [] }; blocos.push(solto); }
    solto.filhos.push(f);
  }
  return (
    <View>
      {blocos.map((b, i) => {
        if (b.tag === 'ul' || b.tag === 'ol') return <Lista key={i} no={b} />;
        const vazio = !textoDe(b).trim();
        if (vazio) return null;
        return (
          <Text key={i} selectable style={b.tag === 'h3' ? st.titulo : st.paragrafo}>
            <Inline filhos={b.filhos} />
          </Text>
        );
      })}
    </View>
  );
}

const st = StyleSheet.create({
  paragrafo: { fontSize: 13.5, lineHeight: 21.5, color: T.tinta, marginBottom: 8 },
  texto: { fontSize: 13.5, lineHeight: 21.5, color: T.tinta },
  titulo: { fontSize: 15, lineHeight: 22, fontWeight: '800', color: T.tinta, marginTop: 6, marginBottom: 4 },
  lista: { marginBottom: 8, gap: 2 },
  item: { flexDirection: 'row', gap: 8, paddingLeft: 4 },
  marcador: { fontSize: 13.5, lineHeight: 21.5, color: T.tinta, minWidth: 16, fontWeight: '700' },
  b: { fontWeight: '800' },
  i: { fontStyle: 'italic' },
  u: { textDecorationLine: 'underline' },
  mark: { backgroundColor: '#fde68a' },
});
