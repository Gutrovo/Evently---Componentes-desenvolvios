import { preCondicao } from './errors';

export function exigirTexto(valor: unknown, campo: string): string {
  if (typeof valor !== 'string' || valor.trim() === '') {
    throw preCondicao('CAMPO_OBRIGATORIO', `O campo "${campo}" é obrigatório.`);
  }
  return valor.trim();
}

export function exigirEmail(valor: unknown, campo: string): string {
  const email = exigirTexto(valor, campo).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw preCondicao('EMAIL_INVALIDO', `O campo "${campo}" não é um e-mail válido.`);
  }
  return email;
}

export function exigirDataIso(valor: unknown, campo: string): Date {
  const texto = exigirTexto(valor, campo);
  const data = new Date(texto);
  if (Number.isNaN(data.getTime())) {
    throw preCondicao('DATA_INVALIDA', `O campo "${campo}" não é uma data ISO válida.`);
  }
  return data;
}
