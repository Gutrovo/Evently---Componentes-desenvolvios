import { EventoComponent } from './evento/EventoComponent';
import { IngressoComponent } from './ingresso/IngressoComponent';
import { AutenticacaoFake } from './mocks/AutenticacaoFake';
import { InformacaoEventoFake } from './mocks/InformacaoEventoFake';
import { NotificacaoFake } from './mocks/NotificacaoFake';

export const ORGANIZADOR = { email: 'ana@evently.com', senha: '123456' };
export const OUTRO_ORGANIZADOR = { email: 'bruno@evently.com', senha: '123456' };
export const CONVIDADO_USER = { email: 'carla@mail.com', senha: '123456' };

/**
 * PONTO DE COMPOSIÇÃO: é o único lugar que conhece as classes concretas.
 * Aqui as dependências são "ligadas" pelas interfaces (injeção de dependência):
 *   Evento  <- IAutenticacao, INotificacao
 *   Ingresso <- IEvento (o EventoComponent), INotificacao, IInformacaoEvento
 */
export function montarSistema(relogio: () => Date = () => new Date()) {
  const autenticacao = new AutenticacaoFake([
    { id: 'u-ana', nome: 'Ana', ...ORGANIZADOR, perfil: 'ORGANIZADOR' },
    { id: 'u-bruno', nome: 'Bruno', ...OUTRO_ORGANIZADOR, perfil: 'ORGANIZADOR' },
    { id: 'u-carla', nome: 'Carla', ...CONVIDADO_USER, perfil: 'CONVIDADO' },
  ]);
  const notificacao = new NotificacaoFake();
  const informacao = new InformacaoEventoFake();

  const eventoComponent = new EventoComponent(autenticacao, notificacao, undefined, undefined, relogio);
  const ingressoComponent = new IngressoComponent(eventoComponent, notificacao, informacao, undefined, relogio);

  return { eventoComponent, ingressoComponent, autenticacao, notificacao, informacao };
}
