import type { CredenciaisDTO } from '../autenticacao/IAutenticacao';
import type { ConviteDTO, ConviteStatusDTO, DadosConvidadoDTO, DadosEventoDTO, EventoDTO } from './dto';

/**
 * Interface FORNECIDA pelo componente Evento.
 * Consumida por: Ingresso (e, futuramente, Dashboard).
 * Requeridas pelo Evento: IAutenticacao, INotificacao e IIngresso (dependência mútua com Ingresso, como no Lab 3).
 */
export interface IEvento {
  /**
   * Cria e configura um evento.
   * Pré-condição : credenciais de um usuário com perfil ORGANIZADOR; dados válidos
   *                (nome/local preenchidos, capacidade inteira > 0, dataInicio no futuro,
   *                 prazoConfirmacao no futuro e <= dataInicio).
   * Regra        : somente ORGANIZADOR pode criar eventos.
   * Pós-condição : evento persistido, pertencente ao organizador autenticado.
   * Resultado    : EventoDTO com id gerado.
   */
  criarEvento(credenciais: CredenciaisDTO, dados: DadosEventoDTO): Promise<EventoDTO>;

  /**
   * Emite um convite nominal e dispara o e-mail de convite.
   * Pré-condição : organizador autenticado; evento existe; e-mail do convidado válido.
   * Regra        : o evento deve pertencer ao organizador; um e-mail só pode ser convidado uma vez por evento.
   * Pós-condição : convite persistido (vigente até o prazo de confirmação do evento).
   *                Se o envio do e-mail falhar, o convite NÃO é perdido: fica com statusEnvio = FALHA.
   * Resultado    : ConviteDTO.
   */
  emitirConvite(credenciais: CredenciaisDTO, convidado: DadosConvidadoDTO, eventoId: string): Promise<ConviteDTO>;

  /**
   * Lista os convites de um evento com a resposta de cada convidado (acompanhamento pelo organizador).
   * USA a interface requerida IIngresso: o status de cada ingresso é consultado no componente Ingresso.
   * Pré-condição : evento existe.
   * Pós-condição : nenhuma alteração de estado (consulta).
   * Resultado    : lista de ConviteStatusDTO = convite + statusIngresso
   *                (PENDENTE | CONFIRMADO | RECUSADO | DESISTENTE | TRANSFERIDO); vazia se não houver convites.
   */
  consultarStatusConvites(eventoId: string): Promise<ConviteStatusDTO[]>;

  /**
   * [Adicionada em relação ao Lab 3] Consulta um convite específico. Necessária ao Ingresso.
   * Pré-condição : convite existe.
   */
  consultarConvite(conviteId: string): Promise<ConviteDTO>;

  /**
   * [Adicionada em relação ao Lab 3] Consulta os dados de um evento (capacidade, datas). Necessária ao Ingresso.
   * Pré-condição : evento existe.
   */
  consultarEvento(eventoId: string): Promise<EventoDTO>;

  /**
   * [Adicionada em relação ao Lab 3] Registra o convite do substituto numa transferência de ingresso.
   * Chamada pelo Ingresso (a ação parte do convidado, não do organizador, por isso não exige credenciais).
   * Pré-condição : convite de origem existe; dados do substituto válidos.
   * Regra        : substituto não pode já ter convite neste evento.
   * Pós-condição : novo convite persistido, vigente até o início do evento, ligado ao convite de origem.
   *                O e-mail ao substituto é responsabilidade do chamador (Ingresso → INotificacao).
   */
  registrarConviteTransferido(conviteOrigemId: string, substituto: DadosConvidadoDTO): Promise<ConviteDTO>;
}
