import type { ConviteDTO, EventoDTO } from './dto';

/**
 * Persistência INTERNA do componente Evento (encapsulamento: ninguém de fora enxerga isto).
 * Aqui fica em memória; para usar Supabase basta criar outra classe que implemente estas interfaces.
 */
export interface IEventoRepository {
  salvar(evento: EventoDTO): void;
  buscarPorId(id: string): EventoDTO | undefined;
}

export interface IConviteRepository {
  salvar(convite: ConviteDTO): void;
  buscarPorId(id: string): ConviteDTO | undefined;
  listarPorEvento(eventoId: string): ConviteDTO[];
  buscarPorEmailNoEvento(eventoId: string, email: string): ConviteDTO | undefined;
}

export class EventoRepositoryMemoria implements IEventoRepository {
  private readonly dados = new Map<string, EventoDTO>();
  salvar(evento: EventoDTO) {
    this.dados.set(evento.id, structuredClone(evento));
  }
  buscarPorId(id: string) {
    const e = this.dados.get(id);
    return e ? structuredClone(e) : undefined;
  }
}

export class ConviteRepositoryMemoria implements IConviteRepository {
  private readonly dados = new Map<string, ConviteDTO>();
  salvar(convite: ConviteDTO) {
    this.dados.set(convite.id, structuredClone(convite));
  }
  buscarPorId(id: string) {
    const c = this.dados.get(id);
    return c ? structuredClone(c) : undefined;
  }
  listarPorEvento(eventoId: string) {
    return [...this.dados.values()].filter((c) => c.eventoId === eventoId).map((c) => structuredClone(c));
  }
  buscarPorEmailNoEvento(eventoId: string, email: string) {
    const c = [...this.dados.values()].find((x) => x.eventoId === eventoId && x.convidado.email === email);
    return c ? structuredClone(c) : undefined;
  }
}
