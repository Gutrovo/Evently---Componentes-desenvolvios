export type TipoEmail = 'CONVITE' | 'CONVITE_TRANSFERIDO';

export interface TemplateEmailDTO {
  tipo: TipoEmail;
  variaveis: Record<string, string>;
}

/**
 * Interface FORNECIDA pelo componente Notificacao (não implementado neste lab).
 * REQUERIDA por Evento e por Ingresso. Na implementação real, adaptador sobre Resend + React Email.
 *
 * Contrato: enviarEmailConvite
 *  - Pré-condição : destinatário com e-mail válido
 *  - Pós-condição : e-mail entregue ao provedor de envio
 *  - Falha        : lança erro se o provedor estiver indisponível
 */
export interface INotificacao {
  enviarEmailConvite(destinatario: string, template: TemplateEmailDTO): Promise<void>;
}
