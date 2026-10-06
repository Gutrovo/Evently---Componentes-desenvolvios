import { randomUUID } from 'node:crypto';
import type { CredenciaisDTO, UsuarioDTO, IAutenticacao } from '../autenticacao/IAutenticacao';
import type { INotificacao } from '../notificacao/INotificacao';
import { preCondicao, regraNegocio } from '../shared/errors';
import { exigirDataIso, exigirEmail, exigirTexto } from '../shared/validacao';
import type { ConviteDTO, DadosConvidadoDTO, DadosEventoDTO, EventoDTO } from './dto';
import type { IEvento } from './IEvento';
import {
  ConviteRepositoryMemoria,
  EventoRepositoryMemoria,
  type IConviteRepository,
  type IEventoRepository,
} from './repositorios';

/**
 * Componente Evento.
 * Interface fornecida : IEvento
 * Interfaces requeridas: IAutenticacao, INotificacao   (recebidas por INJEÇÃO DE DEPENDÊNCIA no construtor)
 */
export class EventoComponent implements IEvento {
  constructor(
    private readonly autenticacao: IAutenticacao,
    private readonly notificacao: INotificacao,
    private readonly eventos: IEventoRepository = new EventoRepositoryMemoria(),
    private readonly convites: IConviteRepository = new ConviteRepositoryMemoria(),
    private readonly relogio: () => Date = () => new Date(),
  ) {}

  // ---------------------------------------------------------------- criarEvento
  async criarEvento(credenciais: CredenciaisDTO, dados: DadosEventoDTO): Promise<EventoDTO> {
    const organizador = await this.autenticarOrganizador(credenciais);

    // pré-condições sobre os dados
    const nome = exigirTexto(dados?.nome, 'nome');
    const local = exigirTexto(dados?.local, 'local');
    const inicio = exigirDataIso(dados?.dataInicio, 'dataInicio');
    const prazo = exigirDataIso(dados?.prazoConfirmacao, 'prazoConfirmacao');
    if (!Number.isInteger(dados.capacidade) || dados.capacidade <= 0) {
      throw preCondicao('CAPACIDADE_INVALIDA', 'A capacidade deve ser um inteiro maior que zero.');
    }
    const agora = this.relogio();
    if (inicio <= agora) throw preCondicao('DATA_NO_PASSADO', 'A data de início deve estar no futuro.');
    if (prazo <= agora) throw preCondicao('PRAZO_NO_PASSADO', 'O prazo de confirmação deve estar no futuro.');
    if (prazo > inicio) {
      throw preCondicao('PRAZO_APOS_INICIO', 'O prazo de confirmação não pode ser posterior ao início do evento.');
    }

    const evento: EventoDTO = {
      id: randomUUID(),
      nome,
      local,
      dataInicio: inicio.toISOString(),
      prazoConfirmacao: prazo.toISOString(),
      capacidade: dados.capacidade,
      organizadorId: organizador.id,
      criadoEm: agora.toISOString(),
    };
    this.eventos.salvar(evento); // pós-condição: evento persistido
    return evento;
  }

  // ---------------------------------------------------------------- emitirConvite
  async emitirConvite(
    credenciais: CredenciaisDTO,
    convidado: DadosConvidadoDTO,
    eventoId: string,
  ): Promise<ConviteDTO> {
    const organizador = await this.autenticarOrganizador(credenciais);

    const evento = this.exigirEvento(eventoId);
    const nome = exigirTexto(convidado?.nome, 'convidado.nome');
    const email = exigirEmail(convidado?.email, 'convidado.email');

    if (evento.organizadorId !== organizador.id) {
      throw regraNegocio('EVENTO_DE_OUTRO_ORGANIZADOR', 'Este evento pertence a outro organizador.');
    }
    if (this.convites.buscarPorEmailNoEvento(eventoId, email)) {
      throw regraNegocio('CONVIDADO_JA_CONVIDADO', `${email} já possui convite para este evento.`);
    }

    const convite: ConviteDTO = {
      id: randomUUID(),
      eventoId,
      convidado: { nome, email },
      emitidoEm: this.relogio().toISOString(),
      expiraEm: evento.prazoConfirmacao,
      statusEnvio: 'PENDENTE',
    };
    this.convites.salvar(convite); // persiste ANTES de enviar: o convite nunca se perde

    // dependência (INotificacao) usada apenas pela interface
    try {
      await this.notificacao.enviarEmailConvite(email, {
        tipo: 'CONVITE',
        variaveis: {
          conviteId: convite.id,
          nomeConvidado: nome,
          nomeEvento: evento.nome,
          local: evento.local,
          dataInicio: evento.dataInicio,
          prazoConfirmacao: evento.prazoConfirmacao,
        },
      });
      convite.statusEnvio = 'ENVIADO';
    } catch {
      convite.statusEnvio = 'FALHA'; // tratarFalhaEnvioConvite
    }
    this.convites.salvar(convite);
    return convite;
  }

  // ---------------------------------------------------------------- consultas
  async consultarStatusConvites(eventoId: string): Promise<ConviteDTO[]> {
    this.exigirEvento(eventoId);
    return this.convites.listarPorEvento(eventoId);
  }

  async consultarConvite(conviteId: string): Promise<ConviteDTO> {
    const convite = typeof conviteId === 'string' ? this.convites.buscarPorId(conviteId) : undefined;
    if (!convite) throw preCondicao('CONVITE_INEXISTENTE', 'Convite não encontrado.');
    return convite;
  }

  async consultarEvento(eventoId: string): Promise<EventoDTO> {
    return this.exigirEvento(eventoId);
  }

  // ---------------------------------------------------------------- registrarConviteTransferido
  async registrarConviteTransferido(conviteOrigemId: string, substituto: DadosConvidadoDTO): Promise<ConviteDTO> {
    const origem = await this.consultarConvite(conviteOrigemId);
    const evento = this.exigirEvento(origem.eventoId);
    const nome = exigirTexto(substituto?.nome, 'substituto.nome');
    const email = exigirEmail(substituto?.email, 'substituto.email');

    if (this.convites.buscarPorEmailNoEvento(evento.id, email)) {
      throw regraNegocio('CONVIDADO_JA_CONVIDADO', `${email} já possui convite para este evento.`);
    }

    const convite: ConviteDTO = {
      id: randomUUID(),
      eventoId: evento.id,
      convidado: { nome, email },
      emitidoEm: this.relogio().toISOString(),
      expiraEm: evento.dataInicio, // novo ciclo: vigente até o início do evento
      statusEnvio: 'PENDENTE', // o e-mail é enviado pelo Ingresso
      conviteOrigemId: origem.id,
    };
    this.convites.salvar(convite);
    return convite;
  }

  // ---------------------------------------------------------------- privados
  private async autenticarOrganizador(credenciais: CredenciaisDTO): Promise<UsuarioDTO> {
    let usuario: UsuarioDTO;
    try {
      usuario = await this.autenticacao.autenticarUsuario(credenciais);
    } catch {
      throw preCondicao('NAO_AUTENTICADO', 'Credenciais inválidas.');
    }
    if (usuario.perfil !== 'ORGANIZADOR') {
      throw regraNegocio('PERFIL_NAO_AUTORIZADO', 'Apenas organizadores podem executar esta operação.');
    }
    return usuario;
  }

  private exigirEvento(eventoId: string): EventoDTO {
    const evento = typeof eventoId === 'string' ? this.eventos.buscarPorId(eventoId) : undefined;
    if (!evento) throw preCondicao('EVENTO_INEXISTENTE', 'Evento não encontrado.');
    return evento;
  }
}
