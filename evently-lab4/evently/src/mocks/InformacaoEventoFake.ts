import type { IInformacaoEvento } from '../informacaoEvento/IInformacaoEvento';

/** Substituto de InformacaoEvento: registra as trilhas liberadas e pode simular falha. */
export class InformacaoEventoFake implements IInformacaoEvento {
  readonly trilhasLiberadas: string[] = [];
  falhar = false;

  async liberarTrilhaPreparo(conviteId: string): Promise<void> {
    if (this.falhar) throw new Error('Serviço de trilha indisponível');
    this.trilhasLiberadas.push(conviteId);
  }
}
