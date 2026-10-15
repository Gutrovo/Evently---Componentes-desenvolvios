/**
 * Interface FORNECIDA pelo componente InformacaoEvento (não implementado neste lab).
 * REQUERIDA por Ingresso: ao confirmar presença, a trilha de preparo do convidado é liberada.
 *
 * Contrato: liberarTrilhaPreparo
 *  - Pré-condição : conviteId de um ingresso confirmado
 *  - Pós-condição : trilha de preparo do convidado disponível
 *  - Falha        : lança erro se não for possível liberar
 */
export interface IInformacaoEvento {
  liberarTrilhaPreparo(conviteId: string): Promise<void>;
}
