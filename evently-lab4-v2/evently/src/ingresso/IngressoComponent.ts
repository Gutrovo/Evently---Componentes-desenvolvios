import type { ConviteDTO, DadosConvidadoDTO, EventoDTO } from '../evento/dto';
import type { IEvento } from '../evento/IEvento';
import type { IInformacaoEvento } from '../informacaoEvento/IInformacaoEvento';
import type { INotificacao } from '../notificacao/INotificacao';
import { falhaOperacao, preCondicao, regraNegocio } from '../shared/errors';
import { exigirEmail, exigirTexto } from '../shared/validacao';
import type { IngressoDTO, StatusIngresso } from './dto';
import type { IIngresso } from './IIngresso';
import { IngressoRepositoryMemoria, type IIngressoRepository } from './repositorio';

/**
 * Componente Ingresso.
 * Interface fornecida  : IIngresso
 * Interfaces requeridas: IEvento, INotificacao, IInformacaoEvento
 *                        (recebidas por INJEÇÃO DE DEPENDÊNCIA no construtor — nunca há `new EventoComponent()` aqui)
 *
 * Observação sobre concorrência: em cada operação, primeiro fazemos todas as chamadas assíncronas
 * às dependências (buscar convite/evento) e só depois a verificação + gravação, sem `await` no meio.
 * Assim, duas confirmações simultâneas não conseguem ocupar a mesma última vaga.
 * (Com banco real, isso exigiria transação ou constraint equivalente.)
 */
export class IngressoComponent implements IIngresso {
  constructor(
    private readonly evento: IEvento,
    private readonly notificacao: INotificacao,
    private readonly informacao: IInformacaoEvento,
    private readonly ingressos: IIngressoRepository = new IngressoRepositoryMemoria(),
    private readonly relogio: () => Date = () => new Date(),
  ) {}

  // ---------------------------------------------------------------- confirmarPresenca
  async confirmarPresenca(conviteId: string): Promise<IngressoDTO> {
    const convite = await this.carregarConvite(conviteId);
    const evento = await this.evento.consultarEvento(convite.eventoId);

    // --- seção síncrona (verificar + gravar) ---
    this.exigirSemResposta(conviteId); // CONVITE_JA_RESPONDIDO
    this.validarVigenciaConvite(convite); // CONVITE_EXPIRADO
    this.verificarDisponibilidadeVagas(evento); // SEM_VAGAS
    const ingresso = this.gravar(convite, 'CONFIRMADO');
    // -------------------------------------------

    try {
      await this.informacao.liberarTrilhaPreparo(conviteId);
    } catch {
      this.tratarFalhaConfirmacao(conviteId);
      throw falhaOperacao('FALHA_CONFIRMACAO', 'Não foi possível liberar a trilha de preparo; confirmação desfeita.');
    }
    return ingresso;
  }

  // ---------------------------------------------------------------- recusarConvite
  async recusarConvite(conviteId: string): Promise<IngressoDTO> {
    const convite = await this.carregarConvite(conviteId);

    this.exigirSemResposta(conviteId);
    this.validarVigenciaConvite(convite);
    return this.gravar(convite, 'RECUSADO');
  }

  // ---------------------------------------------------------------- registrarDesistencia
  async registrarDesistencia(conviteId: string): Promise<IngressoDTO> {
    const convite = await this.carregarConvite(conviteId);

    this.exigirConfirmado(conviteId);
    return this.gravar(convite, 'DESISTENTE'); // liberarVaga: a vaga volta porque só CONFIRMADO ocupa vaga
  }

  // ---------------------------------------------------------------- transferirConvite
  async transferirConvite(conviteId: string, substituto: DadosConvidadoDTO): Promise<ConviteDTO> {
    const nome = exigirTexto(substituto?.nome, 'substituto.nome');
    const email = exigirEmail(substituto?.email, 'substituto.email');
    const convite = await this.carregarConvite(conviteId);
    const evento = await this.evento.consultarEvento(convite.eventoId);

    // --- seção síncrona: valida e "reserva" o estado TRANSFERIDO antes de qualquer await ---
    this.exigirConfirmado(conviteId);
    this.verificarRegraTransferencia(convite, evento, email);
    this.gravar(convite, 'TRANSFERIDO');
    // ------------------------------------------------------------------------------------

    try {
      const novoConvite = await this.evento.registrarConviteTransferido(conviteId, { nome, email }); // reiniciarCicloConvite
      try {
        await this.notificacao.enviarEmailConvite(email, {
          tipo: 'CONVITE_TRANSFERIDO',
          variaveis: {
            conviteId: novoConvite.id,
            nomeSubstituto: nome,
            nomeTitular: convite.convidado.nome,
            nomeEvento: evento.nome,
            local: evento.local,
            dataInicio: evento.dataInicio,
          },
        });
      } catch {
        throw falhaOperacao('FALHA_NOTIFICACAO_SUBSTITUTO', 'Não foi possível avisar o substituto; transferência desfeita.');
      }
      return novoConvite;
    } catch (erro) {
      this.gravar(convite, 'CONFIRMADO'); // desfaz: o titular continua com o ingresso
      throw erro;
    }
  }

  // ---------------------------------------------------------------- consultarIngresso
  async consultarIngresso(conviteId: string): Promise<IngressoDTO> {
    const convite = await this.carregarConvite(conviteId);
    return (
      this.ingressos.buscar(conviteId) ?? {
        conviteId,
        eventoId: convite.eventoId,
        convidado: convite.convidado,
        status: 'PENDENTE',
        atualizadoEm: convite.emitidoEm,
      }
    );
  }

  // ================================================================ privados (regras do contrato)

  private async carregarConvite(conviteId: string): Promise<ConviteDTO> {
    if (typeof conviteId !== 'string' || conviteId.trim() === '') {
      throw preCondicao('CONVITE_ID_INVALIDO', 'O identificador do convite é obrigatório.');
    }
    return this.evento.consultarConvite(conviteId); // lança CONVITE_INEXISTENTE se não existir
  }

  /** validarVigenciaConvite */
  private validarVigenciaConvite(convite: ConviteDTO): void {
    if (this.relogio() > new Date(convite.expiraEm)) {
      throw regraNegocio('CONVITE_EXPIRADO', 'O prazo para responder a este convite já terminou.');
    }
  }

  /** verificarDisponibilidadeVagas */
  private verificarDisponibilidadeVagas(evento: EventoDTO): void {
    const ocupadas = this.ingressos.contarPorStatus(evento.id, 'CONFIRMADO');
    if (ocupadas >= evento.capacidade) {
      throw regraNegocio('SEM_VAGAS', 'Não há vagas disponíveis neste evento.');
    }
  }

  /** verificarRegraTransferencia */
  private verificarRegraTransferencia(convite: ConviteDTO, evento: EventoDTO, emailSubstituto: string): void {
    if (convite.conviteOrigemId) {
      throw regraNegocio('TRANSFERENCIA_JA_REALIZADA', 'Um ingresso recebido por transferência não pode ser transferido novamente.');
    }
    if (emailSubstituto === convite.convidado.email) {
      throw regraNegocio('SUBSTITUTO_IGUAL_TITULAR', 'O substituto deve ser diferente do titular do ingresso.');
    }
    if (this.relogio() >= new Date(evento.dataInicio)) {
      throw regraNegocio('EVENTO_JA_INICIADO', 'Não é possível transferir o ingresso de um evento que já começou.');
    }
  }

  private exigirSemResposta(conviteId: string): void {
    if (this.ingressos.buscar(conviteId)) {
      throw regraNegocio('CONVITE_JA_RESPONDIDO', 'Este convite já foi respondido.');
    }
  }

  private exigirConfirmado(conviteId: string): void {
    if (this.ingressos.buscar(conviteId)?.status !== 'CONFIRMADO') {
      throw regraNegocio('INGRESSO_NAO_CONFIRMADO', 'Esta operação exige um ingresso com presença confirmada.');
    }
  }

  /** tratarFalhaConfirmacao: desfaz a confirmação para não deixar vaga ocupada sem trilha liberada */
  private tratarFalhaConfirmacao(conviteId: string): void {
    this.ingressos.remover(conviteId);
  }

  private gravar(convite: ConviteDTO, status: StatusIngresso): IngressoDTO {
    const ingresso: IngressoDTO = {
      conviteId: convite.id,
      eventoId: convite.eventoId,
      convidado: convite.convidado,
      status,
      atualizadoEm: this.relogio().toISOString(),
    };
    this.ingressos.salvar(ingresso);
    return ingresso;
  }
}
