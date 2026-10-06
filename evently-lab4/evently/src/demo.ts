import { montarSistema, ORGANIZADOR } from './composicao';
import { ContratoError } from './shared/errors';

// Relógio fixo para o demo ser reproduzível
const AGORA = new Date('2026-10-05T12:00:00Z');
const { eventoComponent: evento, ingressoComponent: ingresso, notificacao, informacao } = montarSistema(() => AGORA);

const titulo = (t: string) => console.log(`\n=== ${t} ===`);
const tentar = async (descricao: string, fn: () => Promise<unknown>) => {
  try {
    await fn();
    console.log(`  [OK]   ${descricao}`);
  } catch (e) {
    if (e instanceof ContratoError) console.log(`  [ERRO] ${descricao} -> ${e.tipo}/${e.codigo}: ${e.message}`);
    else throw e;
  }
};

async function main() {
  titulo('1) Evento: organizador cria o evento (usa IAutenticacao)');
  const ev = await evento.criarEvento(ORGANIZADOR, {
    nome: 'Evently Summit',
    local: 'FEI - São Bernardo do Campo',
    dataInicio: '2026-12-10T19:00:00Z',
    prazoConfirmacao: '2026-11-30T23:59:59Z',
    capacidade: 2,
  });
  console.log(`  Evento criado: ${ev.nome} (capacidade ${ev.capacidade})`);

  titulo('2) Evento: emite 3 convites (usa INotificacao)');
  const c1 = await evento.emitirConvite(ORGANIZADOR, { nome: 'Carla', email: 'carla@mail.com' }, ev.id);
  const c2 = await evento.emitirConvite(ORGANIZADOR, { nome: 'Diego', email: 'diego@mail.com' }, ev.id);
  const c3 = await evento.emitirConvite(ORGANIZADOR, { nome: 'Elisa', email: 'elisa@mail.com' }, ev.id);
  console.log(`  E-mails enviados: ${notificacao.enviados.map((e) => e.destinatario).join(', ')}`);

  titulo('3) Ingresso consulta o Evento por IEvento e confirma presença');
  const i1 = await ingresso.confirmarPresenca(c1.id);
  const i2 = await ingresso.confirmarPresenca(c2.id);
  console.log(`  Carla: ${i1.status} | Diego: ${i2.status}`);
  console.log(`  Trilhas liberadas via IInformacaoEvento: ${informacao.trilhasLiberadas.length}`);

  titulo('4) Regras de negócio (contratos) sendo aplicadas');
  await tentar('Elisa tenta confirmar com evento lotado (capacidade 2)', () => ingresso.confirmarPresenca(c3.id));
  await tentar('Carla tenta confirmar de novo', () => ingresso.confirmarPresenca(c1.id));
  await tentar('Convite inexistente', () => ingresso.confirmarPresenca('nao-existe'));

  titulo('5) Desistência libera vaga');
  const d = await ingresso.registrarDesistencia(c2.id);
  console.log(`  Diego: ${d.status}`);
  await tentar('Elisa confirma agora que há vaga', () => ingresso.confirmarPresenca(c3.id));

  titulo('6) Transferência: Carla passa o ingresso a Fábio');
  const novo = await ingresso.transferirConvite(c1.id, { nome: 'Fábio', email: 'fabio@mail.com' });
  console.log(`  Novo convite para ${novo.convidado.nome} (origem: ${novo.conviteOrigemId === c1.id ? 'convite da Carla' : '?'})`);
  console.log(`  Ingresso da Carla: ${(await ingresso.consultarIngresso(c1.id)).status}`);
  console.log(`  E-mail ao substituto: ${notificacao.enviados.at(-1)?.template.tipo} -> ${notificacao.enviados.at(-1)?.destinatario}`);
  await tentar('Fábio confirma o ingresso recebido', () => ingresso.confirmarPresenca(novo.id));
  await tentar('Fábio tenta transferir de novo', () => ingresso.transferirConvite(novo.id, { nome: 'Gil', email: 'gil@mail.com' }));

  titulo('7) Resumo final dos convites do evento (IEvento.consultarStatusConvites)');
  for (const c of await evento.consultarStatusConvites(ev.id)) {
    const st = (await ingresso.consultarIngresso(c.id)).status;
    const envio = c.conviteOrigemId ? 'via transferência' : c.statusEnvio;
    console.log(`  ${c.convidado.nome.padEnd(6)} envio=${envio.padEnd(17)} ingresso=${st}`);
  }
}

main();
