import { EventoComponent } from './evento/EventoComponent';
import type { IIngresso } from './ingresso/IIngresso';
import { IngressoComponent } from './ingresso/IngressoComponent';
import { AutenticacaoFake } from './mocks/AutenticacaoFake';
import { InformacaoEventoFake } from './mocks/InformacaoEventoFake';
import { NotificacaoFake } from './mocks/NotificacaoFake';
import { comRastro } from './shared/rastro';

export const ORGANIZADOR = { email: 'ana@evently.com', senha: '123456' };
export const OUTRO_ORGANIZADOR = { email: 'bruno@evently.com', senha: '123456' };
export const CONVIDADO_USER = { email: 'carla@mail.com', senha: '123456' };

/**
 * PONTO DE COMPOSIÇÃO: é o único lugar que conhece as classes concretas.
 * Aqui as dependências são "ligadas" pelas interfaces (injeção de dependência):
 *   Evento   <- IAutenticacao, INotificacao, IIngresso (o IngressoComponent)
 *   Ingresso <- IEvento (o EventoComponent), INotificacao, IInformacaoEvento
 *
 * Evento e Ingresso dependem um do outro (Lab 3). Por isso o Evento recebe uma função que entrega o Ingresso
 * depois que ele existir (injeção tardia).
 *
 * Se `rastro` for informado, cada chamada ENTRE componentes é registrada (modo de demonstração).
 */
export function montarSistema(relogio: () => Date = () => new Date(), rastro?: (mensagem: string) => void) {
  const observar = <T extends object>(alvo: T, chamador: string, interfaceNome: string): T =>
    rastro ? comRastro(alvo, chamador, interfaceNome, rastro) : alvo;

  const autenticacao = new AutenticacaoFake([
    { id: 'u-ana', nome: 'Ana', ...ORGANIZADOR, perfil: 'ORGANIZADOR' },
    { id: 'u-bruno', nome: 'Bruno', ...OUTRO_ORGANIZADOR, perfil: 'ORGANIZADOR' },
    { id: 'u-carla', nome: 'Carla', ...CONVIDADO_USER, perfil: 'CONVIDADO' },
  ]);
  const notificacao = new NotificacaoFake();
  const informacao = new InformacaoEventoFake();

  let ingressoComponent!: IngressoComponent; // atribuído logo abaixo
  let ingressoParaEvento: IIngresso | undefined;

  const eventoComponent = new EventoComponent(
    observar(autenticacao, 'Evento', 'IAutenticacao'),
    observar(notificacao, 'Evento', 'INotificacao'),
    () => (ingressoParaEvento ??= observar(ingressoComponent, 'Evento', 'IIngresso')),
    undefined,
    undefined,
    relogio,
  );

  ingressoComponent = new IngressoComponent(
    observar(eventoComponent, 'Ingresso', 'IEvento'),
    observar(notificacao, 'Ingresso', 'INotificacao'),
    observar(informacao, 'Ingresso', 'IInformacaoEvento'),
    undefined,
    relogio,
  );

  return { eventoComponent, ingressoComponent, autenticacao, notificacao, informacao };
}
