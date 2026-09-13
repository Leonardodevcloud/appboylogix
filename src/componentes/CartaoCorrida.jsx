// Cartão de corrida da lista "Corridas disponíveis" — v2 (11d, pedido do operador):
// número do serviço GRANDE, pedido e NF em destaque, cliente (fantasia + razão social),
// destinatário com telefone (toca para ligar) e observações. Só mostra o que a API devolveu.
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { T, reais, hora, km, curto } from '../tema';

// Só aceita telefone de verdade no slot de telefone (o cadastro às vezes traz e-mail ali).
function telefoneValido(v) {
  const n = String(v || '').replace(/\D/g, '');
  return n.length >= 8 && !/@/.test(String(v || '')) ? n : null;
}
function ligar(tel) {
  const n = String(tel || '').replace(/\D/g, '');
  if (n) Linking.openURL(`tel:${n}`).catch(() => {});
}

export default function CartaoCorrida({ oferta: o, destaque = false, onVer, onMapa }) {
  const pontos = Array.isArray(o.pontos) ? o.pontos : [];
  const totalDest = pontos.length || Number(o.qtd_pontos) || 1;
  const ateColeta = km(o.distancia_km), rota = Number(o.rota_km) > 0 ? km(o.rota_km) : null;
  const nfs = pontos.map(p => p.numero_nf).filter(Boolean);
  const p1 = pontos[0] || {};
  const obs = pontos.map(p => p.observacoes).filter(Boolean);

  return (
    <View style={[st.cartao, destaque && st.destaque]}>
      {/* Serviço + pedido no topo, grandes: é o que o motoboy fala com a loja e com a central */}
      <View style={st.topo}>
        <View style={{ flex: 1 }}>
          <Text style={st.servicoLbl}>SERVIÇO</Text>
          <Text style={st.servico}>{o.protocolo}</Text>
        </View>
        {!!o.pedido && (
          <View style={st.pedidoBox}>
            <Text style={st.servicoLbl}>PEDIDO</Text>
            <Text style={st.pedido} numberOfLines={1}>{o.pedido}</Text>
          </View>
        )}
        {destaque && <View style={st.tag}><Text style={st.tagTxt}>mais perto</Text></View>}
      </View>

      {Number(o.valor_motoboy_cent) > 0 && <Text style={st.valor}>{reais(o.valor_motoboy_cent)} <Text style={st.valorSub}>você recebe</Text></Text>}

      <View style={st.cliente}>
        <Text style={st.clienteNome} numberOfLines={1}>{o.cliente_nome || o.coleta_nome || 'Cliente'}</Text>
        {!!o.cliente_razao && o.cliente_razao !== o.cliente_nome && <Text style={st.clienteRazao} numberOfLines={1}>{o.cliente_razao}</Text>}
        {!!o.prazo_em && <Text style={st.prazo}>Entregar até {hora(o.prazo_em)}</Text>}
      </View>

      {nfs.length > 0 && (
        <View style={st.chips}>
          {nfs.map((nf, i) => <View key={i} style={st.chipNf}><Text style={st.chipNfTxt}>NF {nf}</Text></View>)}
        </View>
      )}

      <View style={st.kms}>
        {!!ateColeta && <View style={st.km}><Text style={st.kmB}>{ateColeta}</Text><Text style={st.kmL}>até a coleta</Text></View>}
        {!!rota && <View style={st.km}><Text style={st.kmB}>{rota}</Text><Text style={st.kmL}>de rota</Text></View>}
        <View style={st.km}><Text style={st.kmB}>{totalDest}</Text><Text style={st.kmL}>{totalDest === 1 ? 'entrega' : 'entregas'}</Text></View>
      </View>

      <View style={st.rota}>
        <View style={st.p}>
          <View style={[st.bola, { backgroundColor: T.vivo }]} />
          <View style={{ flex: 1 }}>
            <Text style={st.pLbl}>Coleta</Text>
            <Text style={st.pTxt}>{curto(o.coleta_endereco)}</Text>
          </View>
        </View>
        <View style={st.traco} />
        <View style={st.p}>
          <View style={[st.bola, { backgroundColor: T.ganho }]} />
          <View style={{ flex: 1 }}>
            <Text style={st.pLbl}>{totalDest > 1 ? 'Entrega 1' : 'Entrega'}</Text>
            <Text style={st.pTxt}>{curto(p1.endereco || o.primeiro_destino)}{p1.complemento ? ` · ${p1.complemento}` : ''}{totalDest > 1 ? `  +${totalDest - 1} ${totalDest - 1 === 1 ? 'parada' : 'paradas'}` : ''}</Text>
            {(!!(p1.nome_fantasia || p1.nome) || !!telefoneValido(p1.telefone)) && (
              <Text style={st.destinatario}>
                {(p1.nome_fantasia || p1.nome) ? `Destinatário: ${p1.nome_fantasia || p1.nome}` : 'Destinatário'}
                {!!telefoneValido(p1.telefone) && <Text style={st.tel} onPress={() => ligar(p1.telefone)}>{'  '}{p1.telefone}</Text>}
              </Text>
            )}
          </View>
        </View>
      </View>

      {obs.length > 0 && (
        <View style={st.obs}><Text style={st.obsTxt} numberOfLines={3}>{obs.join(' · ')}</Text></View>
      )}

      <View style={st.acoes}>
        <TouchableOpacity style={st.btnMapa} onPress={onMapa} activeOpacity={0.8}><Text style={st.btnMapaTxt}>🗺️</Text></TouchableOpacity>
        <TouchableOpacity style={st.btnVer} onPress={onVer} activeOpacity={0.85}><Text style={st.btnVerTxt}>Ver e aceitar</Text></TouchableOpacity>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  cartao: { backgroundColor: T.sup, borderWidth: 1, borderColor: T.linha, borderRadius: T.r, padding: 16, marginBottom: 12 },
  destaque: { borderColor: T.vivo, borderWidth: 2, shadowColor: T.primario, shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  topo: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  servicoLbl: { fontSize: 10.5, fontWeight: '800', color: T.tinta3, letterSpacing: 1 },
  servico: { fontSize: 30, fontWeight: '800', color: T.profundo, letterSpacing: -0.5, lineHeight: 34 },
  pedidoBox: { backgroundColor: T.suave, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6, maxWidth: 150 },
  pedido: { fontSize: 18, fontWeight: '800', color: T.primario },
  tag: { backgroundColor: T.ganhoBg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start' },
  tagTxt: { color: T.ganhoEsc, fontSize: 12.5, fontWeight: '700' },
  valor: { fontSize: 24, fontWeight: '800', color: T.ganhoEsc, marginTop: 10 },
  valorSub: { fontSize: 13, fontWeight: '600', color: T.tinta2 },
  cliente: { marginTop: 10 },
  clienteNome: { fontSize: 17, fontWeight: '800', color: T.tinta },
  clienteRazao: { fontSize: 12.5, color: T.tinta2, fontWeight: '600', marginTop: 1 },
  prazo: { marginTop: 4, fontSize: 12.5, fontWeight: '800', color: T.atencaoTx, backgroundColor: T.atencaoBg, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  chipNf: { backgroundColor: T.profundo, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  chipNfTxt: { color: '#fff', fontSize: 13, fontWeight: '800' },
  kms: { flexDirection: 'row', gap: 8, marginTop: 12 },
  km: { flex: 1, backgroundColor: T.suave, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10 },
  kmB: { fontSize: 17, fontWeight: '800', color: T.tinta },
  kmL: { fontSize: 11.5, color: T.tinta2, fontWeight: '600' },
  rota: { marginTop: 12 },
  p: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  bola: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
  traco: { width: 2, height: 12, backgroundColor: T.claro, marginLeft: 4, marginVertical: 2 },
  pLbl: { fontSize: 12.5, fontWeight: '800', color: T.tinta2 },
  tel: { color: T.primario, fontWeight: '800' },
  pTxt: { fontSize: 14, color: T.tinta, lineHeight: 19, marginTop: 1 },
  destinatario: { fontSize: 12.5, color: T.tinta2, fontWeight: '600', marginTop: 3 },
  obs: { marginTop: 10, backgroundColor: T.atencaoBg, borderRadius: 10, padding: 10 },
  obsTxt: { fontSize: 13, color: T.atencaoTx, lineHeight: 18, fontWeight: '600' },
  acoes: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btnMapa: { width: 56, height: 50, borderRadius: 14, backgroundColor: T.suave, alignItems: 'center', justifyContent: 'center' },
  btnMapaTxt: { fontSize: 22 },
  btnVer: { flex: 1, height: 50, borderRadius: 14, backgroundColor: T.ganho, alignItems: 'center', justifyContent: 'center' },
  btnVerTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
