import type { CredenciaisDTO, IAutenticacao, UsuarioDTO } from '../autenticacao/IAutenticacao';

/** Substituto de Autenticacao (componente não implementado no Lab 4). Usuários fixos em memória. */
export class AutenticacaoFake implements IAutenticacao {
  constructor(private readonly usuarios: Array<UsuarioDTO & { senha: string }>) {}

  async autenticarUsuario(credenciais: CredenciaisDTO): Promise<UsuarioDTO> {
    const u = this.usuarios.find((x) => x.email === credenciais?.email && x.senha === credenciais?.senha);
    if (!u) throw new Error('Credenciais inválidas');
    const { senha: _senha, ...usuario } = u;
    return usuario;
  }
}
