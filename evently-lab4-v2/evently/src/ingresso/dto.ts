import type { DadosConvidadoDTO } from '../evento/dto';

/**
 * PENDENTE      : convite emitido, ainda sem resposta (estado virtual, não é gravado)
 * CONFIRMADO    : presença confirmada, ocupa uma vaga
 * RECUSADO      : convidado recusou
 * DESISTENTE    : estava confirmado e desistiu (vaga liberada)
 * TRANSFERIDO   : ingresso passado a um substituto (vaga liberada)
 */
export type StatusIngresso = 'PENDENTE' | 'CONFIRMADO' | 'RECUSADO' | 'DESISTENTE' | 'TRANSFERIDO';

export interface IngressoDTO {
  conviteId: string;
  eventoId: string;
  convidado: DadosConvidadoDTO;
  status: StatusIngresso;
  atualizadoEm: string;
}
