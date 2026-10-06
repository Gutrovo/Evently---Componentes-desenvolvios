/**
 * Erros que representam violações de CONTRATO (slide "Contratos de Interfaces").
 *  - PRE_CONDICAO   : quem chamou não garantiu o que o contrato exige (entrada inválida, recurso inexistente).
 *  - REGRA_NEGOCIO  : a entrada é válida, mas uma regra/restrição de negócio impede a operação.
 *  - FALHA_OPERACAO : a operação não pôde garantir a pós-condição (ex.: serviço externo indisponível).
 * O campo `codigo` é estável e é o que os testes verificam.
 */
export type TipoViolacao = 'PRE_CONDICAO' | 'REGRA_NEGOCIO' | 'FALHA_OPERACAO';

export class ContratoError extends Error {
  constructor(
    public readonly tipo: TipoViolacao,
    public readonly codigo: string,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = 'ContratoError';
  }
}

export const preCondicao = (codigo: string, msg: string) => new ContratoError('PRE_CONDICAO', codigo, msg);
export const regraNegocio = (codigo: string, msg: string) => new ContratoError('REGRA_NEGOCIO', codigo, msg);
export const falhaOperacao = (codigo: string, msg: string) => new ContratoError('FALHA_OPERACAO', codigo, msg);
