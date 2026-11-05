// Escolha de estado e cidade onde o entregador vai trabalhar (mockup AppRegiao/AppForaRegiao,
// aprovado em 05/11/2026). Usado na 1ª etapa do cadastro e no "Mudar minha cidade" da tela
// de cadastro aguardando a região.
//
// A lista de estados e cidades vem embutida no app (src/dados/ibge.js) — a tela não depende
// de rede. Cidades atendidas pela empresa aparecem primeiro, com o check. Escolhendo uma
// cidade fora da área, a tela mostra o aviso que a central escreveu (com {empresa} e
// {cidade} trocados) — o entregador pode terminar o cadastro mesmo assim.
//
// Componente controlado: quem usa guarda `uf` e `cidade` ({ codigo, nome }) e recebe as
// escolhas por `onEscolherUf` / `onEscolherCidade` (null = voltou a procurar).
import { useState, useMemo, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, Modal, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ibge from '../dados/ibge';
import { T } from '../tema';
import Icone from './Icone';

const C = {
  azulP: T.primario, azulV: T.vivo,
  tinta: '#0e2138', tinta2: '#46637f', tinta3: '#8ba5bc',
  sup: '#ffffff', sup2: '#f6faff', linha: '#dde9f5',
  ok: '#1f9d6b', okTx: '#13724c', okBg: '#e4f5ee',
  aten: '#c98a1a', atenBg: '#fbf1dd', atenBd: '#ecd3a0', atenTx: '#5c3f06',
};

export const AVISO_PADRAO = 'A {empresa} ainda não está disponível em {cidade}. Você pode terminar o cadastro e vamos te avisar quando começarmos a operar na sua região.';

// ── Busca sem acento (troca 1 letra por 1 letra: as posições batem com o nome original) ──
const ACENTOS = {
  á: 'a', à: 'a', â: 'a', ã: 'a', ä: 'a', é: 'e', è: 'e', ê: 'e', ë: 'e', í: 'i', ì: 'i', î: 'i', ï: 'i',
  ó: 'o', ò: 'o', ô: 'o', õ: 'o', ö: 'o', ú: 'u', ù: 'u', û: 'u', ü: 'u', ç: 'c', ñ: 'n',
};
const semAcento = (s) => String(s || '').toLowerCase().replace(/[áàâãäéèêëíìîïóòôõöúùûüçñ]/g, (c) => ACENTOS[c] || c);

// Sem apóstrofo, hífen e espaço: "olho dagua" acha "Olho d'Água".
const soLetras = (s) => semAcento(s).replace(/[^a-z0-9]/g, '');

const ESTADO_POR_CODIGO = new Map(ibge.estados.map((e) => [e.c, e]));
const ESTADO_POR_UF = new Map(ibge.estados.map((e) => [e.u, e]));
const ESTADOS_ORDEM = [...ibge.estados].sort((a, b) => a.n.localeCompare(b.n, 'pt-BR'));

// Cidades de uma UF já com o nome sem acento (montado uma vez por UF).
const cacheCidades = new Map();
function cidadesDaUf(uf) {
  if (!uf) return [];
  if (cacheCidades.has(uf)) return cacheCidades.get(uf);
  const lista = (ibge.municipios[uf] || []).map(([codigo, nome]) => ({ codigo, nome, n: semAcento(nome), s: soLetras(nome) }));
  cacheCidades.set(uf, lista);
  return lista;
}

export function nomeEstado(uf) { return ESTADO_POR_UF.get(uf)?.n || uf || ''; }
export function ufDoMunicipio(codigo) { return ESTADO_POR_CODIGO.get(Math.floor(Number(codigo) / 100000))?.u || null; }
export function nomeMunicipio(codigo) {
  const uf = ufDoMunicipio(codigo);
  const m = (ibge.municipios[uf] || []).find((x) => x[0] === Number(codigo));
  return m ? m[1] : null;
}

// Regra "atendida" do contrato: sem pedir região ou modo 'todas' → sempre atendida;
// modo 'algumas' → atendida se a UF inteira está na lista OU a cidade está na lista.
export function regiaoAtendida(regioes, uf, codigo) {
  if (!regioes || !regioes.pedir || regioes.modo !== 'algumas') return true;
  if ((regioes.ufs || []).includes(uf)) return true;
  return (regioes.municipios || []).map(Number).includes(Number(codigo));
}

// Estados onde a empresa atende ao menos uma cidade (só no modo 'algumas').
export function ufsAtendidas(regioes) {
  const s = new Set();
  if (!regioes || regioes.modo !== 'algumas') return s;
  (regioes.ufs || []).forEach((u) => s.add(u));
  (regioes.municipios || []).forEach((m) => { const u = ufDoMunicipio(m); if (u) s.add(u); });
  return s;
}

export function textoAviso(regioes, empresa, cidade) {
  return String(regioes?.aviso || AVISO_PADRAO)
    .replace(/\{empresa\}/g, empresa || '')
    .replace(/\{cidade\}/g, cidade || '');
}

// Aviso "fora da região": a 1ª frase vira o título em negrito, o resto o texto embaixo.
export function AvisoForaRegiao({ texto }) {
  const m = /^([^.!?]+)[.!?]\s+([\s\S]+)$/.exec(String(texto || '').trim());
  const titulo = m ? m[1] : null;
  const corpo = m ? m[2] : String(texto || '');
  return (
    <View style={st.aviso} accessibilityRole="alert">
      <View style={st.avisoTopo}>
        <View style={st.avisoIco}><Icone nome="pin" tam={22} cor="#fff" /></View>
        {!!titulo && <Text style={st.avisoTit}>{titulo}</Text>}
      </View>
      {!!corpo && <Text style={st.avisoTxt}>{corpo}</Text>}
    </View>
  );
}

// Nome com o trecho buscado em negrito.
function NomeDestacado({ nome, n, q }) {
  const i = q ? n.indexOf(q) : -1;
  if (i < 0) return <Text style={st.itemTxt} numberOfLines={1}>{nome}</Text>;
  return (
    <Text style={st.itemTxt} numberOfLines={1}>
      {nome.slice(0, i)}<Text style={st.itemForte}>{nome.slice(i, i + q.length)}</Text>{nome.slice(i + q.length)}
    </Text>
  );
}

export default function EscolherRegiao({
  regioes, empresa, uf, cidade, onEscolherUf, onEscolherCidade,
  titulo = 'Onde você vai trabalhar?', subtitulo = 'Escolha o estado e a cidade.',
}) {
  const insetBaixo = useSafeAreaInsets().bottom;
  const [busca, setBusca] = useState('');
  const [listaUf, setListaUf] = useState(false);
  const [focar, setFocar] = useState(false);
  const inputRef = useRef(null);

  const algumas = !!regioes && regioes.pedir !== false && regioes.modo === 'algumas';
  const atendidasUf = useMemo(() => ufsAtendidas(regioes), [regioes]);
  const ufInteira = algumas && !!uf && (regioes.ufs || []).includes(uf);
  const municipiosSet = useMemo(() => new Set((regioes?.municipios || []).map(Number)), [regioes]);

  // Empresa que atende num estado só: já vem escolhido.
  useEffect(() => {
    if (!uf && atendidasUf.size === 1) onEscolherUf?.([...atendidasUf][0]);
  }, []);

  useEffect(() => {
    if (focar && !cidade) { const t = setTimeout(() => inputRef.current?.focus(), 80); setFocar(false); return () => clearTimeout(t); }
  }, [focar, cidade]);

  const q = semAcento(busca.trim());
  const dados = useMemo(() => {
    let lista = cidadesDaUf(uf);
    if (q) {
      const comeca = []; const contem = [];
      const qs = soLetras(q);
      for (const c of lista) {
        const i = c.n.indexOf(q);
        if (i === 0) comeca.push(c); else if (i > 0) contem.push(c);
        else if (qs && c.s.includes(qs)) contem.push(c);
      }
      lista = comeca.concat(contem);
    }
    if (!algumas || ufInteira) return lista.map((c) => ({ ...c, tipo: 'cidade', atende: false }));
    const atendidas = []; const outras = [];
    for (const c of lista) (municipiosSet.has(c.codigo) ? atendidas : outras).push(c);
    const saida = [];
    if (atendidas.length) {
      saida.push({ tipo: 'cab', codigo: 'cab' });
      atendidas.forEach((c) => saida.push({ ...c, tipo: 'cidade', atende: true }));
    }
    outras.forEach((c) => saida.push({ ...c, tipo: 'cidade', atende: false }));
    return saida;
  }, [uf, q, algumas, ufInteira, municipiosSet]);

  function escolherUf(u) {
    setListaUf(false);
    if (u !== uf) { setBusca(''); onEscolherCidade?.(null); onEscolherUf?.(u); setFocar(true); }
  }
  function escolherCidade(c) {
    setBusca('');
    onEscolherCidade?.({ codigo: c.codigo, nome: c.nome, uf, atendida: regiaoAtendida(regioes, uf, c.codigo) });
  }
  function trocarCidade() { onEscolherCidade?.(null); setFocar(true); }

  const cidadeAtendida = cidade ? regiaoAtendida(regioes, uf, cidade.codigo) : true;
  const nomeEmp = String(empresa || '').toUpperCase();

  const renderItem = ({ item }) => {
    if (item.tipo === 'cab') return <Text style={st.cab}>ONDE A {nomeEmp} ATENDE</Text>;
    return (
      <TouchableOpacity style={[st.item, item.atende && st.itemAtende]} onPress={() => escolherCidade(item)} activeOpacity={0.7}
        accessibilityRole="button" accessibilityLabel={item.atende ? `${item.nome}, atendida` : item.nome}>
        <NomeDestacado nome={item.nome} n={item.n} q={q} />
        {item.atende && <Icone nome="check" tam={18} cor={C.ok} traco={2.6} />}
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      {!!titulo && <Text style={st.tit}>{titulo}</Text>}
      {!!subtitulo && <Text style={st.sub}>{subtitulo}</Text>}

      <Text style={st.label}>Estado</Text>
      <TouchableOpacity style={st.select} onPress={() => setListaUf(true)} activeOpacity={0.8}
        accessibilityRole="button" accessibilityLabel={uf ? `Estado: ${nomeEstado(uf)}. Trocar` : 'Escolher o estado'}>
        <Text style={[st.selectTxt, !uf && { color: C.tinta3, fontWeight: '400' }]}>{uf ? `${nomeEstado(uf)} (${uf})` : 'Escolha o estado'}</Text>
        <Icone nome="seta" tam={16} cor={C.tinta2} style={{ transform: [{ rotate: '90deg' }] }} />
      </TouchableOpacity>

      <Text style={[st.label, { marginTop: 12 }]}>Cidade</Text>
      {cidade ? (
        <TouchableOpacity style={st.select} onPress={trocarCidade} activeOpacity={0.8}
          accessibilityRole="button" accessibilityLabel={`Cidade: ${cidade.nome}. Trocar`}>
          <Text style={st.selectTxt} numberOfLines={1}>{cidade.nome}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {algumas && cidadeAtendida && <Icone nome="check" tam={18} cor={C.ok} traco={2.6} />}
            <Icone nome="seta" tam={16} cor={C.tinta2} style={{ transform: [{ rotate: '90deg' }] }} />
          </View>
        </TouchableOpacity>
      ) : (
        <TextInput
          ref={inputRef}
          style={[st.input, !!uf && st.inputAtivo]}
          value={busca}
          onChangeText={setBusca}
          editable={!!uf}
          placeholder={uf ? 'Digite o nome da cidade' : 'Escolha o estado primeiro'}
          placeholderTextColor={C.tinta3}
          autoCorrect={false}
          autoCapitalize="words"
          returnKeyType="search"
          accessibilityLabel="Cidade"
        />
      )}

      {cidade && !cidadeAtendida && (
        <AvisoForaRegiao texto={textoAviso(regioes, empresa, cidade.nome)} />
      )}

      {!cidade && !!uf && (
        <>
          {ufInteira && <Text style={st.nota}>Toda a {nomeEstado(uf)} é atendida.</Text>}
          <FlatList
            style={st.lista}
            data={dados}
            keyExtractor={(it) => String(it.codigo)}
            renderItem={renderItem}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={20}
            maxToRenderPerBatch={30}
            windowSize={9}
            ListEmptyComponent={<Text style={st.vazio}>Nenhuma cidade com esse nome em {nomeEstado(uf)}. Confira o estado ou digite de outro jeito.</Text>}
          />
        </>
      )}

      <Modal visible={listaUf} transparent animationType="slide" onRequestClose={() => setListaUf(false)}>
        <View style={st.modalFundo}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setListaUf(false)} accessibilityLabel="Fechar" />
          <View style={[st.folha, { paddingBottom: 12 + insetBaixo }]}>
            <View style={st.folhaTopo}>
              <Text style={st.folhaTit}>Escolha o estado</Text>
              <TouchableOpacity onPress={() => setListaUf(false)} hitSlop={10} accessibilityLabel="Fechar"><Icone nome="fechar" tam={20} cor={C.tinta2} /></TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              {ESTADOS_ORDEM.map((e) => {
                const sel = e.u === uf;
                const atende = atendidasUf.has(e.u);
                return (
                  <TouchableOpacity key={e.u} style={[st.estado, sel && st.estadoSel]} onPress={() => escolherUf(e.u)} activeOpacity={0.7}
                    accessibilityRole="button" accessibilityState={{ selected: sel }}>
                    <Text style={[st.estadoTxt, sel && { color: C.azulP, fontWeight: '800' }]}>{e.n} ({e.u})</Text>
                    {atende && <Text style={st.estadoTag}>atende</Text>}
                    {sel && <Icone nome="check" tam={18} cor={C.azulP} traco={2.6} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  tit: { fontSize: 18, fontWeight: '800', color: C.tinta, marginBottom: 4 },
  sub: { fontSize: 13, color: C.tinta2, marginBottom: 12, lineHeight: 18 },
  label: { fontSize: 12.5, fontWeight: '700', color: C.tinta2, marginBottom: 6 },
  select: { minHeight: 48, borderWidth: 1.5, borderColor: C.linha, borderRadius: 12, backgroundColor: C.sup, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, gap: 10 },
  selectTxt: { flex: 1, fontSize: 15, fontWeight: '600', color: C.tinta },
  input: { minHeight: 48, borderWidth: 1.5, borderColor: C.linha, borderRadius: 12, backgroundColor: C.sup, paddingHorizontal: 14, fontSize: 15, color: C.tinta },
  inputAtivo: { borderColor: C.azulV },
  nota: { fontSize: 12, color: C.okTx, fontWeight: '600', marginTop: 8 },
  lista: { flex: 1, marginTop: 8, borderWidth: 1, borderColor: C.linha, borderRadius: 12, backgroundColor: C.sup },
  cab: { paddingVertical: 6, paddingHorizontal: 14, fontSize: 10.5, fontWeight: '800', letterSpacing: 0.6, color: C.okTx, backgroundColor: C.okBg },
  item: { minHeight: 46, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderBottomWidth: 1, borderBottomColor: C.linha },
  itemAtende: { backgroundColor: '#f4f8fd' },
  itemTxt: { flex: 1, fontSize: 14.5, color: C.tinta },
  itemForte: { fontWeight: '800' },
  vazio: { padding: 16, fontSize: 13, color: C.tinta2, lineHeight: 19, textAlign: 'center' },

  aviso: { marginTop: 14, backgroundColor: C.atenBg, borderWidth: 1, borderColor: C.atenBd, borderRadius: 16, padding: 16, gap: 8 },
  avisoTopo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avisoIco: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.aten, alignItems: 'center', justifyContent: 'center' },
  avisoTit: { flex: 1, fontSize: 15, fontWeight: '800', color: C.tinta, lineHeight: 20 },
  avisoTxt: { fontSize: 13.5, lineHeight: 20, color: C.atenTx },

  modalFundo: { flex: 1, backgroundColor: 'rgba(4,20,40,0.45)' },
  folha: { maxHeight: '78%', backgroundColor: C.sup, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 8 },
  folhaTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.linha },
  folhaTit: { fontSize: 16, fontWeight: '800', color: C.tinta },
  estado: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: C.linha },
  estadoSel: { backgroundColor: '#eaf3fc' },
  estadoTxt: { flex: 1, fontSize: 15, color: C.tinta, fontWeight: '600' },
  estadoTag: { fontSize: 10, fontWeight: '800', color: C.okTx, backgroundColor: C.okBg, borderRadius: 99, paddingVertical: 2, paddingHorizontal: 8, overflow: 'hidden' },
});
