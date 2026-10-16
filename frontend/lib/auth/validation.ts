const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function validateEmail(email: string): string | null {
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return "Informe um email válido.";
  }
  return null;
}

export function validateName(name: unknown): string | null {
  if (typeof name !== "string" || name.trim().length < 2) {
    return "Informe seu nome.";
  }
  if (name.trim().length > 120) {
    return "Nome longo demais.";
  }
  return null;
}

/** Mesma regra no formulário e na API, para a mensagem não divergir. */
export function validatePassword(password: unknown): string | null {
  if (typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH) {
    return `A senha precisa ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return "Senha longa demais.";
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return "Use letras e números na senha.";
  }
  return null;
}
