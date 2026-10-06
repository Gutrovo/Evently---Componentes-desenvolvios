export interface DadosEventoDTO {
  nome: string;
  local: string;
  /** ISO 8601 */
  dataInicio: string;
  /** Último momento em que um convidado pode responder ao convite (ISO 8601) */
  prazoConfirmacao: string;
  capacidade: number;
}

export interface EventoDTO {
  id: string;
  nome: string;
  local: string;
  dataInicio: string;
  prazoConfirmacao: string;
  capacidade: number;
  organizadorId: string;
  criadoEm: string;
}

export interface DadosConvidadoDTO {
  nome: string;
  email: string;
}

export type StatusEnvio = 'PENDENTE' | 'ENVIADO' | 'FALHA';

export interface ConviteDTO {
  id: string;
  eventoId: string;
  convidado: DadosConvidadoDTO;
  emitidoEm: string;
  /** Fim da vigência do convite (ISO 8601) */
  expiraEm: string;
  statusEnvio: StatusEnvio;
  /** Preenchido quando o convite nasceu de uma transferência de ingresso */
  conviteOrigemId?: string;
}
