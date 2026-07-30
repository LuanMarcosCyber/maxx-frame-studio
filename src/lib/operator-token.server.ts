import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Token assinado que identifica o usuário interno (operator) ativo na sessão.
 * Emitido apenas após validação do PIN e verificado no servidor antes de
 * qualquer operação sensível — o cliente não consegue forjá-lo.
 */

const TTL_MS = 12 * 60 * 60 * 1000; // 12h

function secret(): string {
  const s = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_URL;
  if (!s) throw new Error("Configuração do servidor indisponível.");
  return s;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

export function issueOperatorToken(operatorId: string, ownerId: string): string {
  const payload = `${operatorId}.${ownerId}.${Date.now() + TTL_MS}`;
  return `${payload}.${sign(payload)}`;
}

export function readOperatorToken(
  token: string | null | undefined,
): { operatorId: string; ownerId: string } | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [operatorId, ownerId, expStr, mac] = parts;
  const payload = `${operatorId}.${ownerId}.${expStr}`;
  const expected = Buffer.from(sign(payload), "hex");
  const actual = Buffer.from(mac, "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  if (Number(expStr) < Date.now()) return null;
  return { operatorId, ownerId };
}
