export const AUTH_ERROR_CODES = {
  tooManyAttempts: "too_many_attempts",
} as const;

/** Mensagem para o código que o NextAuth devolve em `result.error` ou em `?error=` na URL. */
export function getAuthErrorMessage(code?: string | null): string | null {
  switch (code) {
    case undefined:
    case null:
    case "":
      return null;
    case AUTH_ERROR_CODES.tooManyAttempts:
      return "Muitas tentativas. Aguarde 15 minutos e tente de novo.";
    case "CredentialsSignin":
      return "Email ou senha incorretos.";
    case "OAuthAccountNotLinked":
      return "Este email já tem conta com senha. Entre com email e senha.";
    case "AccessDenied":
      return "Acesso negado para esta conta.";
    case "SessionRequired":
      return "Entre na sua conta para continuar.";
    default:
      return "Não foi possível entrar. Tente de novo.";
  }
}
