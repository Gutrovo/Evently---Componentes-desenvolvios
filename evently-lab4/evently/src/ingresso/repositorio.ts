import type { IngressoDTO, StatusIngresso } from './dto';

/** Persistência INTERNA do componente Ingresso. Em memória aqui; trocável por Supabase. */
export interface IIngressoRepository {
  buscar(conviteId: string): IngressoDTO | undefined;
  salvar(ingresso: IngressoDTO): void;
  remover(conviteId: string): void;
  contarPorStatus(eventoId: string, status: StatusIngresso): number;
}

export class IngressoRepositoryMemoria implements IIngressoRepository {
  private readonly dados = new Map<string, IngressoDTO>();
  buscar(conviteId: string) {
    const i = this.dados.get(conviteId);
    return i ? structuredClone(i) : undefined;
  }
  salvar(ingresso: IngressoDTO) {
    this.dados.set(ingresso.conviteId, structuredClone(ingresso));
  }
  remover(conviteId: string) {
    this.dados.delete(conviteId);
  }
  contarPorStatus(eventoId: string, status: StatusIngresso) {
    return [...this.dados.values()].filter((i) => i.eventoId === eventoId && i.status === status).length;
  }
}
