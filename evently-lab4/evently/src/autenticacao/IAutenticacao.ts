export type Perfil = 'ORGANIZADOR' | 'CONVIDADO' | 'OPERADOR';

export interface CredenciaisDTO {
  email: string;
  senha: string;
}

export interface UsuarioDTO {
  id: string;
  nome: string;
  email: string;
  perfil: Perfil;
}

/**
 * Interface FORNECIDA pelo componente Autenticacao (não implementado neste lab).
 * REQUERIDA por Evento. Na implementação real, seria um adaptador sobre o Supabase Auth.
 *
 * Contrato: autenticarUsuario
 *  - Pré-condição : credenciais informadas
 *  - Resultado    : UsuarioDTO com id e perfil
 *  - Falha        : lança erro se as credenciais forem inválidas
 */
export interface IAutenticacao {
  autenticarUsuario(credenciais: CredenciaisDTO): Promise<UsuarioDTO>;
}
