// Tela aberta agora (caminho do expo-router), mantida pelo _layout. Serve para avisos que
// dependem de onde o motoboy está — ex.: a "Nova corrida disponível!" não aparece por cima
// da própria tela de corrida (ADR-053).
let _tela = '/';
export function setTelaAtual(caminho) { _tela = caminho || '/'; }
export function telaAtual() { return _tela; }
