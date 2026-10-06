import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DADOS_EVENTO, ORGANIZADOR, esperarViolacao, novoSistema } from './helpers';

/** TESTES DE INTEGRAÇÃO: Evento REAL + Ingresso REAL conversando apenas por IEvento. */
async function cenario(capacidade = 2) {
  const s = novoSistema();
  const ev = await s.eventoComponent.criarEvento(ORGANIZADOR, { ...DADOS_EVENTO, capacidade });
  const convite = (nome: string, email: string) => s.eventoComponent.emitirConvite(ORGANIZADOR, { nome, email }, ev.id);
  return { ...s, ev, convite };
}

describe('Integração Evento ↔ Ingresso', () => {
  it('fluxo completo: criar evento → emitir convite → confirmar presença → trilha liberada', async () => {
    const { ingressoComponent, informacao, notificacao, convite } = await cenario();
    const c = await convite('Carla', 'carla@mail.com');
    assert.equal(notificacao.enviados.length, 1); // Evento usou INotificacao
    const ing = await ingressoComponent.confirmarPresenca(c.id); // Ingresso usou IEvento para achar convite/evento
    assert.equal(ing.status, 'CONFIRMADO');
    assert.deepEqual(informacao.trilhasLiberadas, [c.id]); // Ingresso usou IInformacaoEvento
  });

  it('Ingresso respeita a capacidade definida no Evento', async () => {
    const { ingressoComponent, convite } = await cenario(2);
    const [a, b, c] = [await convite('A', 'a@a.com'), await convite('B', 'b@b.com'), await convite('C', 'c@c.com')];
    await ingressoComponent.confirmarPresenca(a.id);
    await ingressoComponent.confirmarPresenca(b.id);
    await esperarViolacao(ingressoComponent.confirmarPresenca(c.id), 'SEM_VAGAS');
  });

  it('desistência libera vaga para outro convidado do mesmo evento', async () => {
    const { ingressoComponent, convite } = await cenario(1);
    const a = await convite('A', 'a@a.com');
    const b = await convite('B', 'b@b.com');
    await ingressoComponent.confirmarPresenca(a.id);
    await esperarViolacao(ingressoComponent.confirmarPresenca(b.id), 'SEM_VAGAS');
    await ingressoComponent.registrarDesistencia(a.id);
    assert.equal((await ingressoComponent.confirmarPresenca(b.id)).status, 'CONFIRMADO');
  });

  it('vagas são por evento: lotar um evento não afeta outro', async () => {
    const { ingressoComponent, eventoComponent, convite } = await cenario(1);
    const ev2 = await eventoComponent.criarEvento(ORGANIZADOR, { ...DADOS_EVENTO, nome: 'Outro', capacidade: 1 });
    const a = await convite('A', 'a@a.com');
    const x = await eventoComponent.emitirConvite(ORGANIZADOR, { nome: 'X', email: 'x@x.com' }, ev2.id);
    await ingressoComponent.confirmarPresenca(a.id);
    assert.equal((await ingressoComponent.confirmarPresenca(x.id)).status, 'CONFIRMADO');
  });

  it('transferência ponta a ponta: novo convite aparece no Evento e o substituto confirma', async () => {
    const { ingressoComponent, eventoComponent, notificacao, ev, convite } = await cenario(1);
    const a = await convite('A', 'a@a.com');
    await ingressoComponent.confirmarPresenca(a.id);

    const novo = await ingressoComponent.transferirConvite(a.id, { nome: 'Sub', email: 'sub@mail.com' });

    const lista = await eventoComponent.consultarStatusConvites(ev.id);
    assert.equal(lista.length, 2);
    assert.ok(lista.some((c) => c.id === novo.id && c.conviteOrigemId === a.id));
    assert.equal(notificacao.enviados.at(-1)?.template.tipo, 'CONVITE_TRANSFERIDO');
    assert.equal((await ingressoComponent.consultarIngresso(a.id)).status, 'TRANSFERIDO');
    assert.equal((await ingressoComponent.confirmarPresenca(novo.id)).status, 'CONFIRMADO');
    await esperarViolacao(ingressoComponent.transferirConvite(novo.id, { nome: 'Z', email: 'z@z.com' }), 'TRANSFERENCIA_JA_REALIZADA');
  });

  it('transferir para quem já tem convite: Evento recusa e o titular continua CONFIRMADO', async () => {
    const { ingressoComponent, convite } = await cenario(2);
    const a = await convite('A', 'a@a.com');
    await convite('B', 'b@b.com');
    await ingressoComponent.confirmarPresenca(a.id);
    await esperarViolacao(ingressoComponent.transferirConvite(a.id, { nome: 'B', email: 'b@b.com' }), 'CONVIDADO_JA_CONVIDADO');
    assert.equal((await ingressoComponent.consultarIngresso(a.id)).status, 'CONFIRMADO');
  });

  it('convite cujo e-mail falhou (FALHA) ainda pode ser confirmado pelo link', async () => {
    const { ingressoComponent, notificacao, convite } = await cenario();
    notificacao.falhar = true;
    const c = await convite('A', 'a@a.com');
    assert.equal(c.statusEnvio, 'FALHA');
    notificacao.falhar = false;
    assert.equal((await ingressoComponent.confirmarPresenca(c.id)).status, 'CONFIRMADO');
  });

  it('prazo definido no Evento governa a vigência vista pelo Ingresso', async () => {
    const { ingressoComponent, convite, definirAgora } = await cenario();
    const a = await convite('A', 'a@a.com');
    definirAgora(new Date('2026-12-01T00:00:00Z')); // depois do prazo (30/11), antes do evento (10/12)
    await esperarViolacao(ingressoComponent.confirmarPresenca(a.id), 'CONVITE_EXPIRADO');
  });
});

describe('Arquitetura: acoplamento só por interface', () => {
  const lerFontes = (dir: string) =>
    readdirSync(dir).filter((f) => f.endsWith('.ts')).map((f) => ({ f, src: readFileSync(join(dir, f), 'utf-8') }));

  it('Ingresso não importa nenhuma classe concreta de outro componente', () => {
    for (const { f, src } of lerFontes('src/ingresso')) {
      assert.doesNotMatch(src, /from ['"].*(EventoComponent|mocks\/|Fake)/, `${f} importa classe concreta`);
    }
  });

  it('Evento não importa o componente Ingresso (sem dependência circular)', () => {
    for (const { f, src } of lerFontes('src/evento')) {
      assert.doesNotMatch(src, /from ['"].*ingresso/i, `${f} depende de Ingresso`);
    }
  });
});
