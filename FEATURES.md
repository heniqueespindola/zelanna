# Zelanna — Mapa de Features e Prompts do Cowork

> Referência completa das features por fase de roadmap, com os prompts exactos a usar no Claude Code.
>
> Workflow de cada feature:
> `/new-feature` → `/research` → PRD.md → `/clear` → `/plan` → Spec.md → `/clear` → `/implement` → `/commit`
>
> ⚠️ Antes de qualquer feature de Phase 1+: confirmar que a Phase 0 (validação manual) deu sinal positivo — ver `CLAUDE.md`.

---

## PHASE 0 — Manual Validation (sem código)

Não há features de produto nesta fase. O trabalho é manual: recrutar 10–15 pessoas, pedir 5–10 documentos cada, cruzar manualmente, gerar insights à mão, medir reação e willingness-to-pay. Ver `CLAUDE.md` → `## ⚠️ Metodologia`.

---

## PHASE 1 — MVP Insurance + Bills

### F01 — Autenticação
**O quê:** Ecrãs de login e registo com Supabase Auth. Email + password. Redireccionamento automático após login. Protecção de rotas.

**Prompt:**
```
/new-feature Autenticação — ecrãs de login e registo com Supabase Auth (email + password),
redireccionamento automático para o dashboard após login, e protecção de rotas para
utilizadores não autenticados. Usar a paleta Zelanna: fundo #131E15 (verde-carvão),
botões #324138 (verde-floresta primário), accent #C9A15C (dourado) para links e destaques,
texto branco sobre fundos escuros. Fontes: Avenir para títulos, Lato para corpo.
```

---

### F02 — Onboarding
**O quê:** 3 ecrãs na primeira abertura. Passo 1: boas-vindas + objetivo principal (proteção / despesas / estate). Passo 2: primeiro upload de documento (fatura, seguro ou garantia). Passo 3: primeiro insight gerado a partir desse documento — o "Aha Moment".

**Prompt:**
```
/new-feature Onboarding — fluxo de 3 ecrãs exibido apenas na primeira abertura.
Passo 1: boas-vindas e selecção do objetivo principal (proteger ativos / controlar despesas /
preparar digital estate — multi-select). Passo 2: upload do primeiro documento (fatura, seguro
ou garantia) com preview da extração em tempo real. Passo 3: mostrar o primeiro insight gerado
a partir desse documento (ex: data de expiração da garantia, ou alerta de renovação) — este é
o momento "Aha Moment" que a Phase 0 valida. Navegação com indicador de progresso (1/3, 2/3, 3/3).
Usar dourado Zelanna (#C9A15C) como cor de destaque no insight final. Fundo #DBE0DF (névoa)
para os ecrãs de onboarding.
```

---

### F03 — Upload de documentos + extração AI
**O quê:** Ecrã central de upload (PDF ou fotografia). Vision LLM extrai dados estruturados (fornecedor, tipo, data, valor). Utilizador confirma/corrige antes de guardar.

**Prompt:**
```
/new-feature Upload de documentos — ecrã de carregamento de documentos via drag-and-drop,
selecção de ficheiro ou fotografia (mobile web). Funcionalidades: (1) upload para Supabase
Storage, (2) chamada a Edge Function com Vision LLM que extrai document_type, provider, date,
amount e campos relevantes, (3) ecrã de preview/confirmação onde o utilizador revê e corrige
os campos extraídos antes de guardar, (4) classificação automática do tipo de documento
(invoice, warranty, insurance, contract, receipt), (5) indicador de progresso durante a
extração. Guardar em documents (Supabase) com extracted_data em jsonb. Nunca expor a chave
da Vision LLM no cliente — chamada sempre via Edge Function.
```

---

### F04 — Coverage Check
**O quê:** O utilizador liga uma fatura + garantia + seguro a um asset e pergunta "estou coberto?". Regras determinísticas verificam datas e devolvem estado.

**Prompt:**
```
/new-feature Coverage Check — ecrã onde o utilizador selecciona um asset (ou cria um a partir
de um documento) e vê o estado de cobertura. Funcionalidades: (1) identificar garantia ativa,
seguro associado e extensão/AppleCare ligados ao asset via tabela coverage, (2) verificar datas
de início/fim contra a data actual (regra determinística, não estimativa do LLM),
(3) mostrar estado visual claro: coberto / a expirar em breve / não coberto,
(4) indicar documentos em falta para completar a cobertura, (5) indicar entidade/contacto
relevante e a próxima ação recomendada (ex: "renovar até 12/03"). Usar #C9A15C (dourado)
para o badge de alerta "a expirar em breve" e um verde de confirmação para "coberto".
```

---

### F05 — Renewal / Price Increase Detection
**O quê:** Quando existem duas faturas do mesmo fornecedor/contrato, o sistema compara valores e datas e gera alerta de aumento.

**Prompt:**
```
/new-feature Renewal e Price Increase Detection — motor de comparação entre faturas/contratos
do mesmo fornecedor. Funcionalidades: (1) matching de fornecedor/entidade sobre metadados
estruturados dos documents, (2) cálculo determinístico de aumento absoluto e percentual
(nunca estimado por LLM), (3) construção de histórico por fornecedor, (4) cálculo de data
de renovação e alerta antecipado (ex: 17 dias antes), (5) geração de insight em linguagem
natural via LLM a partir dos números já calculados (ex: "O teu seguro automóvel renova
daqui a 17 dias. O valor aumentou 14% face ao período anterior."), (6) guardar em insights
com type='price_increase' ou 'renewal'. O motor de cálculo em src/lib/rulesEngine.ts,
a explicação em linguagem natural é o único passo que usa o LLM.
```

---

### F06 — Bills Intelligence (histórico + comparação)
**O quê:** Histórico de faturas de utilities (água, eletricidade, gás, internet, telemóvel, telefone, seguros) com comparação e alertas.

**Prompt:**
```
/new-feature Bills Intelligence — histórico e comparação de faturas de utilities.
Funcionalidades: (1) categorização automática em água, eletricidade, gás, internet, telemóvel,
telefone/telecom, seguros a partir dos documents extraídos, (2) construção de histórico por
categoria e fornecedor na tabela bills, (3) cálculo de evolução mensal e por fornecedor,
comparação com mês anterior, média de 6/12 meses (tudo determinístico), (4) geração de
insights em linguagem natural (ex: "A tua eletricidade aumentou 11,8% nos últimos 12 meses.",
"Pagaste €23 acima da tua média dos últimos seis meses."), (5) regras de alerta: fatura >110%
da anterior → alerta de aumento; fatura >125% da média de 6 meses → alerta de anomalia.
Objetivo: transformar faturas em histórico e comparação, não arquivar faturas.
```

---

### F07 — Bills Dashboard
**O quê:** Dashboard visual que responde: Quanto pago? O que mudou? O que merece atenção?

**Prompt:**
```
/new-feature Bills Dashboard — ecrã de visão geral de despesas recorrentes. Funcionalidades:
(1) total mensal e total anual estimado, (2) custo por categoria em gráfico (água, eletricidade,
gás, internet, telemóvel, telefone, seguros), (3) evolução mensal e por fornecedor em gráfico
de linha, (4) secção de anomalias e aumentos recorrentes detectados pelo rules engine,
(5) lista de próximas renovações vindas da tabela events, (6) filtro por período (mês, trimestre,
ano). Usar #324138 (verde-floresta) para os gráficos principais e #C9A15C (dourado) para
destacar anomalias e alertas. Dados vindos das tabelas bills, contracts e insights do Supabase.
```

---

### F08 — Alerts e Life Calendar (básico)
**O quê:** Lista consolidada de alertas e eventos (renovações, expirações) gerados pelo rules engine.

**Prompt:**
```
/new-feature Alerts e Life Calendar básico — ecrã consolidado de eventos e alertas.
Funcionalidades: (1) lista de eventos da tabela events (renovações, expirações, deadlines)
ordenada por data, (2) lista de insights recentes da tabela insights com badge de severidade
(info / warning / critical), (3) filtro por tipo (coverage, bills, renewal), (4) marcar
insight como lido/resolvido, (5) vista de calendário simples com os próximos 60 dias.
Cor #C9A15C (dourado) para severity='warning', vermelho subtil para 'critical'.
```

---

## PHASE 2 — Gmail Intelligence

### F09 — Ligação Gmail e pesquisa direcionada
**O quê:** Autorizar Gmail via OAuth. Pesquisa direcionada de emails com faturas (não leitura indiscriminada). Extração de anexos, deduplicação e classificação automática.

**Prompt:**
```
/new-feature Gmail Intelligence — ligação e importação automática de faturas via email.
Funcionalidades: (1) fluxo "Find my bills" com autorização Gmail OAuth (permissões mínimas,
apenas leitura/pesquisa — nunca acesso total à caixa de correio), (2) pesquisa direcionada
por remetentes e assuntos típicos de faturas (não ler indiscriminadamente), (3) identificação
de emails e anexos candidatos, (4) extração via a mesma pipeline Vision LLM do F03,
(5) deduplicação contra documents já existentes, (6) classificação automática por
fornecedor/categoria, (7) construção automática de histórico e geração de alertas contínuos
via o rules engine existente. Gmail primeiro; Outlook fica para uma iteração futura.
```

---

## PHASE 3 — Assets + Warranty Vault

### F10 — Warranty Vault completo
**O quê:** Gestão completa de ativos: produto/modelo, número de série, preço, data de compra, vendedor, return deadline, warranty period, insurance/extension, maintenance, claims.

**Prompt:**
```
/new-feature Warranty Vault — CRUD completo de ativos e a sua proteção. Funcionalidades:
(1) criar/editar asset com produto/modelo, número de série, preço, data de compra, vendedor,
(2) ligar warranty period, return deadline e insurance/extension (tabela coverage),
(3) registo de maintenance e claims associados ao asset, (4) alertas automáticos de
expiração de garantia e return deadline via o rules engine (F05), (5) vista de detalhe do
asset que mostra a relação completa Asset → Purchase → Invoice → Warranty → Protection →
Maintenance, (6) o Coverage Check (F04) usa estes dados directamente. Não posicionar como
"mais um warranty tracker" — o valor está na relação entre entidades, não no armazenamento.
```

---

## PHASE 4 — Digital Estate

### F11 — Digital Estate
**O quê:** Digital assets, financial assets, important documents, trusted people, instructions — com permissões granulares.

**Prompt:**
```
/new-feature Digital Estate — módulo de legado digital com permissões granulares.
Funcionalidades: (1) registo de Digital Assets (domains, websites, social accounts, YouTube,
online businesses, digital IP, crypto accounts — apenas onde estão, nunca credenciais),
(2) registo de Financial Assets (bank, investments, pension, insurance, crypto, property),
(3) registo de Important Documents (will, property documents, insurance, contracts,
certificates), (4) gestão de Trusted People com permissões granulares por secção — nunca
expor tudo a uma trusted person por defeito, (5) campo de Instructions em texto livre,
(6) auditoria de acessos (audit log) sempre que uma trusted person visualiza informação.
Nunca armazenar passwords, seed phrases ou banking credentials — apenas onde estão guardados
(ex: "Google account — credentials stored in 1Password").
```

---

### F12 — Emergency Pack
**O quê:** Export organizado de assets, documentos, seguros, propriedades, digital assets, trusted contacts e instructions para situações de emergência.

**Prompt:**
```
/new-feature Emergency Pack — geração e export de pacote de emergência. Funcionalidades:
(1) selecção do que incluir: important assets, important documents, insurance, properties,
digital assets, trusted contacts, instructions, (2) geração de um documento/pacote organizado
(PDF ou vista estruturada) a partir dos dados já existentes no Zelanna, (3) opção de
partilha controlada com uma trusted person específica, (4) versão actualizável — regenerar
quando os dados mudam. Aplicar as mesmas permissões granulares do Digital Estate (F11).
```

---

## PHASE 5 — Life Intelligence

### F13 — Anomaly detection avançada e recomendações proactivas
**O quê:** Deteção de subscrições não usadas, seguros duplicados, documentação em falta, protection gaps, e recomendações proactivas.

**Prompt:**
```
/new-feature Life Intelligence avançada — camada de análise proactiva sobre os dados já
recolhidos. Funcionalidades: (1) deteção de unused subscriptions (contrato activo sem
utilização aparente ou sem asset associado), (2) deteção de duplicate insurance (mais do
que uma cobertura para o mesmo asset/risco), (3) deteção de missing documentation
(asset sem garantia registada, contrato sem documento associado), (4) deteção de protection
gaps (asset de valor sem nenhuma coverage), (5) cost analysis consolidada por categoria e
período, (6) recomendações proactivas apresentadas como insights normais (tabela insights),
nunca como ações automáticas — o utilizador decide sempre o próximo passo.
```

---

## PHASE 6 — Zelanna Agent

### F14 — Zelanna Agent (acções com autorização)
**O quê:** Encontrar contratos a renovar nos próximos 60 dias, encontrar alternativas mais baratas, preparar cancelamento/alteração — sempre com autorização explícita antes de executar.

**Prompt:**
```
/new-feature Zelanna Agent — agente que prepara mas nunca executa sem autorização.
Funcionalidades: (1) encontrar contratos a renovar nos próximos 60 dias, (2) pesquisar
alternativas mais baratas para esse tipo de contrato/fornecedor, (3) preparar rascunho de
cancelamento ou pedido de alteração, (4) apresentar ao utilizador com pedido de autorização
explícita antes de qualquer ação, (5) executar apenas após aprovação confirmada,
(6) registar todas as ações e autorizações em audit log. Esta é a única feature do Zelanna
que executa ações externas — todas as anteriores são apenas leitura/análise. Não construir
antes das fases anteriores estarem validadas e estáveis.
```

---

## REFERÊNCIA RÁPIDA — Ordem de desenvolvimento

| # | Feature | Fase | Notas |
|---|---|---|---|
| — | Manual Validation | Phase 0 | Sem código — gate obrigatório | Done
| F01 | Autenticação | Phase 1 | Done
| F02 | Onboarding | Phase 1 | Inclui o "Aha Moment" | Done
| F03 | Upload + extração AI | Phase 1 | |
| F04 | Coverage Check | Phase 1 | Hipótese #1 |
| F05 | Renewal / Price Increase Detection | Phase 1 | Hipótese #2 |
| F06 | Bills Intelligence | Phase 1 | Hipótese #3 |
| F07 | Bills Dashboard | Phase 1 | |
| F08 | Alerts e Life Calendar básico | Phase 1 | |
| F09 | Gmail Intelligence | Phase 2 | |
| F10 | Warranty Vault completo | Phase 3 | |
| F11 | Digital Estate | Phase 4 | |
| F12 | Emergency Pack | Phase 4 | |
| F13 | Life Intelligence avançada | Phase 5 | |
| F14 | Zelanna Agent | Phase 6 | Única feature com ações externas |

---

*Baseado no Plano Estratégico Zelanna (ex-LifeAdmin) — Setembro 2026*
*Paleta de referência: #131E15 · #324138 · #5B685F · #859087 · #ADB5B0 · #DBE0DF · #C9A15C*
