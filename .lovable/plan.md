
# Nova estrutura de acesso: Empresas + Usuários internos com PIN

Esta etapa entrega toda a nova experiência (UI, fluxos, permissões, migração de dados). A estrutura antiga de "Contas" permanece no backend por compatibilidade, mas some da interface e não é mais usada por nenhum fluxo novo. A remoção definitiva das tabelas antigas fica para uma etapa futura.

## Modelo mental

```text
Administrador Global (flag no usuário interno)
 └── Empresa (login principal Supabase = usuário atual da empresa)
      └── Usuários internos (PIN + permissões individuais)
           ├── Proprietário (criado junto com a empresa, todas as permissões da empresa)
           └── Demais usuários (permissões definidas caso a caso)
```

O login principal identifica só a empresa. As permissões efetivas vêm do usuário interno ativo, nunca do login.

## Regras de login e PIN (conforme suas respostas)

- 1 usuário interno ativo na empresa: entra direto após o login, sem tela "Quem está usando?" e sem PIN no login. Nome aparece no topo.
- 2+ usuários internos ativos: após o login, o sistema bloqueia e obriga escolher usuário + PIN.
- Ações sensíveis (mesmo com 1 usuário) exigem PIN: criar/editar usuário, alterar permissões, redefinir PIN, restaurar catálogo, alteração em massa, excluir produtos, excluir pedidos, e outras operações críticas equivalentes.
- Menu de sessão passa a ter "Trocar usuário" (mantém login da empresa, volta para a seleção) e "Sair da empresa" (logout completo).
- PIN: 4 a 6 dígitos numéricos, hash seguro, bloqueio temporário após várias tentativas erradas, redefinível pelo proprietário/Admin Global. PIN inicial do Evandro na migração: `123456` (alterável na tela Usuários como qualquer outro).

## Migração de dados (sem apagar nada antigo)

Para cada empresa (perfis com `parent_user_id IS NULL`):
- O login Supabase atual continua sendo o login principal da empresa (nenhuma nova credencial).
- Cada `operator` ativo vira um usuário interno da empresa, preservando nome, PIN (hash existente) e permissões.
- Se a empresa não tiver nenhum usuário interno, cria-se automaticamente um usuário "Proprietário" com o nome do perfil da empresa e PIN inicial `123456`, marcado com todas as permissões administrativas da empresa.
- Empresa do Evandro: garante um usuário interno "Evandro" com PIN `123456` e flag `is_global_admin = true`.
- Nenhum pedido, orçamento, produto, cliente, estoque ou histórico é tocado.

Contas operacionais existentes (`profiles.parent_user_id IS NOT NULL`) continuam funcionando no backend, mas somem da UI e não podem mais ser criadas.

## Mudanças de UI (remover "Contas" da experiência)

- Sidebar / Dashboard / atalhos / cadastros: aba "Contas" removida. Substituída por "Usuários" (usuários internos da empresa ativa).
- Menu Admin Global do Evandro: "Empresas", "Usuários" (da empresa dele) e demais funções administrativas. Sem "Contas".
- Textos, filtros, toasts, mensagens: revisados para nunca mais mencionar "Conta", "Conta operacional", "Conta vinculada", "Usuário/Conta", "Loja sem vínculo".
- Cabeçalho: mostra "Empresa: X — Usuário: Y". Menu de sessão com "Trocar usuário" e "Sair da empresa".
- Cadastro de empresa (Admin Global): formulário único com blocos Dados da empresa / Acesso principal (login + senha) / Usuário proprietário (nome + PIN + confirmação). Ao salvar, cria empresa + login + usuário proprietário em uma transação.
- Tela "Usuários" (dentro da empresa): lista todos os usuários internos ativos, inclusive o proprietário (não é oculto). Ações: criar, editar, definir permissões, redefinir PIN, ativar/desativar. Cada ação sensível exige PIN.
- Tela "Quem está usando?" com nome, função e iniciais/foto de cada usuário ativo, seguida de tela de PIN. Só aparece quando há 2+ usuários.

## Permissões e isolamento

- Permissões efetivas vêm do usuário interno ativo (armazenadas no registro dele). O login principal por si só não libera nada além do mínimo.
- Flag `is_global_admin` no usuário interno concede visão global (Empresas, logs de todas as empresas, catálogo global).
- Todo usuário interno é obrigatoriamente vinculado a uma empresa. Sem exceção, exceto o Admin Global que pode "entrar" em outras empresas para administração.
- RLS existente já é por `owner_user_id`; nenhuma mudança de escopo comercial. Adiciona-se apenas a validação de PIN e o gate de "usuário ativo" para ações sensíveis.

## Logs

- Toda ação relevante grava: empresa, usuário interno, função, ação, entidade, dados relevantes, timestamp.
- Admin Global vê logs de todas as empresas. Usuários comuns só se tiverem permissão.
- Exemplos gravados: criação de usuário, criação de orçamento, alteração de margem, criação de empresa.

## Detalhes técnicos

Backend (uma migração):
- Nova tabela `internal_users` (id, company_id → profiles.id, full_name, role_label, pin_hash, is_active, is_global_admin, permissões booleanas + max_discount_percent, failed_pin_attempts, locked_until, created_at, updated_at). GRANT + RLS scoped por empresa; leitura só pela própria empresa ou Admin Global.
- Nova tabela `activity_logs` (id, company_id, internal_user_id, action, entity, entity_id, metadata jsonb, created_at). GRANT + RLS.
- Funções `SECURITY DEFINER`: `create_company_with_owner`, `create_internal_user`, `update_internal_user`, `reset_internal_user_pin`, `validate_internal_user_pin` (com contagem/bloqueio), `list_internal_users`, `has_internal_permission`. EXECUTE apenas para `authenticated`.
- Migração de dados: copia `operators` ativos para `internal_users`; cria "Proprietário" onde faltar; cria "Evandro" com `is_global_admin` e PIN `123456`. Tabela `operators` intocada.

Frontend:
- Novo contexto `InternalUserProvider` (substitui/estende `OperatorProvider`) com estado do usuário interno ativo em `sessionStorage`, permissões efetivas e helper `requirePin(action)` que abre modal de PIN e reautentica quando necessário.
- Nova rota/gate `/selecionar-usuario` chamada pelo `_authenticated` layout: se `count(users) >= 2` e não houver ativo, redireciona para lá; se `count == 1`, ativa automaticamente.
- Refactor de `login.tsx`: nada muda no passo 1 (login da empresa); no pós-login, roteia conforme regra acima.
- Refactor de `AppHeader` / `AppSidebar`: exibe empresa + usuário, "Trocar usuário", "Sair da empresa". Sidebar sem "Contas".
- Refactor da rota `operadores.tsx` para `usuarios.tsx` (rota nova, `/usuarios`) consumindo `internal_users`. Rota antiga `operadores.tsx` fica como redirect temporário para `/usuarios`.
- Refactor de `admin-users.functions.ts` e telas do Admin Global (`revendedores.*` → renomeadas para `empresas.*`) para o novo formulário unificado (dados + acesso + proprietário).
- Nas ações sensíveis (restaurar catálogo, alteração em massa, exclusões, gerência de usuários), envolver o handler com `requirePin("acao")` antes de disparar.
- Varredura de textos para eliminar qualquer menção a "Conta"/"Operador" na UI.

Nada é feito com:
- Pedidos, orçamentos, produtos, clientes, estoque, históricos, RLS comercial, catálogo global.
- Estrutura antiga de `profiles.parent_user_id` / `operators` no banco (permanece).

## Validação

Rodo os 5 cenários da sua descrição via Playwright após implementar (Admin Global, nova empresa, proprietária, funcionária com permissões limitadas, troca de usuário) e confirmo com screenshots que a tela "Quem está usando?" aparece apenas com 2+ usuários e que o PIN é pedido nas ações sensíveis.
