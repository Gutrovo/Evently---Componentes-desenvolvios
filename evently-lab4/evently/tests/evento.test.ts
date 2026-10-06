import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CONVIDADO_USER, OUTRO_ORGANIZADOR } from '../src/composicao';
import { DADOS_EVENTO, ORGANIZADOR, esperarViolacao, novoSistema } from './helpers';

describe('Evento — criarEvento', () => {
  it('cria evento válido para organizador autenticado', async () => {
    const { eventoComponent } = novoSistema();
    const ev = await eventoComponent.criarEvento(ORGANIZADOR, DADOS_EVENTO);
    assert.ok(ev.id);
    assert.equal(ev.organizadorId, 'u-ana');
    assert.equal(ev.capacidade, 2);
    assert.deepEqual(await eventoComponent.consultarEvento(ev.id), ev); // pós-condição: persistido
  });

  it('rejeita credenciais inválidas', async () => {
    const { eventoComponent } = novoSistema();
    await esperarViolacao(
      eventoComponent.criarEvento({ email: 'ana@evently.com', senha: 'errada' }, DADOS_EVENTO),
      'NAO_AUTENTICADO',
    );
  });

  it('rejeita usuário que não é organizador', async () => {
    const { eventoComponent } = novoSistema();
    await esperarViolacao(eventoComponent.criarEvento(CONVIDADO_USER, DADOS_EVENTO), 'PERFIL_NAO_AUTORIZADO');
  });

  const invalidos: Array<[string, Partial<typeof DADOS_EVENTO>, string]> = [
    ['nome vazio', { nome: '  ' }, 'CAMPO_OBRIGATORIO'],
    ['capacidade zero', { capacidade: 0 }, 'CAPACIDADE_INVALIDA'],
    ['capacidade fracionada', { capacidade: 1.5 }, 'CAPACIDADE_INVALIDA'],
    ['data de início no passado', { dataInicio: '2026-01-01T10:00:00Z' }, 'DATA_NO_PASSADO'],
    ['data inválida', { dataInicio: 'ontem' }, 'DATA_INVALIDA'],
    ['prazo no passado', { prazoConfirmacao: '2026-01-01T10:00:00Z' }, 'PRAZO_NO_PASSADO'],
    ['prazo depois do início', { prazoConfirmacao: '2026-12-11T10:00:00Z' }, 'PRAZO_APOS_INICIO'],
  ];
  for (const [descricao, alteracao, codigo] of invalidos) {
    it(`rejeita ${descricao}`, async () => {
      const { eventoComponent } = novoSistema();
      await esperarViolacao(eventoComponent.criarEvento(ORGANIZADOR, { ...DADOS_EVENTO, ...alteracao }), codigo);
    });
  }
});

describe('Evento — emitirConvite', () => {
  async function preparar() {
    const s = novoSistema();
    const ev = await s.eventoComponent.criarEvento(ORGANIZADOR, DADOS_EVENTO);
    return { ...s, ev };
  }

  it('emite convite, envia e-mail via INotificacao e registra ENVIADO', async () => {
    const { eventoComponent, notificacao, ev } = await preparar();
    const c = await eventoComponent.emitirConvite(ORGANIZADOR, { nome: 'Carla', email: 'Carla@Mail.com' }, ev.id);
    assert.equal(c.statusEnvio, 'ENVIADO');
    assert.equal(c.convidado.email, 'carla@mail.com'); // normalizado
    assert.equal(c.expiraEm, new Date(DADOS_EVENTO.prazoConfirmacao).toISOString());
    assert.equal(notificacao.enviados.length, 1);
    assert.equal(notificacao.enviados[0]?.destinatario, 'carla@mail.com');
    assert.equal(notificacao.enviados[0]?.template.tipo, 'CONVITE');
  });

  it('rejeita e-mail inválido', async () => {
    const { eventoComponent, ev } = await preparar();
    await esperarViolacao(eventoComponent.emitirConvite(ORGANIZADOR, { nome: 'X', email: 'xx' }, ev.id), 'EMAIL_INVALIDO');
  });

  it('rejeita evento inexistente', async () => {
    const { eventoComponent } = await preparar();
    await esperarViolacao(
      eventoComponent.emitirConvite(ORGANIZADOR, { nome: 'X', email: 'x@x.com' }, 'nao-existe'),
      'EVENTO_INEXISTENTE',
    );
  });

  it('rejeita convidado duplicado no mesmo evento', async () => {
    const { eventoComponent, ev } = await preparar();
    await eventoComponent.emitirConvite(ORGANIZADOR, { nome: 'Carla', email: 'carla@mail.com' }, ev.id);
    await esperarViolacao(
      eventoComponent.emitirConvite(ORGANIZADOR, { nome: 'Carla 2', email: 'CARLA@mail.com' }, ev.id),
      'CONVIDADO_JA_CONVIDADO',
    );
  });

  it('rejeita organizador diferente do dono do evento', async () => {
    const { eventoComponent, ev } = await preparar();
    await esperarViolacao(
      eventoComponent.emitirConvite(OUTRO_ORGANIZADOR, { nome: 'X', email: 'x@x.com' }, ev.id),
      'EVENTO_DE_OUTRO_ORGANIZADOR',
    );
  });

  it('rejeita quem não é organizador', async () => {
    const { eventoComponent, ev } = await preparar();
    await esperarViolacao(
      eventoComponent.emitirConvite(CONVIDADO_USER, { nome: 'X', email: 'x@x.com' }, ev.id),
      'PERFIL_NAO_AUTORIZADO',
    );
  });

  it('falha no envio de e-mail NÃO perde o convite (statusEnvio = FALHA)', async () => {
    const { eventoComponent, notificacao, ev } = await preparar();
    notificacao.falhar = true;
    const c = await eventoComponent.emitirConvite(ORGANIZADOR, { nome: 'Carla', email: 'carla@mail.com' }, ev.id);
    assert.equal(c.statusEnvio, 'FALHA');
    const lista = await eventoComponent.consultarStatusConvites(ev.id);
    assert.equal(lista.length, 1);
    assert.equal(lista[0]?.statusEnvio, 'FALHA');
  });
});

describe('Evento — consultas', () => {
  it('consultarStatusConvites lista os convites do evento e é vazia sem convites', async () => {
    const { eventoComponent } = novoSistema();
    const ev = await eventoComponent.criarEvento(ORGANIZADOR, DADOS_EVENTO);
    assert.deepEqual(await eventoComponent.consultarStatusConvites(ev.id), []);
    await eventoComponent.emitirConvite(ORGANIZADOR, { nome: 'A', email: 'a@a.com' }, ev.id);
    await eventoComponent.emitirConvite(ORGANIZADOR, { nome: 'B', email: 'b@b.com' }, ev.id);
    assert.equal((await eventoComponent.consultarStatusConvites(ev.id)).length, 2);
  });

  it('consultarStatusConvites rejeita evento inexistente', async () => {
    const { eventoComponent } = novoSistema();
    await esperarViolacao(eventoComponent.consultarStatusConvites('x'), 'EVENTO_INEXISTENTE');
  });

  it('consultarConvite rejeita convite inexistente', async () => {
    const { eventoComponent } = novoSistema();
    await esperarViolacao(eventoComponent.consultarConvite('x'), 'CONVITE_INEXISTENTE');
  });

  it('encapsulamento: alterar o objeto retornado não altera o estado interno', async () => {
    const { eventoComponent } = novoSistema();
    const ev = await eventoComponent.criarEvento(ORGANIZADOR, DADOS_EVENTO);
    ev.capacidade = 9999;
    assert.equal((await eventoComponent.consultarEvento(ev.id)).capacidade, 2);
  });
});

describe('Evento — registrarConviteTransferido', () => {
  it('cria convite do substituto ligado ao de origem, vigente até o início do evento', async () => {
    const { eventoComponent } = novoSistema();
    const ev = await eventoComponent.criarEvento(ORGANIZADOR, DADOS_EVENTO);
    const origem = await eventoComponent.emitirConvite(ORGANIZADOR, { nome: 'A', email: 'a@a.com' }, ev.id);
    const novo = await eventoComponent.registrarConviteTransferido(origem.id, { nome: 'B', email: 'b@b.com' });
    assert.equal(novo.conviteOrigemId, origem.id);
    assert.equal(novo.expiraEm, ev.dataInicio);
  });

  it('rejeita origem inexistente e substituto já convidado', async () => {
    const { eventoComponent } = novoSistema();
    const ev = await eventoComponent.criarEvento(ORGANIZADOR, DADOS_EVENTO);
    const origem = await eventoComponent.emitirConvite(ORGANIZADOR, { nome: 'A', email: 'a@a.com' }, ev.id);
    await esperarViolacao(eventoComponent.registrarConviteTransferido('x', { nome: 'B', email: 'b@b.com' }), 'CONVITE_INEXISTENTE');
    await esperarViolacao(
      eventoComponent.registrarConviteTransferido(origem.id, { nome: 'A2', email: 'a@a.com' }),
      'CONVIDADO_JA_CONVIDADO',
    );
  });
});
