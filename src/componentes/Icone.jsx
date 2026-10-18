// Ícones de traço do app — o mesmo desenho dos ícones do painel (viewBox 24, traço 2,
// pontas redondas). O app NÃO usa emoji (decisão de 12/10/2026): todo ícone sai daqui.
//
//   <Icone nome="relogio" />                      16 px, cor do texto escuro
//   <Icone nome="mapa" tam={20} cor={T.primario} />
//
// Nome que não existe desenha um círculo vazio (e avisa no console em dev), para a tela
// nunca quebrar por causa de um ícone.
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { T } from '../tema';

// Cada ícone: lista de [tipo, atributos]. Só formas simples — fácil de conferir com o painel.
const P = (d) => ['p', { d }];
const C = (cx, cy, r) => ['c', { cx, cy, r }];
const R = (x, y, width, height, rx = 0) => ['r', { x, y, width, height, rx }];

export const ICONES = {
  // navegação do app
  inicio: [P('M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z')],
  historico: [P('M3 12a9 9 0 1 0 3-6.7L3 8'), P('M3 3v5h5'), P('M12 7v5l3 2')],
  carteira: [P('M20 7H5a2 2 0 0 1 0-4h13v4'), P('M3 5v14a2 2 0 0 0 2 2h15V7'), C(16, 14, 1.4)],
  usuario: [C(12, 8, 4), P('M4 21a8 8 0 0 1 16 0')],
  voltar: [P('M15 6l-6 6 6 6')],
  seta: [P('M9 6l6 6-6 6')],
  setaDireita: [P('M5 12h14'), P('M13 6l6 6-6 6')],
  fechar: [P('M18 6 6 18'), P('M6 6l12 12')],
  mais: [P('M12 5v14'), P('M5 12h14')],
  check: [P('M20 6 9 17l-5-5')],
  // corrida
  relogio: [C(12, 12, 9), P('M12 7v5l3 2')],
  loja: [P('M3 9l1.5-5h15L21 9'), P('M4 9v11h16V9'), P('M9 20v-6h6v6')],
  pin: [P('M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z'), C(12, 10, 2.5)],
  nota: [P('M6 3h12v18l-3-2-3 2-3-2-3 2z'), P('M9 8h6M9 12h6')],
  telefone: [P('M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z')],
  chat: [P('M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12z')],
  mapa: [P('M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z'), P('M9 4v14M15 6v14')],
  navegar: [P('M3 11 22 2l-9 19-2-8z')],
  caixa: [P('M21 8 12 3 3 8v8l9 5 9-5z'), P('M3 8l9 5 9-5M12 13v8')],
  moto: [C(5.5, 17.5, 3.5), C(18.5, 17.5, 3.5), P('M15 6h1l3 5M5.5 14H11l4-8h2M9 14l2-8')],
  camera: [P('M3 8a2 2 0 0 1 2-2h2l2-3h6l2 3h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'), C(12, 13, 3.5)],
  imagem: [R(3, 3, 18, 18, 2), C(8.5, 8.5, 1.5), P('m21 15-5-5L5 21')],
  semSinal: [P('M2 2l20 20'), P('M5.8 8.6A6 6 0 0 0 7 20h10a4 4 0 0 0 2.6-.9M10 5.2A6 6 0 0 1 17.7 10H18a4 4 0 0 1 3.3 6.2')],
  sincronizar: [P('M21 12a9 9 0 0 1-15.5 6.3L3 16'), P('M3 12a9 9 0 0 1 15.5-6.3L21 8'), P('M21 3v5h-5M3 21v-5h5')],
  sinal: [P('M5 12.5a10 10 0 0 1 14 0'), P('M8.5 16a5 5 0 0 1 7 0'), P('M2 9a15 15 0 0 1 20 0'), C(12, 19.5, 0.8)],
  // dinheiro e perfil
  banco: [P('M3 10 12 4l9 6'), P('M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18')],
  dinheiro: [R(2, 6, 20, 12, 2), C(12, 12, 2.5), P('M6 12h.01M18 12h.01')],
  raio: [P('M13 2 4 14h7l-1 8 9-12h-7z')],
  sino: [P('M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9'), P('M10.3 21a1.9 1.9 0 0 0 3.4 0')],
  // Início com mapa (ADR-053)
  olho: [P('M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z'), C(12, 12, 3)],
  olhoFechado: [P('M3 3l18 18'), P('M10.6 6.1A10 10 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3.2 3.9'), P('M6.6 6.6C3.9 8.3 2 12 2 12s3.5 6 10 6a9.6 9.6 0 0 0 5.4-1.6'), P('M9.9 9.9a3 3 0 0 0 4.2 4.2')],
  mira: [C(12, 12, 3), P('M12 2v3M12 19v3M2 12h3M19 12h3'), C(12, 12, 7)],
  camadas: [P('M12 3 2 8l10 5 10-5z'), P('M2 13l10 5 10-5')],
  trofeu: [P('M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z'), P('M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3')],
  presente: [P('M20 12v9H4v-9M2 7h20v5H2zM12 21V7'), P('M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z')],
  ajuda: [C(12, 12, 9), P('M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01')],
  info: [C(12, 12, 9), P('M12 16v-5M12 8h.01')],
  calendario: [R(3, 4, 18, 18, 2), P('M16 2v4M8 2v4M3 10h18')],
  cadeado: [R(4, 11, 16, 10, 2), P('M8 11V7a4 4 0 0 1 8 0v4')],
  documento: [P('M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z'), P('M14 3v6h6M8 13h8M8 17h5')],
  prancheta: [R(6, 4, 12, 18, 2), P('M9 4V3h6v1'), P('M9 10h6M9 14h6M9 18h3')],
  selfie: [R(6, 2, 12, 20, 2.5), C(12, 10, 2.5), P('M8.5 17a3.5 3.5 0 0 1 7 0')],
  celular: [R(6, 2, 12, 20, 2.5), P('M11 18h2')],
  clipe: [P('m21 11-9.2 9.2a5.5 5.5 0 0 1-7.8-7.8l9.2-9.2a3.7 3.7 0 0 1 5.2 5.2l-9.2 9.2a1.8 1.8 0 0 1-2.6-2.6l8.5-8.5')],
  enviar: [P('M22 2 11 13'), P('M22 2l-7 20-4-9-9-4z')],
  alerta: [P('M12 3 2 20h20L12 3z'), P('M12 10v4M12 17h.01')],
  medalha: [C(12, 15, 6), P('M8.5 9.5 6 2h4l2 5 2-5h4l-2.5 7.5')],
  estrela: [P('m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9z')],
  diamante: [P('M6 3h12l4 6-10 12L2 9z'), P('M2 9h20M12 21 8 9l4-6 4 6z')],
  alvo: [C(12, 12, 9), C(12, 12, 5), C(12, 12, 1)],
  som: [P('M11 5 6 9H2v6h4l5 4z'), P('M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14')],
  vibrar: [R(7, 3, 10, 18, 2), P('M3 8v8M21 8v8')],
  engrenagem: [C(12, 12, 3), P('M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z')],
  lampada: [P('M9 18h6M10 22h4'), P('M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z')],
  fone: [P('M3 18v-6a9 9 0 0 1 18 0v6'), P('M21 19a2 2 0 0 1-2 2h-1v-6h3zM3 19a2 2 0 0 0 2 2h1v-6H3z')],
  ampulheta: [P('M6 2h12M6 22h12'), P('M7 2c0 5 5 6 5 10s-5 5-5 10M17 2c0 5-5 6-5 10s5 5 5 10')],
  editar: [P('M12 20h9'), P('M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z')],
  desfazer: [P('M9 14 4 9l5-5'), P('M4 9h10.5a5.5 5.5 0 0 1 0 11H11')],
  entrada: [P('M12 19V5'), P('M5 12l7-7 7 7')],
  saida: [P('M12 5v14'), P('M19 12l-7 7-7-7')],
  lista: [P('M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01')],
};

export default function Icone({ nome, tam = 16, cor = T.tinta, traco = 2, style }) {
  const formas = ICONES[nome];
  if (!formas && __DEV__) console.warn('[Icone] nome desconhecido:', nome);
  const props = { stroke: cor, strokeWidth: traco, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' };
  return (
    <Svg width={tam} height={tam} viewBox="0 0 24 24" style={style}>
      {(formas || [C(12, 12, 9)]).map(([tipo, a], i) => (
        tipo === 'p' ? <Path key={i} d={a.d} {...props} />
          : tipo === 'c' ? <Circle key={i} cx={a.cx} cy={a.cy} r={a.r} {...props} />
            : <Rect key={i} x={a.x} y={a.y} width={a.width} height={a.height} rx={a.rx} {...props} />
      ))}
    </Svg>
  );
}
