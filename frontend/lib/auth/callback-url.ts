/** Aceita só caminhos do próprio site: evita redirecionar para outro domínio depois do login. */
export function sanitizeCallbackUrl(rawValue: string | null | undefined, fallback = "/") {
  const value = typeof rawValue === "string" ? rawValue.trim() : "";

  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return fallback;
  }

  try {
    const parsed = new URL(value, "http://localhost");
    if (parsed.origin !== "http://localhost") {
      return fallback;
    }
    const normalized = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    return normalized.startsWith("/") && !normalized.startsWith("//") ? normalized : fallback;
  } catch {
    return fallback;
  }
}
