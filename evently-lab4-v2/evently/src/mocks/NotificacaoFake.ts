import type { INotificacao, TemplateEmailDTO } from '../notificacao/INotificacao';

/** Substituto de Notificacao: registra os e-mails "enviados" e pode simular falha. */
export class NotificacaoFake implements INotificacao {
  readonly enviados: Array<{ destinatario: string; template: TemplateEmailDTO }> = [];
  falhar = false;

  async enviarEmailConvite(destinatario: string, template: TemplateEmailDTO): Promise<void> {
    if (this.falhar) throw new Error('Provedor de e-mail indisponível');
    this.enviados.push({ destinatario, template });
  }
}
