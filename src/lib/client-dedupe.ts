// Chave de duplicidade de clientes.
// Regra: só é duplicado quando TODOS os campos principais são idênticos.
// CPF/CNPJ repetido, sozinho, é permitido.

const norm = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");

const digits = (s: unknown) => String(s ?? "").replace(/\D+/g, "");

export type ClientDedupeInput = {
  name?: string | null;
  document?: string | null;
  commercial_phone?: string | null;
  mobile_phone?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  address?: string | null;
  address_number?: string | null;
  cep?: string | null;
  city?: string | null;
  state?: string | null;
};

export function clientDedupeKey(c: ClientDedupeInput): string {
  return [
    norm(c.name),
    digits(c.document),
    digits(c.commercial_phone ?? c.phone),
    digits(c.mobile_phone ?? c.whatsapp),
    norm(c.email),
    norm(c.address),
    norm(c.address_number),
    digits(c.cep),
    norm(c.city),
    norm(c.state),
  ].join("|");
}
