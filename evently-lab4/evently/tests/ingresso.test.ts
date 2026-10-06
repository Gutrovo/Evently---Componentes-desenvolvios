import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ConviteDTO, DadosConvidadoDTO, EventoDTO } from '../src/evento/dto';
import type { IEvento } from '../src/evento/IEvento';
import { IngressoComponent } from '../src/ingresso/IngressoComponent';
import { InformacaoEventoFake } from '../src/mocks/InformacaoEventoFake';
import { NotificacaoFake } from '../src/mocks/NotificacaoFake';
import { preCondicao } from '../src/shared/errors';
import { AGORA, esperarViolacao } from './helpers';

/**
 * TESTE DE UNIDADE do Ingresso: o componente Evento é SUBSTITUÍDO por um stub que só implementa IEvento.
 * Isso verifica o contrato do Ingresso isoladamente e prova que ele depende da interface, não da classe.
 */
class EventoStub implements IEvento {
  readonly evento: EventoDTO = {
    id: 'ev1',
    nome: 'Evento Stub',
    local: 'Local',
    dataInicio: '2026-12-10T19:00:00.000Z',
    prazoConfirmacao: '2026-11-30T23:59:59.000Z',
    capacidade: 1,
    organizadorId: 'org',
    criadoEm: AGORA.toISOString(),
  };
  readonly convites = new Map<string, ConviteDTO>();
  falharRegistroTransferencia = false;

  adicionarConvite(id: string, email: string, extra: Partial<ConviteDTO> = {}) {
    this.convites.set(id, {
      id,
      eventoId: 'ev1',
      convidado: { nome: id, email },
      emitidoEm: AGORA.toISOString(),
      expiraEm: this.evento.prazoConfirmacao,
      statusEnvio: 'ENVIADO',
      ...extra,
    });
  }
  async consultarConvite(id: string) {
    const c = this.convites.get(id);
    if (!c) throw preCondicao('CONVITE_INEXISTENTE', 'Convite não encontrado.');
    return c;
  }
  async consultarEvento() {
    return this.evento;
  }
  async registrarConviteTransferido(origem: string, sub: DadosConvidadoDTO) {
    if (this.falharRegistroTransferencia) throw preCondicao('CONVIDADO_JA_CONVIDADO', 'já convidado');
    const id = `novo-${this.convites.size}`;
    this.adicionarConvite(id, sub.email, { conviteOrigemId: origem, statusEnvio: 'PENDENTE' });
    return this.convites.get(id)!;
  }
  // não usadas pelo Ingresso:
  async criarEvento(): Promise<EventoDTO> { throw new Error('não usado'); }
  async emitirConvite(): Promise<ConviteDTO> { throw new Error('não usado'); }
  async consultarStatusConvites(): Promise<ConviteDTO[]> { throw new Error('não usado'); }
}

function preparar(capacidade = 1) {
  let agora = AGORA;
  const evento = new EventoStub();
  evento.evento.capacidade = capacidade;
  const notificacao = new NotificacaoFake();
  const informacao = new InformacaoEventoFake();
  const ingresso = new IngressoComponent(evento, notificacao, informacao, undefined, () => agora);
  evento.adicionarConvite('c1', 'c1@mail.com');
  evento.adicionarConvite('c2', 'c2@mail.com');
  return { evento, notificacao, informacao, ingresso, definirAgora: (d: Date) => (agora = d) };
}

describe('Ingresso — confirmarPresenca', () => {
  it('confirma e libera a trilha (pós-condições)', async () => {
    const { ingresso, informacao } = preparar();
    const r = await ingresso.confirmarPresenca('c1');
    assert.equal(r.status, 'CONFIRMADO');
    assert.deepEqual(informacao.trilhasLiberadas, ['c1']);
    assert.equal((await ingresso.consultarIngresso('c1')).status, 'CONFIRMADO');
  });

  it('rejeita id vazio, nulo e convite inexistente', async () => {
    const { ingresso } = preparar();
    await esperarViolacao(ingresso.confirmarPresenca(''), 'CONVITE_ID_INVALIDO');
    await esperarViolacao(ingresso.confirmarPresenca(null as unknown as string), 'CONVITE_ID_INVALIDO');
    await esperarViolacao(ingresso.confirmarPresenca('zzz'), 'CONVITE_INEXISTENTE');
  });

  it('rejeita convite expirado (vigência)', async () => {
    const { ingresso, definirAgora, informacao } = preparar();
    definirAgora(new Date('2026-12-01T00:00:00Z'));
    await esperarViolacao(ingresso.confirmarPresenca('c1'), 'CONVITE_EXPIRADO');
    assert.equal(informacao.trilhasLiberadas.length, 0);
  });

  it('aceita confirmar exatamente dentro do prazo', async () => {
    const { ingresso, definirAgora } = preparar();
    definirAgora(new Date('2026-11-30T23:59:59Z'));
    assert.equal((await ingresso.confirmarPresenca('c1')).status, 'CONFIRMADO');
  });

  it('rejeita quando não há vagas', async () => {
    const { ingresso } = preparar(1);
    await ingresso.confirmarPresenca('c1');
    await esperarViolacao(ingresso.confirmarPresenca('c2'), 'SEM_VAGAS');
    assert.equal((await ingresso.consultarIngresso('c2')).status, 'PENDENTE');
  });

  it('rejeita convite já respondido', async () => {
    const { ingresso } = preparar(2);
    await ingresso.confirmarPresenca('c1');
    await esperarViolacao(ingresso.confirmarPresenca('c1'), 'CONVITE_JA_RESPONDIDO');
  });

  it('tudo-ou-nada: se a trilha não for liberada, a confirmação é desfeita e a vaga não é consumida', async () => {
    const { ingresso, informacao } = preparar(1);
    informacao.falhar = true;
    await esperarViolacao(ingresso.confirmarPresenca('c1'), 'FALHA_CONFIRMACAO');
    assert.equal((await ingresso.consultarIngresso('c1')).status, 'PENDENTE');
    informacao.falhar = false;
    assert.equal((await ingresso.confirmarPresenca('c2')).status, 'CONFIRMADO'); // vaga continua livre
  });

  it('concorrência: duas confirmações simultâneas disputando a última vaga — só uma vence', async () => {
    const { ingresso } = preparar(1);
    const resultados = await Promise.allSettled([ingresso.confirmarPresenca('c1'), ingresso.confirmarPresenca('c2')]);
    assert.equal(resultados.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(resultados.filter((r) => r.status === 'rejected').length, 1);
  });
});

describe('Ingresso — recusarConvite', () => {
  it('recusa um convite pendente', async () => {
    const { ingresso, informacao } = preparar();
    assert.equal((await ingresso.recusarConvite('c1')).status, 'RECUSADO');
    assert.equal(informacao.trilhasLiberadas.length, 0);
  });
  it('rejeita recusar convite já respondido', async () => {
    const { ingresso } = preparar();
    await ingresso.confirmarPresenca('c1');
    await esperarViolacao(ingresso.recusarConvite('c1'), 'CONVITE_JA_RESPONDIDO');
  });
  it('rejeita recusar convite expirado', async () => {
    const { ingresso, definirAgora } = preparar();
    definirAgora(new Date('2026-12-05T00:00:00Z'));
    await esperarViolacao(ingresso.recusarConvite('c1'), 'CONVITE_EXPIRADO');
  });
  it('convite recusado não ocupa vaga', async () => {
    const { ingresso } = preparar(1);
    await ingresso.recusarConvite('c1');
    assert.equal((await ingresso.confirmarPresenca('c2')).status, 'CONFIRMADO');
  });
});

describe('Ingresso — registrarDesistencia', () => {
  it('registra desistência e libera a vaga', async () => {
    const { ingresso } = preparar(1);
    await ingresso.confirmarPresenca('c1');
    assert.equal((await ingresso.registrarDesistencia('c1')).status, 'DESISTENTE');
    assert.equal((await ingresso.confirmarPresenca('c2')).status, 'CONFIRMADO');
  });
  it('rejeita desistência sem presença confirmada', async () => {
    const { ingresso } = preparar();
    await esperarViolacao(ingresso.registrarDesistencia('c1'), 'INGRESSO_NAO_CONFIRMADO');
    await ingresso.recusarConvite('c1');
    await esperarViolacao(ingresso.registrarDesistencia('c1'), 'INGRESSO_NAO_CONFIRMADO');
  });
  it('rejeita desistir duas vezes', async () => {
    const { ingresso } = preparar();
    await ingresso.confirmarPresenca('c1');
    await ingresso.registrarDesistencia('c1');
    await esperarViolacao(ingresso.registrarDesistencia('c1'), 'INGRESSO_NAO_CONFIRMADO');
  });
});

describe('Ingresso — transferirConvite', () => {
  const sub = { nome: 'Sub', email: 'sub@mail.com' };

  it('transfere: original TRANSFERIDO, novo convite ao substituto, e-mail enviado, vaga liberada', async () => {
    const { ingresso, notificacao } = preparar(1);
    await ingresso.confirmarPresenca('c1');
    const novo = await ingresso.transferirConvite('c1', sub);
    assert.equal(novo.conviteOrigemId, 'c1');
    assert.equal((await ingresso.consultarIngresso('c1')).status, 'TRANSFERIDO');
    assert.equal(notificacao.enviados.at(-1)?.destinatario, 'sub@mail.com');
    assert.equal(notificacao.enviados.at(-1)?.template.tipo, 'CONVITE_TRANSFERIDO');
    assert.equal((await ingresso.confirmarPresenca(novo.id)).status, 'CONFIRMADO'); // substituto usa a vaga liberada
  });

  it('rejeita transferir sem ingresso confirmado', async () => {
    const { ingresso } = preparar();
    await esperarViolacao(ingresso.transferirConvite('c1', sub), 'INGRESSO_NAO_CONFIRMADO');
  });

  it('rejeita substituto inválido', async () => {
    const { ingresso } = preparar();
    await esperarViolacao(ingresso.transferirConvite('c1', { nome: '', email: 'a@a.com' }), 'CAMPO_OBRIGATORIO');
    await esperarViolacao(ingresso.transferirConvite('c1', { nome: 'X', email: 'invalido' }), 'EMAIL_INVALIDO');
  });

  it('rejeita substituto igual ao titular', async () => {
    const { ingresso } = preparar();
    await ingresso.confirmarPresenca('c1');
    await esperarViolacao(ingresso.transferirConvite('c1', { nome: 'Eu', email: 'C1@mail.com' }), 'SUBSTITUTO_IGUAL_TITULAR');
  });

  it('rejeita transferir depois do início do evento', async () => {
    const { ingresso, definirAgora } = preparar();
    await ingresso.confirmarPresenca('c1');
    definirAgora(new Date('2026-12-10T19:00:00Z'));
    await esperarViolacao(ingresso.transferirConvite('c1', sub), 'EVENTO_JA_INICIADO');
  });

  it('rejeita retransferir ingresso que já veio de transferência', async () => {
    const { ingresso } = preparar(2);
    await ingresso.confirmarPresenca('c1');
    const novo = await ingresso.transferirConvite('c1', sub);
    await ingresso.confirmarPresenca(novo.id);
    await esperarViolacao(ingresso.transferirConvite(novo.id, { nome: 'Z', email: 'z@z.com' }), 'TRANSFERENCIA_JA_REALIZADA');
  });

  it('desfaz a transferência se o e-mail ao substituto falhar (titular continua CONFIRMADO)', async () => {
    const { ingresso, notificacao } = preparar();
    await ingresso.confirmarPresenca('c1');
    notificacao.falhar = true;
    await esperarViolacao(ingresso.transferirConvite('c1', sub), 'FALHA_NOTIFICACAO_SUBSTITUTO');
    assert.equal((await ingresso.consultarIngresso('c1')).status, 'CONFIRMADO');
  });

  it('desfaz a transferência se o Evento recusar o novo convite', async () => {
    const { ingresso, evento } = preparar();
    await ingresso.confirmarPresenca('c1');
    evento.falharRegistroTransferencia = true;
    await esperarViolacao(ingresso.transferirConvite('c1', sub), 'CONVIDADO_JA_CONVIDADO');
    assert.equal((await ingresso.consultarIngresso('c1')).status, 'CONFIRMADO');
  });

  it('concorrência: duas transferências simultâneas do mesmo ingresso — só uma vence', async () => {
    const { ingresso } = preparar();
    await ingresso.confirmarPresenca('c1');
    const r = await Promise.allSettled([
      ingresso.transferirConvite('c1', { nome: 'A', email: 'a@a.com' }),
      ingresso.transferirConvite('c1', { nome: 'B', email: 'b@b.com' }),
    ]);
    assert.equal(r.filter((x) => x.status === 'fulfilled').length, 1);
  });
});

describe('Ingresso — consultarIngresso', () => {
  it('retorna PENDENTE para convite sem resposta e rejeita convite inexistente', async () => {
    const { ingresso } = preparar();
    assert.equal((await ingresso.consultarIngresso('c1')).status, 'PENDENTE');
    await esperarViolacao(ingresso.consultarIngresso('zzz'), 'CONVITE_INEXISTENTE');
  });
});
