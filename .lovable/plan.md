
# Finalizar a estrutura Empresas + Usuários internos com PIN

Escopo grande e destrutivo. Verificações no banco antes de planejar:

- `profiles` com `parent_user_id IS NOT NULL`: **0 registros**. Ou seja, hoje já não existe nenhuma "Conta de acesso" viva — a remoção da estrutura antiga não precisa migrar dados de contas operacionais para usuários internos.
- Tabela `operators` já possui todos os campos exigidos por "usuário interno": `pin_hash`, permissões, `is_global_admin`, `failed_pin_attempts`, `locked_until`, `owner_user_id`.
- Existem 7 empresas raiz. Migrações anteriores já criaram um usuário interno "Proprietário" para cada empresa que não tinha nenhum, e um "Evandro" com `is_global_admin=true` (PIN inicial `123456`).

Com isso, a limpeza fica muito mais barata: em vez de re-arquitetar auth, basta consolidar o modelo já existente e remover a UI/backends de "Conta".

---

## 1. Banco (uma migração)

- Renomear conceitualmente `operators` como usuários internos, sem renomear a tabela (menos risco). Introduzir view `public.internal_users` como alias somente-leitura de `operators` para código novo. Novo código escreve pela função RPC.
- `profiles`: manter a coluna `parent_user_id` por ora (não deletar), mas:
  - Bloquear novas inserções com `parent_user_id NOT NULL` via trigger.
  - Remover `account_type = 'operacional'` da lógica de `owner_user_id()`, `is_collaborator()`, RLS. Toda RLS passa a assumir que `profiles.id` = empresa.
  - `handle_new_user()` continua criando `profiles` para o login da empresa, mas nunca mais para conta operacional.
- Adicionar coluna `profiles.owner_full_name` opcional (para exibir "Nome do proprietário" separado de `full_name` da loja) — ou reutilizar campos existentes: usar `store_name` = nome da loja, `full_name` = nome do proprietário. Isso alinha com a UI atual e evita nova coluna.
- Novas funções `SECURITY DEFINER` (EXECUTE só para `authenticated`):
  - `create_company_with_owner(_login, _password_ignored, _owner_name, _store_name, _pin)` — chamada de servidor; roda dentro da functions com `supabaseAdmin` (a senha e o `auth.users` são criados pelo server function, não no SQL). O SQL só cria `profiles`, primeiro `operators` com PIN + permissões máximas.
  - `create_internal_user(_name, _role_label, _pin, _permissions jsonb, _active)` — company_id implícito da empresa ativa.
  - `update_internal_user(_id, ...)`, `reset_internal_user_pin(_id, _new_pin)`, `set_internal_user_active(_id, _active)`.
  - `validate_internal_user_pin(_id, _pin) → { ok, locked_until }`.
  - `list_internal_users()` — retorna usuários da empresa ativa (Admin Global pode passar `_company_id`).
- Manter tabelas `activity_logs`, `company_switch_audit`, `price_increase_history` como estão.
- Adicionar policies faltantes se alguma referência a `parent_user_id` sumir do escopo.

Nada de `DROP TABLE operators`, nem `DROP COLUMN parent_user_id` nesta etapa — remoção só depois da validação (item 8).

## 2. Server functions (TanStack)

- `src/lib/companies.functions.ts` (novo):
  - `createCompanyWithOwner` — dentro do handler carrega `supabaseAdmin`, valida entradas com Zod, verifica unicidade do username, cria `auth.users` (email `login@totalmaxx.local`, senha), insere `profiles` (id=user.id, store_name, full_name=nome do proprietário, campos comerciais opcionais vazios), chama RPC para inserir `operators` proprietário (todas permissões + PIN hash scrypt), grava `activity_logs`. Rollback: se qualquer passo falhar, deletar user recém-criado.
  - `updateCompanyCommercial(company_id, dadosComerciais)` — grava CNPJ, razão social, endereço etc. Chamado pela etapa 2.
- `src/lib/internal-users.functions.ts` (novo, thin wrapper sobre `operators`):
  - `listInternalUsers`, `createInternalUser`, `updateInternalUser`, `resetInternalUserPin`, `setInternalUserActive`, `validateInternalUserPin`.
  - Reutiliza o hash scrypt já usado por `operators.functions.ts`.
- Manter `operators.functions.ts` funcionando (usado por `SessionUserGate`) mas apontar todos os novos usos ao novo módulo.

## 3. UI — cadastro de empresa em 2 etapas

- Nova rota/tela reaproveitando o modal existente em `src/routes/revendedores.index.tsx`. Substituir o formulário atual por um wizard de 2 etapas dentro do mesmo Dialog. Título "Nova empresa".
- Etapa 1 — Acesso e proprietário:
  - Nome do proprietário (uppercase automático, obrigatório).
  - Nome da loja (uppercase).
  - Usuário de login (regex `[a-z0-9._-]+`, checagem de disponibilidade via server fn com `supabaseAdmin.auth.admin.listUsers` filtrando email `login@totalmaxx.local`).
  - Senha inicial + confirmação (mín. 6).
  - PIN + confirmação (4–6 dígitos numéricos).
  - Botão "Próximo" — apenas valida, não persiste.
- Etapa 2 — Dados comerciais:
  - CNPJ com busca BrasilAPI (já usado em Fornecedores/Transportadoras), IE, e-mail, telefone, WhatsApp, CEP via BrasilAPI/ViaCEP (padrão do sistema), logradouro, número, complemento, bairro, cidade, estado.
  - Botões "Voltar" / "Criar empresa" — dispara `createCompanyWithOwner` + `updateCompanyCommercial` numa única promessa; em erro exibe toast e permite corrigir.

## 4. UI — tela "Usuários"

- Renomear rota de `/operadores` para `/usuarios` (manter `/operadores` como redirect). Título "Usuários".
- Cards de usuário com Nome, Função, badges de permissão, indicador Ativo, botão editar/redefinir PIN/ativar-desativar.
- Novo/Editar usuário: modal simples com Nome, Função (texto livre), PIN + confirmação, checkboxes de permissões, `max_discount_percent`, toggle Ativo. Sem qualquer menção a "Conta".
- Admin Global: filtro de empresa (Select) que troca o `company_id` da listagem via `switch_active_company` temporariamente ou passando `_company_id` para as RPCs.
- O proprietário aparece normalmente. Nenhuma linha oculta.

## 5. Login / seleção de usuário / PIN

- `SessionUserGate` já existe e faz o gate. Ajustes:
  - Se `count(usuários ativos) === 1`, auto-selecionar e não abrir modal.
  - Se `>= 2`, exigir seleção + PIN.
- `AppHeader`: mostrar "Empresa X — Usuário Y" e menu com "Trocar usuário" (limpa `activeOperator`, mantém sessão auth) e "Sair da empresa" (`signOut`).
- Introduzir helper `requirePin(action)` em `useOperator` que abre modal, chama `validate_internal_user_pin`, resolve promise. Reutilizado para ações sensíveis:
  - Criar/editar usuário, alterar permissões, redefinir PIN.
  - Restaurar catálogo, alteração em massa.
  - Excluir produtos, excluir/cancelar pedidos, alterar estoque manualmente.
  - Acessar Configurações.

## 6. Textos, sidebar, atalhos

- Rodar varredura por "Conta"/"Conta operacional"/"Conta vinculada"/"Loja sem vínculo"/"Operador" em todos os `.tsx` sob `src/` e trocar por "Usuário" ou "Empresa" conforme contexto.
- `AppSidebar`: já sem "Contas". Trocar "Usuários" → apontar para `/usuarios`.
- Remover a rota `/colaboradores` do menu e adicionar redirect para `/usuarios`.

## 7. RLS

- Como não existem contas operacionais e vamos bloquear a criação de novas, simplificar `is_collaborator` para `RETURNS false` (sem drop) e `owner_user_id` para deixar de considerar `parent_user_id`. Nenhuma policy precisa mudar porque `owner_user_id()` continua sendo o ponto único de escopo.
- Verificar policies em `operators`, `products`, `clients`, `budgets`, `orders`, `architects`, `carriers`, `suppliers`, `stock_movements`, `activity_logs`. Ajustar apenas se referenciarem `parent_user_id`.

## 8. Remoção final (não nesta migração)

Antes do drop:
- Rodar `SELECT count(*) FROM profiles WHERE parent_user_id IS NOT NULL` — deve permanecer 0.
- Rodar `SELECT count(*) FROM operators WHERE operational_account_id IS NOT NULL` — se >0, migrar para NULL após auditoria.

Somente numa migração posterior:
- `DROP COLUMN operators.operational_account_id`, `DROP COLUMN profiles.parent_user_id`, `DROP COLUMN profiles.account_type`, `DROP TYPE account_type`.
- Remover `colaboradores.functions.ts`, `colaboradores.tsx`, `is_collaborator()`.

Isto fica marcado como TODO no plano; não executamos nesta iteração para preservar reversibilidade.

## 9. Validação Playwright

Rodar os 5 cenários listados via Playwright em `http://localhost:8080` com screenshots:

1. Admin cria nova empresa (2 etapas) → proprietário aparece em `/usuarios`, login funciona.
2. Empresa 1 usuário → login direto, nome no topo, PIN só em ação sensível.
3. Proprietário cria 2º usuário (PIN exigido) → próximo login mostra "Quem está usando?".
4. Evandro Admin Global → usuário auto-selecionado, tela Empresas + logs.
5. Confirmar produtos/pedidos/orçamentos anteriores acessíveis.

Se qualquer cenário falhar, corrigir antes de encerrar.

## Detalhes técnicos

- Hash de PIN: manter `scrypt:<salt>:<hash>` já usado em `operators.functions.ts`.
- `create_company_with_owner` executa dentro de `createServerFn` com `supabaseAdmin` (não numa RPC SQL) porque `auth.users` só pode ser criado via Admin API.
- Rollback do create: `try { create user; try { insert profile; try { insert operator } catch { deleteUser } } catch { deleteUser } }`.
- Uniqueness do login: `profiles.username_key` já existe; usar como check secundário além do email.
- Migração SQL: só `CREATE OR REPLACE FUNCTION` + trigger de bloqueio, sem DROPs.

## Fora de escopo desta iteração

- Renomear fisicamente `operators` → `internal_users` (apenas view alias).
- Deletar `parent_user_id`, `account_type`, `colaboradores.*` (marcar como TODO na etapa 8).
- Alterar auth email domain.

## Confirmação necessária

Isso é uma reforma grande em cadastro/login/RLS. Confirma prosseguir? Em particular:

1. Reutilizar `profiles.full_name` = "Nome do proprietário" e `store_name` = "Nome da loja" (sem nova coluna)?
2. Manter `parent_user_id`/`account_type`/`operators.operational_account_id` no banco por ora (drop na próxima etapa após validação)?
