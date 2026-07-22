# Total Maxx ERP

Sistema ERP desenvolvido para digitalizar e automatizar o processo de orçamentos, pedidos e gestão de produtos de moldurarias.

## Sobre o projeto

Este projeto nasceu a partir de um problema real observado durante meu trabalho na Total Maxx, empresa do segmento de molduras e insumos para quadros.

Grande parte das moldurarias ainda realiza seus orçamentos manualmente, utilizando papel, calculadora e planilhas. Cada orçamento exige diversos cálculos envolvendo molduras, paspatur, vidro, foam, impressão, colagem, instalação e outros componentes.

Quando um cliente deseja comparar diferentes opções de molduras, cores ou materiais, todo o cálculo precisa ser refeito manualmente, tornando o atendimento lento e sujeito a erros.

O objetivo deste sistema é transformar esse processo em um fluxo simples, rápido e seguro, permitindo que novos orçamentos sejam gerados em poucos segundos.

---

## Problema

Antes do sistema:

- Orçamentos realizados manualmente.
- Repetição constante dos mesmos cálculos.
- Alto risco de erro humano.
- Atendimento mais demorado.
- Dificuldade para gerenciar produtos e fornecedores.
- Pouco controle sobre margens, perdas e comissões.

---

## Solução

O Total Maxx ERP centraliza todo o processo em uma única plataforma.

Entre as principais funcionalidades estão:

- Cadastro de produtos por categoria.
- Catálogo Global de fornecedores.
- Produtos Globais compartilhados entre empresas.
- Produtos particulares por empresa.
- Configuração independente de margem, perda, comissão e mão de obra.
- Cálculo automático de orçamentos.
- Gestão de clientes.
- Gestão de arquitetos.
- Gestão de fornecedores.
- Gestão de transportadoras.
- Gestão de pedidos.
- Dashboard com indicadores em tempo real.
- Relatórios gerenciais.
- Sistema multiempresa.
- Controle de usuários e permissões.

---

## Destaques técnicos

O sistema foi projetado para permitir que diversas empresas utilizem o mesmo ERP sem interferência entre seus dados.

Algumas decisões de arquitetura incluem:

- Catálogo Global compartilhado.
- Configurações comerciais isoladas por empresa.
- Produtos particulares separados dos produtos globais.
- Controle de permissões por perfil de acesso.
- Dashboard baseado em dados reais.
- Paginação para melhor desempenho.
- Estrutura preparada para crescimento.

---

## Processo de orçamento

O cálculo do orçamento considera automaticamente:

- Perfil (metro linear)
- Paspatur (m²)
- Foam/MDF (m²)
- Vidro (m²)
- Impressão (m²)
- Colagem (m²)
- Produtos diversos
- Instalação e frete

Cada empresa define suas próprias regras comerciais, como:

- Margem
- Perda
- Comissão
- Mão de obra

Isso permite que empresas diferentes utilizem exatamente o mesmo catálogo de produtos, mantendo políticas comerciais independentes.

---

## Tecnologias

- Lovable
- Supabase
- PostgreSQL
- TypeScript
- React
- Tailwind CSS

---

## Objetivos

Além de atender uma necessidade real da empresa, este projeto representa minha evolução prática em:

- Arquitetura de sistemas
- Modelagem de banco de dados
- Desenvolvimento de ERPs
- Experiência do usuário (UX)
- Estruturação de sistemas multiempresa
- Automação de processos
- Solução de problemas de negócio através da tecnologia

---

## Status

Projeto em desenvolvimento ativo.

Novas funcionalidades e melhorias são implementadas continuamente conforme as necessidades do negócio.

---

## Autor

**Luan Marcos Rodrigues Bastos**

Estudante de Defesa Cibernética | Cloud | Segurança da Informação

Este projeto foi idealizado e desenvolvido para resolver um problema operacional real observado no ambiente de trabalho, aplicando conceitos de arquitetura de software, modelagem de dados, automação de processos e experiência do usuário para transformar um fluxo manual em uma solução escalável.
