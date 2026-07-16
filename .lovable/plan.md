# Refatoração: Catálogo Global de Fornecedores

Nova arquitetura onde produtos padrão vivem **dentro do Fornecedor Global**, não na conta do Admin. Empresas leem esse catálogo via JOIN (sem cópias físicas) e mantêm suas próprias configurações comerciais.

**Decisões confirmadas:**
- Zerar catálogo atual e reimportar manualmente
- Preço-base global, com override opcional por empresa
- Snapshot em orçamentos/pedidos é suficiente (histórico preservado)
- Entrega fatiada em fases

---

## Fase 1 — Fundação (backend + leitura unificada)

**Banco de dados**
- Nova tabela `global_supplier_products`: `id, supplier_id, category, code, description, base_price, width_cm, ncm, active, created_at, updated_at` (UNIQUE em `supplier_id + category + code`)
- Nova tabela `company_product_overrides`: por `owner_user_id + global_product_id` guarda margem, perda, comissão, mão de obra e opcionalmente `base_price_override`
- Manter `company_supplier_config` já existente (config padrão por fornecedor+categoria da empresa)
- Nova coluna `suppliers.publish_catalog` (booleano) — só aparece para fornecedores globais

**RLS**
- `global_supplier_products`: SELECT para todos autenticados; INSERT/UPDATE/DELETE só Admin
- `company_product_overrides`: SELECT/mutação só para o dono (`owner_user_id = owner_user_id(auth.uid())`)

**RPCs de leitura unificada**
- `list_visible_products()`: UNION de (a) produtos particulares da empresa ativa + (b) `global_supplier_products` de fornecedores globais com `publish_catalog=true`, já aplicando override/config-padrão da empresa
- Substitui as leituras diretas de `products` na tela Produtos

**Limpeza destrutiva** (com backup em tabela `_backup_products_pre_global`)
- Apagar `products` com `source_global_product_id IS NOT NULL` (cópias distribuídas)
- Apagar produtos particulares do Admin/Evandro que hoje servem como "fonte" (marcados pelo trigger antigo)
- Remover triggers `distribute_on_new_company`, `replicate_new_global_product` e função `distribute_auto_products`
- Remover flags `auto_distribute`, `distribute_category` de `suppliers` (substituídas por `publish_catalog`)

**Frontend (leitura)**
- `src/routes/produtos.tsx` passa a consumir a nova RPC unificada
- Badge visual "Global" nos itens vindos do catálogo (não editáveis tecnicamente)

---

## Fase 2 — Cadastro e importação do catálogo global

**Cadastro de fornecedor (`src/routes/fornecedores.tsx`)**
- Quando `is_global=true`, exibir seção "Catálogo padrão do fornecedor" com checkbox `publish_catalog`
- Botão final vira "Próximo: importar catálogo" quando `publish_catalog` marcado
- Fluxo em 2 passos: dados → importação (ou "importar depois")

**Novo modo no importador (`ProductImportWizard.tsx`)**
- Prop `mode: "company" | "global-catalog"`
- Modo global: fornecedor e categoria pré-fixados; passo extra "Escolher categoria" filtrado pelas `categories` do fornecedor
- Remove campos margem/perda/comissão/mão de obra do mapeamento e dos defaults
- Grava em `global_supplier_products` (não em `products`)
- Mantém upload/drag-drop/detecção de header/preview/uppercase/conversão mm→cm

**Detalhes do fornecedor global**
- Seção "Catálogos padrão" listando por categoria (qtd, última atualização, ações Atualizar/Visualizar/Remover)
- Confirmação forte na remoção ("afetará todas as empresas")

**Atualização de catálogo existente**
- Diálogo pré-importação: atualizar existentes / criar somente novos / ambos / desativar ausentes
- Deduplicação por `supplier_id + category + code`

---

## Fase 3 — Configurações comerciais por empresa

**Wizard inicial (adaptar `SupplierConfigWizard.tsx`)**
- Trocar fonte de dados: `get_supplier_wizard_state` passa a listar fornecedores globais com `publish_catalog=true` que ainda não têm `company_supplier_config` para a empresa ativa
- Fluxo já existente permanece (margem/perda/comissão + mão de obra em Perfil)

**Personalização por produto**
- Na edição de um produto global: radio "Usar configuração padrão da empresa" vs "Personalizar este produto"
- "Personalizar" cria linha em `company_product_overrides`
- Botão "Voltar a usar configuração padrão" remove o override

**Configuração em massa** (novo botão em Produtos, ao lado de Aumento de preço)
- Wizard 5 passos: categoria → fornecedor → campos → escopo (todos / só padrão / específicos) → prévia
- Aviso obrigatório: "Esta alteração afetará somente a empresa [NOME]"
- RPC `apply_bulk_company_config` grava em `company_supplier_config` e/ou `company_product_overrides`

---

## Fase 4 — Aumento de preço + isolamento final

**Aumento de preço (`PriceIncreaseWizard.tsx`)**
- Se Admin + fornecedor global + catálogo global: altera `global_supplier_products.base_price` com aviso "afetará todas as empresas"
- Se empresa comum + produto global: apenas cria/atualiza `base_price_override` em `company_product_overrides` (novo modo)
- Se produto particular: comportamento atual

**Validações RLS finais**
- Empresa comum não altera `global_supplier_products` (bloqueio duplo UI+RLS)
- Testes: alterar margem/perda/comissão em empresa A não afeta B nem Admin

---

## Detalhes técnicos

**Novas tabelas (resumo SQL)**
```
global_supplier_products (
  id uuid pk, supplier_id uuid fk suppliers,
  category text, code text, description text,
  base_price numeric, width_cm numeric, ncm text,
  active bool default true, unique(supplier_id, category, code)
)

company_product_overrides (
  id uuid pk, owner_user_id uuid, global_product_id uuid fk,
  profit_margin numeric, waste_percentage numeric,
  commission_percentage numeric, labor_cost numeric,
  base_price_override numeric null,
  unique(owner_user_id, global_product_id)
)
```

**Prioridade de cálculo (backend, aplicada na RPC de leitura)**
1. `company_product_overrides` (produto específico)
2. `company_supplier_config` (fornecedor+categoria)
3. Sem config → flag "Configuração pendente" na UI

**Arquivos afetados por fase**

Fase 1: migração SQL + `src/routes/produtos.tsx` + `src/lib/products.functions.ts`

Fase 2: `src/routes/fornecedores.tsx` + `src/components/produtos/ProductImportWizard.tsx` + novo componente `SupplierCatalogsSection.tsx`

Fase 3: `src/components/produtos/SupplierConfigWizard.tsx` + novo `BulkConfigWizard.tsx` + edição de produto em `produtos.tsx`

Fase 4: `src/components/produtos/PriceIncreaseWizard.tsx` + revisão de RLS

---

Se aprovar, começo pela **Fase 1** (migração + RPC unificada + limpeza com backup). Cada fase termina com verificação antes da próxima.