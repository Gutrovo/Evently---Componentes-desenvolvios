import type { ConviteDTO, DadosConvidadoDTO } from '../evento/dto';
import type { IngressoDTO } from './dto';

/**
 * Interface FORNECIDA pelo componente Ingresso.
 * Gerencia o ciclo de vida do ingresso: confirmação, recusa, desistência e transferência.
 */
export interface IIngresso {
  /**
   * Pré-condição : conviteId de um convite existente, ainda sem resposta.
   * Regra        : convite dentro da vigência; evento com vaga disponível.
   * Pós-condição : ingresso CONFIRMADO e trilha de preparo liberada (via IInformacaoEvento).
   *                Se a liberação da trilha falhar, a confirmação é desfeita (tudo ou nada).
   * Resultado    : IngressoDTO com status CONFIRMADO.
   */
  confirmarPresenca(conviteId: string): Promise<IngressoDTO>;

  /**
   * Pré-condição : convite existente, ainda sem resposta.
   * Regra        : convite dentro da vigência.
   * Pós-condição : ingresso RECUSADO.
   * Resultado    : IngressoDTO com status RECUSADO.
   */
  recusarConvite(conviteId: string): Promise<IngressoDTO>;

  /**
   * Pré-condição : convite existente.
   * Regra        : o ingresso precisa estar CONFIRMADO.
   * Pós-condição : ingresso DESISTENTE e vaga liberada para outro convidado.
   * Resultado    : IngressoDTO com status DESISTENTE.
   */
  registrarDesistencia(conviteId: string): Promise<IngressoDTO>;

  /**
   * Pré-condição : convite existente; dados do substituto válidos (nome e e-mail).
   * Regra        : ingresso CONFIRMADO; evento ainda não iniciou; ingresso que veio de uma transferência
   *                não pode ser transferido de novo; substituto diferente do titular e sem convite prévio.
   * Pós-condição : ingresso original TRANSFERIDO (vaga liberada); novo convite emitido ao substituto
   *                (novo ciclo, vigente até o início do evento) e e-mail enviado ao substituto.
   *                Se algo falhar, o ingresso original volta a CONFIRMADO.
   * Resultado    : ConviteDTO do substituto.
   */
  transferirConvite(conviteId: string, substituto: DadosConvidadoDTO): Promise<ConviteDTO>;

  /**
   * [Adicionada em relação ao Lab 3] Consulta o estado atual do ingresso de um convite.
   * Necessária para o Dashboard (dados de confirmação, desistência e transferência).
   * Pré-condição : convite existe.
   * Resultado    : IngressoDTO (status PENDENTE se o convidado ainda não respondeu).
   */
  consultarIngresso(conviteId: string): Promise<IngressoDTO>;
}
