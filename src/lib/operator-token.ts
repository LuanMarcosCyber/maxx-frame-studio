import { createMiddleware } from "@tanstack/react-start";

/**
 * Token do usuário interno ativo (emitido pelo servidor após o PIN).
 * Guardado na sessão do navegador e enviado em toda chamada de server function
 * para que o backend possa validar permissões.
 */
export const OPERATOR_TOKEN_HEADER = "x-operator-token";
const TOKEN_KEY = "tm.operatorToken";

export function setOperatorToken(token: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export function getOperatorToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export const attachOperatorToken = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const token = getOperatorToken();
    return next({ headers: token ? { [OPERATOR_TOKEN_HEADER]: token } : {} });
  },
);
