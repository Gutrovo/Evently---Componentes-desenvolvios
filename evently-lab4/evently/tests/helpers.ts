import { montarSistema, ORGANIZADOR } from '../src/composicao';
import { ContratoError } from '../src/shared/errors';
import assert from 'node:assert/strict';

export const AGORA = new Date('2026-10-05T12:00:00Z');

export const DADOS_EVENTO = {
  nome: 'Evently Summit',
  local: 'FEI',
  dataInicio: '2026-12-10T19:00:00Z',
  prazoConfirmacao: '2026-11-30T23:59:59Z',
  capacidade: 2,
};

/** Sistema real (Evento + Ingresso) com relógio controlável. */
export function novoSistema() {
  let agora = AGORA;
  const sistema = montarSistema(() => agora);
  return { ...sistema, definirAgora: (d: Date) => (agora = d) };
}

/** Verifica que a promise é rejeitada com violação de contrato de determinado código. */
export async function esperarViolacao(promessa: Promise<unknown>, codigo: string) {
  await assert.rejects(promessa, (e: unknown) => {
    assert.ok(e instanceof ContratoError, `esperava ContratoError, veio: ${String(e)}`);
    assert.equal(e.codigo, codigo);
    return true;
  });
}

export { ORGANIZADOR };
