
## Objetivo

Separar claramente **contas de acesso** (fazem login) de **operadores** (identificam quem está usando o sistema). Hoje o mesmo registro é usado para as duas coisas — a conta "Banana Decor Colaboradores" aparece no seletor de operador, o que está errado.

Após a refatoração:
- **Login** identifica a loja e a conta de acesso.
- **Operador** identifica a pessoa física usando o sistema (Márcia, Tânia, Thiago).

Nada é apagado. Logins existentes continuam funcionando.

---

## 1. Modelo de dados

### Nova tabela `operators`

| campo | tipo | uso |
|---|---|---|
| id | uuid | PK |
| owner_user_id | uuid | loja/revendedor (dono raiz) |
| operational_account_id | uuid nullable | conta operacional a que pertence (nullable = operador da loja toda) |
| name | text | nome (Márcia) |
| nickname | text nullable | apelido curto |
| pin_hash | text | PIN obrigatório (mantido) |
| active | boolean | |
| created_at / updated_at | | |

Índices por `owner_user_id` e `operational_account_id`.

### `profiles` — adicionar
- `account_type` enum: `admin | revendedor | operacional` (derivado de role + parent_user_id; default por trigger).
- Marcar as contas com `parent_user_id IS NOT NULL` como `operacional` na migração.

### `budgets` / `orders` — adicionar
- `operator_id uuid nullable`
- `operator_name text nullable`
- `account_user_id uuid nullable` (a conta de acesso que salvou — hoje `created_by` já cobre; manter e apenas preencher `operator_*`)

Registros antigos ficam com `operator_id NULL` e a visualização segue mostrando o nome da conta de acesso (`created_by`) como hoje.

### Migração dos dados existentes
- Cada `profile` colaborador atual (`parent_user_id IS NOT NULL`) vira **conta operacional legada** — apenas marca `account_type='operacional'`. Login continua funcionando.
- **Não** cria operador com o mesmo nome automaticamente.
- Tabela antiga `active_operators` (sessão): passa a referenciar `operators.id` em vez de `profiles.id`.

---

## 2. RLS

- `operators`:
  - SELECT: authenticated, se `owner_user_id = owner_user_id(auth.uid())` **E** (a conta logada é dono/admin **OU** `operational_account_id = auth.uid()`).
  - INSERT/UPDATE/DELETE:
    - Admin e revendedor: livre dentro da própria loja.
    - Conta operacional: só operadores com `operational_account_id = auth.uid()`.
- Contas operacionais **não** podem criar outras contas operacionais (bloqueado no server function de criação de colaborador — checa `has_role('revendedor')` ou admin).

---

## 3. Tela de Colaboradores (refatorada)

Duas seções na mesma página:

**a) Contas Operacionais** (visível para Admin/Revendedor)
- Lista contas de acesso operacionais da loja.
- Botão "Nova conta operacional" → cria login (mesmo fluxo atual, mas com `account_type='operacional'`).

**b) Operadores**
- Admin/Revendedor: vê todos da loja, agrupados por conta operacional (+ "Sem vínculo").
- Conta operacional logada: vê apenas operadores da própria conta; pode criar/editar/desativar; **não** vê nem edita contas operacionais.
- Cadastro: nome, apelido, PIN, conta operacional (dropdown, opcional para dono).

---

## 4. Seletor de Operador (`OperatorSwitcher`)

- Passa a ler da tabela `operators`, não de `profiles`.
- Filtro: `active=true` **E** `owner_user_id = owner da conta logada` **E**, se conta logada for operacional, `operational_account_id = auth.uid()`.
- Nunca lista contas de acesso.
- Badge "Em uso" e clique desabilitado no ativo (já implementado, mantido).

---

## 5. Orçamentos / Pedidos

- Ao salvar: grava `operator_id` + `operator_name` (snapshot) além do `created_by` atual.
- Visualização de orçamento e pedido: nova linha "Operador: {nome}" quando `operator_id` existe; fallback para "Criado por: {conta de acesso}" nos antigos.
- Impressão: **não alterada agora** (fora do escopo, conforme regra do usuário nas transportadoras — mantemos o mesmo princípio salvo pedido explícito).
- PIN ao salvar: mantido como hoje.

---

## 6. Permissões (resumo)

| Ação | Admin | Revendedor | Op. |
|---|---|---|---|
| Ver todas as lojas | ✅ | — | — |
| Criar conta operacional | ✅ | ✅ | ❌ |
| Criar operador na loja | ✅ | ✅ | só na própria conta |
| Selecionar operador | ✅ | ✅ | ✅ (só os da conta) |
| Fazer login | ✅ | ✅ | ✅ |
| Aparecer no seletor de operador | ❌ | ❌ | ❌ |

---

## Detalhes técnicos

**Migrações SQL (1 migration):**
1. Criar enum `account_type` e coluna em `profiles` (default por trigger a partir de `role`/`parent_user_id`).
2. Criar tabela `operators` + GRANTs + RLS + trigger `updated_at`.
3. `ALTER TABLE budgets ADD COLUMN operator_id uuid, operator_name text;` idem `orders`.
4. Backfill: `UPDATE profiles SET account_type='operacional' WHERE parent_user_id IS NOT NULL;` etc.
5. Ajustar `active_operators`: adicionar `operator_id uuid` (nullable durante transição), manter coluna antiga para não quebrar sessões vigentes.

**Código:**
- Novo `src/lib/operators.functions.ts` (list/create/update/delete/validate PIN).
- `OperatorSwitcher.tsx`: trocar query para `operators`.
- `useOperator.tsx`: passa a guardar `{ operatorId, operatorName }`.
- `colaboradores.tsx`: split em duas abas (Contas Operacionais / Operadores) com visibilidade por role.
- `orcamentos.novo.tsx`: no save, incluir `operator_id`, `operator_name`.
- `orcamentos.index.tsx` e visualização de pedido: exibir operador.
- Nenhuma alteração em impressão, frete ou cálculo.

**Compatibilidade:**
- Logins atuais intactos.
- Registros antigos sem `operator_id` seguem exibindo `created_by` (comportamento atual).
- Fluxo de PIN preservado.
