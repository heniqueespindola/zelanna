# Zelanna — Contexto do Projecto para Claude Code

## O que é este projecto

**Zelanna** (produto anteriormente referido como "LifeAdmin") é uma plataforma de **Personal Life Intelligence**: organiza, entende e conecta a informação que uma pessoa precisa administrar ao longo da vida — faturas, seguros, garantias, contratos, ativos, documentos.

A informação está hoje espalhada por email, cloud, documentos físicos, bancos, seguradoras, contratos, recibos e memória. A proposta de valor evolui de "guardar documentos" para:

> "Know what you own, what you pay for, what protects you, what needs your attention and what happens if you can't manage it."

**Tese de produto:** o mercado já validou a categoria de Life Organization (Quicken LifeHub, Trustworthy, Prisidio, Everplans). A questão não é se as pessoas precisam de organizar a vida — é porque escolheriam o Zelanna em vez de uma solução existente. A resposta é **Personal Life Intelligence**: o Zelanna não apenas armazena informação, compreende relações entre documentos, ativos, contratos, proteção, despesas e pessoas, e produz insights acionáveis.

**Modelo:** Storage → Understanding → Intelligence → Action.

**Empresa:** mocruz (Henrique — founder solo, bootstrapped)
**Mercado de validação:** Portugal
**Idioma do produto:** English-first, com expansão planeada para Portuguese, Spanish, French, German
**Público inicial:** 30–55 anos, homeowners com casa, carro, seguros, contratos, equipamentos, documentos, subscrições e família — elevada densidade de "life admin"

---

## ⚠️ Metodologia — validar antes de construir

Esta é a regra principal do projecto e tem prioridade sobre qualquer decisão de arquitectura ou feature.

**Antes de escrever pipeline de IA ou construir plataforma completa:**
1. Recrutar 10–15 pessoas reais
2. Pedir 5–10 documentos já existentes por pessoa (faturas, seguros, garantias, recibos, contratos)
3. Fazer o cruzamento manualmente ou com script simples
4. Gerar os insights como se fossem produzidos pelo Zelanna
5. Mostrar o resultado ao utilizador
6. Perguntar: "Isto vale-te €10/mês? €5/mês? Nada?"
7. Observar a reação emocional — procurar o "Uau, não sabia disto"
8. Identificar que insights fazem a pessoa querer importar mais documentos

**Gate de decisão:** não avançar para a plataforma completa se o produto for considerado interessante mas não suficientemente valioso para pagar. Ver `## Roadmap` → Phase 0.

---

## Nova tese de valor prioritária

| Prioridade | Feature | Dificuldade | Hipótese |
|---|---|---|---|
| 1 | **Coverage Check** | 3/10 — baixa | Cruzar documentos para responder se um ativo está protegido |
| 2 | **Renewal / Price Increase Detection** | 3/10 — baixa | Detetar aumentos em contratos/seguros e alertar |
| 3 | **Bills Intelligence** | 4–5/10 — baixa/média | Criar histórico de água, luz, gás, internet, telefone e outras utilities |

**Wedge de entrada** (o produto não entra no mercado como "the app for everything in your life"):

```
INSURANCE + BILLS → UNDERSTAND → COMPARE → ALERT
```

- Coverage Check demonstra inteligência sobre proteção
- Price Increase Detection demonstra valor financeiro
- Bills Intelligence cria utilização recorrente
- Email Intelligence elimina posteriormente o trabalho manual

---

## Features do wedge inicial

### Coverage Check — "Estás coberto?"
Utilizador carrega fatura + garantia + seguro/AppleCare e pergunta: *"O meu MacBook avariou. Estou coberto?"*
- Identificar garantia ativa, seguro associado, extensão/AppleCare
- Verificar datas
- Indicar documentos necessários e entidade/contacto
- Apresentar a próxima ação
- Dificuldade: 3/10 — dados fornecidos pelo utilizador + regras determinísticas

### Renewal / Price Increase Detection
Quando aparecem duas faturas do mesmo fornecedor/contrato, o Zelanna compara valores e datas: aumento absoluto, aumento percentual, histórico, data de renovação, alerta antecipado, próxima ação.
> Exemplo: "O teu seguro automóvel renova daqui a 17 dias. O valor aumentou 14% face ao período comparável anterior."
Dificuldade: 3/10 — matching sobre metadados estruturados, cálculos determinísticos.

### Bills Intelligence
Categorias iniciais: água, eletricidade, gás, internet, telemóvel, telefone/telecom, seguros. Objetivo: transformar faturas em histórico, comparação, gráficos e alertas — **não** arquivar faturas.
> "A tua eletricidade aumentou 11,8% nos últimos 12 meses." / "Pagaste €23 acima da tua média dos últimos seis meses."
Dificuldade sem email: 4/10. Com descoberta automática via email: 5–6/10.

### Bills Dashboard
Responde a: Quanto pago? O que mudou? O que merece atenção?
- Total mensal / anual estimado, custo por categoria, evolução mensal e por fornecedor
- Comparação com mês anterior, média 6/12 meses, anomalias, aumentos recorrentes, próximas renovações

**Regras iniciais (motor determinístico — o LLM apenas explica o resultado):**
- Fatura > 110% da anterior → alerta de aumento
- Fatura > 125% da média de seis meses → alerta de anomalia
- Alteração consistente de valor recorrente → alerta
- Renovação próxima → evento no Life Calendar

### Email Intelligence — "Let Zelanna find your bills" (fase posterior)
Primeiro provar o valor das faturas via upload/forward manual. Depois: autorizar Gmail → pesquisar emails relacionados com faturas → identificar anexos candidatos → extrair dados → agrupar por fornecedor/categoria → construir histórico → gerar gráficos e alertas.
Gmail primeiro; Outlook depois. Nunca ler indiscriminadamente a caixa de correio — permissões mínimas e pesquisa direcionada.

---

## Módulos posteriores (fora do wedge inicial)

**Warranty Vault** — subproduto do Zelanna. Não vender como "mais um warranty tracker" (mercado já tem soluções verticais). O valor está na relação Asset → Purchase → Invoice → Warranty → Protection → Maintenance. Campos: produto/modelo, número de série, preço, data de compra, vendedor, return deadline, warranty period, insurance/extension, maintenance, claims. Coverage Check é o caso de uso que o transforma de arquivo simples em inteligência.

**Digital Estate** — *"Make sure the people you trust can find what matters when you can't."* Digital Assets (domains, websites, social accounts, YouTube, online businesses, digital IP, crypto accounts), Financial Assets, Important Documents, Trusted People, Instructions. Permissões granulares — nunca expor tudo a um trusted person.

**Emergency Pack** — export organizado (assets, documentos, seguros, propriedades, digital assets, trusted contacts, instructions) para situações de emergência.

**AI Life Assistant** — perguntas em linguagem natural quando o Life Graph tiver dados suficientes: "Que garantias tenho?", "Que contratos renovam nos próximos 60 dias?", "Quanto gasto por ano em subscrições?".

**Smart Life Alerts** — proactive intelligence: warranty expiry, contract renewal, insurance premium change, bill anomaly, recurring expense change, missing documentation, coverage gap, estate readiness.

**Zelanna Agent** (fase 6, futuro) — encontrar contratos a renovar, encontrar alternativas mais baratas, preparar cancelamento/alteração, pedir autorização explícita, executar apenas após aprovação. **Não construir agente autónomo no MVP.**

---

## O que NÃO ser

- **Não é um Password Manager.** Nunca armazenar passwords, seed phrases, private keys, banking credentials ou recovery codes. Em vez disso, registar onde o segredo está guardado (ex: "Google account — credentials stored in 1Password"). Isto reduz risco e mantém o foco em intelligence e life administration.
- **Não é uma graph database desde o início.** O Life Graph é a visão tecnológica central mas o MVP usa PostgreSQL/Supabase com relações simples (ex: Asset → Purchase → Invoice → Warranty → Insurance → Maintenance → Contract → Cost → Owner → Estate). Complexidade de grafo só se justifica com dados e utilização suficientes.
- **Não competir a copiar o Quicken.** A diferenciação é intelligence cross-domain, não um Quicken menor.

---

## Brand e identidade visual

**Nome:** Zelanna
**Logo:** em exploração — símbolo baseado na letra "Z", evitando convenções genéricas de logo de startup (ficheiros de referência em `Projetos/Zelanna/` fora do repositório de código)

**Paleta de cores (exacta):**
```
/* — Escala principal (escuro → claro) — */
#131E15  Verde-carvão (background mais escuro)
#324138  Verde-floresta (cor primária / destaque)
#5B685F  Verde-ardósia (superfícies secundárias)
#859087  Verde-pedra (neutros médios)
#ADB5B0  Verde-cinza claro (bordas, separadores)
#DBE0DF  Névoa (background claro)

/* — Accent — */
#C9A15C  Dourado (accent — CTAs, destaques, ícones de alerta)

/* — Base — */
#000000  Preto (texto principal em fundos claros)
#FFFFFF  Branco (texto em fundos escuros)
```
→ Definir em `src/constants/theme.ts` (ou equivalente `styles/theme.ts` se Next.js)

**Tokens de cor sugeridos:**
```typescript
export const colors = {
  // Escala principal
  bgDarkest:    '#131E15',
  primary:      '#324138',   // cor de marca — botões, CTAs, destaques
  surfaceAlt:   '#5B685F',
  neutralMid:   '#859087',
  border:       '#ADB5B0',
  bgLight:      '#DBE0DF',
  // Accent
  accent:       '#C9A15C',   // dourado — alertas, badges, insights
  // Base
  black:        '#000000',
  white:        '#FFFFFF',
  // Texto
  textPrimary:  '#000000',
  textInverted: '#FFFFFF',
  textMuted:    '#859087',
};
```

**Tipografia:**
| Token | Fonte | Uso |
|---|---|---|
| `fonts.display` | Avenir | Títulos, headings principais |
| `fonts.body` | Lato | Corpo de texto, descrições, UI |

**Tom de comunicação:**
- Claro, calmo e de confiança — o utilizador está a partilhar informação sensível (seguros, ativos, finanças, family)
- Nunca alarmista, mas directo nos alertas ("O teu seguro renova daqui a 17 dias" — factual, accionável)
- Evitar linguagem de "app genérica de produtividade" — o produto entende a vida da pessoa, não é uma lista de tarefas
- Segurança e privacidade fazem parte da proposta de valor, não apenas uma secção técnica

---

## Stack tecnológica

**Plataformas de distribuição: iOS (App Store) + Android (Google Play). Sem web.**

| Camada | Tecnologia | Porquê |
|---|---|---|
| Mobile | React Native + Expo (SDK 57) + Expo Router | iOS + Android numa codebase, OTA updates, EAS Build, file-based routing |
| Backend/Database | Supabase + PostgreSQL | Auth + DB + Storage + Edge Functions |
| Storage | Supabase Storage | Upload de documentos (PDF, fotografia) |
| IA — Extração | Vision-capable LLM | Interpretar PDF/fotografia/email e extrair dados estruturados |
| IA — Explicação | LLM | Explicar insights em linguagem natural (o cálculo é sempre determinístico) |
| Automação | n8n | Orquestração de pipelines (ex: pesquisa de email, agendamento de alertas) |
| Pagamentos | Stripe (via RevenueCat ou react-native-purchases) | Subscrições FREE / Plus / Family / Protect como in-app purchases iOS/Android |
| Email (fase 2) | Gmail API primeiro, Outlook depois | Pesquisa direcionada de faturas, nunca leitura indiscriminada |
| Build | EAS Build (Expo) | Builds iOS (.ipa) e Android (.aab) na cloud sem Xcode/Android Studio local |

**Versões:** Expo SDK 57, React 19.2.3, React Native 0.86.3, TypeScript.
**Nota sobre pagamentos:** o documento estratégico especifica Stripe, mas para in-app purchases iOS/Android as lojas normalmente exigem StoreKit/Google Play Billing — avaliar RevenueCat como camada sobre Apple/Google e manter Stripe apenas se for cobrança fora da app (ex: web futuro, B2B2C).

---

## Arquitectura de IA

| Componente | Função |
|---|---|
| Vision LLM | Interpretar PDF/fotografia/email e extrair dados |
| Schema fixo | Normalizar os campos extraídos |
| Rules Engine | Datas, percentagens, médias, comparação e alertas — **sempre determinístico** |
| LLM | Explicar insights em linguagem natural (nunca calcula) |
| AI Agent | Fase posterior (Phase 6) — ações externas apenas com autorização explícita |

**Regra crítica:** o motor de cálculo (percentagens, médias, comparações, datas de renovação) é sempre determinístico. O LLM nunca calcula — apenas interpreta/extrai e depois explica o resultado em linguagem natural. Não construir um agente autónomo no MVP.

---

## Estrutura de pastas do projecto (scaffold criado — Expo + Expo Router)

```
zelanna/
├── .claude/commands/            # Comandos do cowork (não editar)
├── .agents/skills/              # Skills dos agentes (não editar)
├── .env                         # Variáveis de ambiente (não commitar)
├── app.json                     # Configuração Expo (nome, bundle id, ícones)
│
├── app/                         # Expo Router — ecrãs e navegação (file-based)
│   ├── _layout.tsx              # Root Stack layout
│   ├── index.tsx                # Redirect inicial (login vs dashboard, a ligar ao useAuth)
│   ├── (auth)/
│   │   ├── login.tsx
│   │   └── register.tsx
│   ├── (dashboard)/
│   │   ├── _layout.tsx          # Tabs: Dashboard, Documents, Coverage, Bills, Settings
│   │   ├── index.tsx            # Dashboard — visão geral (alertas, próximas renovações)
│   │   ├── documents.tsx        # Upload e biblioteca de documentos
│   │   ├── coverage.tsx         # Coverage Check
│   │   ├── bills.tsx            # Bills Dashboard + Bills Intelligence
│   │   └── settings.tsx         # Perfil, plano, privacidade
│   │   # assets/ (Warranty Vault, fase 3) e estate/ (Digital Estate, fase 4) — ainda por criar
│   └── onboarding/
│       ├── step1.tsx            # Boas-vindas + objetivo (proteção / despesas / estate)
│       ├── step2.tsx            # Primeiro upload de documentos
│       └── step3.tsx            # Primeiro insight gerado — o "Aha Moment"
│
└── src/
    ├── components/
    │   ├── ui/                  # Button, Input, Card, Badge, Alert (por criar)
    │   ├── documents/           # DocumentUpload, DocumentCard, ExtractionPreview
    │   ├── coverage/            # CoverageCheckForm, CoverageResult
    │   ├── bills/               # BillsChart, BillsTable, AnomalyBadge
    │   └── dashboard/           # InsightCard, AlertList, RenewalTimeline
    ├── constants/
    │   └── theme.ts             # ✅ Paleta, fontes, spacing, radius (já criado)
    ├── hooks/                   # useAuth, useDocuments, useCoverageCheck, useBills, useInsights (por criar)
    ├── lib/                     # supabase.ts, extraction.ts, rulesEngine.ts, payments.ts (por criar)
    ├── stores/                  # Estado global (Zustand, se necessário)
    └── types/                   # documents.ts, coverage.ts, bills.ts, insights.ts (por criar)
```

**Path alias:** `@/*` → `src/*` (configurado em `tsconfig.json`). Componentes das pastas acima ainda por implementar — o scaffold cobre apenas navegação, tema e ecrãs-placeholder com `TODO` a apontar para a feature do `FEATURES.md` correspondente.

---

## Schema da base de dados (Supabase) — modelo de dados inicial

```sql
users (
  id uuid PRIMARY KEY references auth.users,
  created_at timestamptz DEFAULT now()
)

-- Documentos carregados (fatura, garantia, seguro, contrato, etc.)
documents (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  document_type text,             -- 'invoice' | 'warranty' | 'insurance' | 'contract' | 'receipt'
  provider text,                  -- fornecedor/entidade identificado pelo LLM
  date date,
  amount numeric,
  extracted_data jsonb,           -- payload estruturado da extração Vision LLM
  created_at timestamptz DEFAULT now()
)

-- Ativos (para Warranty Vault / Coverage Check)
assets (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text,
  brand text,
  model text,
  serial_number text,
  purchase_date date,
  purchase_price numeric,
  created_at timestamptz DEFAULT now()
)

-- Contratos e subscrições recorrentes
contracts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  type text,                      -- 'insurance' | 'utility' | 'subscription' | 'other'
  start_date date,
  renewal_date date,
  current_amount numeric,
  created_at timestamptz DEFAULT now()
)

-- Cobertura (seguros, garantias, extensões ligadas a um asset)
coverage (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  asset_id uuid REFERENCES assets(id) ON DELETE CASCADE,
  type text,                      -- 'warranty' | 'insurance' | 'extension'
  provider text,
  start_date date,
  end_date date,
  status text,                    -- 'active' | 'expired' | 'expiring_soon'
  created_at timestamptz DEFAULT now()
)

-- Faturas de utilities/bills (histórico para Bills Intelligence)
bills (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  category text,                  -- 'agua' | 'eletricidade' | 'gas' | 'internet' | 'telemovel' | 'telefone' | 'seguro'
  invoice_date date,
  billing_period text,
  amount numeric,
  created_at timestamptz DEFAULT now()
)

-- Eventos (renovações, prazos) — alimenta o Life Calendar
events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  type text,                      -- 'renewal' | 'expiry' | 'deadline'
  due_date date,
  source_id uuid,                 -- referência a contracts/coverage/assets
  created_at timestamptz DEFAULT now()
)

-- Insights gerados pelo motor de regras + LLM
insights (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  type text,                      -- 'anomaly' | 'renewal' | 'coverage_gap' | 'price_increase'
  severity text,                  -- 'info' | 'warning' | 'critical'
  data jsonb,
  message text,                   -- explicação em linguagem natural (gerada pelo LLM)
  created_at timestamptz DEFAULT now()
)
```

**RLS:** todas as tabelas com Row Level Security. Utilizador só acede aos seus próprios dados.

---

## Planos e preços (hipótese — a validar na Phase 0)

| Plano | Preço hipótese | Objetivo |
|---|---|---|
| **FREE** | €0 | Aquisição e prova de valor |
| **ZELANNA PLUS** | €7,99/mês ou €79/ano | Plano principal |
| **ZELANNA FAMILY** | €14,99/mês ou €149/ano | Household/família |
| **ZELANNA PROTECT** | €199–299/ano | Utilizadores com maior complexidade patrimonial |

**Zelanna Plus inclui:** unlimited assets, unlimited documents, warranties, contracts, subscriptions, Bills Intelligence, Life Calendar, AI Life Assistant, Smart Alerts, Digital Estate, Trusted People, Emergency Pack, email/document import, Advanced Life Graph.

O objetivo é validar se Coverage Check + Price Increase Detection + Bills Intelligence justificam €79/ano. Comparação competitiva principalmente contra a âncora de preço do Quicken LifeHub. Testar também €5/€10/€15/€20 por mês e €59/€79/€99 por ano na Phase 0.

---

## Regras de desenvolvimento

1. **TypeScript obrigatório** — sem `any`, sem `@ts-ignore`
2. **Componentes pequenos** — máximo 150 linhas por ficheiro
3. **Separação de responsabilidades** — lógica de negócio fora dos componentes UI
4. **Supabase RLS sempre** — nunca fazer bypass de Row Level Security
5. **Nunca hardcodar** chaves de API — usar variáveis de ambiente
6. **Motor de cálculo sempre determinístico** — percentagens, médias, comparações e alertas nunca são "estimados" por um LLM; o LLM só explica o resultado
7. **Nunca armazenar segredos** — passwords, seed phrases, private keys, banking credentials ou recovery codes nunca entram no schema (ver `## O que NÃO ser`)
8. **Antes de commit:** correr `tsc --noEmit`
9. **Commits em português europeu** — mensagens claras em pt-PT
10. **Path alias `@/`** — nunca usar `../../` para imports internos
11. **Segurança em primeiro lugar** — encryption at rest e in transit, MFA, granular permissions, audit logs, least privilege, minimal data retention (ver `## Segurança`)
12. **Produto English-first** — UI e copy em inglês por defeito; i18n preparado desde o início para pt-PT, es-ES, fr-FR, de-DE

**Padrão de commit:**
```
feat: adiciona ecrã de Coverage Check
fix: corrige cálculo de percentagem no rules engine
chore: actualiza dependência supabase-js
refactor: extrai lógica de anomalias para src/lib/rulesEngine.ts
docs: documenta hook useBills
```

---

## Segurança

O Zelanna potencialmente conhece património, contratos, documentos, seguros, propriedades, relações familiares, informação financeira e ativos digitais. Segurança e privacidade fazem parte da proposta de valor, não apenas uma secção técnica.

- Encryption at rest e in transit
- MFA
- Granular permissions (crítico para Digital Estate — nunca expor tudo a um trusted person)
- Audit logs
- Least privilege
- Minimal data retention
- **Nunca guardar passwords**
- **Nunca guardar crypto seed phrases / private keys**
- **Nunca guardar banking credentials**

---

## Variáveis de ambiente (`.env`)

```bash
# Cliente — visíveis na app (prefixo EXPO_PUBLIC_)
EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJxxx...

# Servidor — NUNCA no cliente (usar em Edge Functions do Supabase)
# VISION_LLM_API_KEY=xxx
# STRIPE_SECRET_KEY=xxx (ou REVENUECAT_*_KEY para in-app purchases)
# GMAIL_CLIENT_SECRET=xxx (fase 2)
```

---

## Fase actual de desenvolvimento

**Scaffold do app criado** (Expo + Expo Router + TypeScript, `expo-doctor` a passar 21/21 checks) — navegação e tema prontos, ecrãs ainda são placeholders com `TODO` por feature.

⚠️ **Phase 0 — Manual Validation continua a não estar feita** (ver `## ⚠️ Metodologia`). O scaffold existe para haver onde trabalhar, mas a prioridade real antes de implementar qualquer lógica de produto é: recrutar 10–15 participantes, testar Coverage Check / Price Increase Detection / Bills Intelligence manualmente, medir "Aha Moments" e willingness-to-pay. **Gate:** não avançar com features de Phase 1 sem sinal claro de valor.

**Setup ainda por fazer antes de implementar features reais:**
- [ ] Projecto Supabase criado (região EU) e `supabase/schema.sql` aplicado
- [ ] `.env` preenchido com valores reais
- [ ] Fontes Avenir/Lato adicionadas a `src/assets/fonts/` e carregadas via `expo-font`
- [ ] Ícone e splash screen definitivos (logo "Z" ainda em exploração)
- [ ] EAS CLI instalado e `eas.json` configurado: `npm install -g eas-cli && eas login`

---

## Roadmap

### Phase 0 — Manual Validation | 1–2 semanas
10–15 participantes, 5–10 documentos por pessoa, testar as 3 hipóteses manualmente, gerar insights à mão, medir Aha Moments, testar pricing (€5/€10/€15/€20 mês, €59/€79/€99 ano).
**Gate:** não avançar se interessante mas não valioso o suficiente para pagar.

### Phase 1 — MVP Insurance + Bills | 4–6 semanas
Upload, AI extraction, Insurance, Bills, History, Coverage Check, Price comparison, Anomaly detection, Basic graphs, Alerts, Dashboard.
Objetivo: provar Import → Understand → Compare → Insight → Alert.

### Phase 2 — Gmail Intelligence | 2–4 semanas
Gmail OAuth, pesquisa direcionada de faturas, importação de anexos, deduplicação, classificação, histórico automático, alertas contínuos.

### Phase 3 — Assets + Warranty Vault | 4–6 semanas
Assets completos, purchase history, warranties, return deadlines, protection, maintenance, claims.

### Phase 4 — Digital Estate | +4 semanas
Digital assets, trusted people, permissions, estate readiness, instructions, Emergency Pack.

### Phase 5 — Life Intelligence | +6–8 semanas
Anomaly detection avançada, renewal detection, cost analysis, protection gaps, unused subscriptions, duplicate insurance, missing documentation, proactive recommendations.

### Phase 6 — Zelanna Agent
Encontrar contratos a renovar nos próximos 60 dias, encontrar alternativas mais baratas, preparar cancelamento/alteração, pedir autorização explícita, executar apenas após aprovação.

**Não construir ainda (todas as fases anteriores a onde se justificam):** graph database sofisticada, Gmail antes da validação, Outlook, external market valuation APIs, autonomous AI agent, automatic death verification, password management, banking access, crypto custody, legal estate execution.

---

## Workflow de desenvolvimento (Claude Code)

```
/new-feature → /research → PRD.md → /clear → /plan → Spec.md → /clear → /implement → /commit
```

**Regra crítica:** nunca exceder 50% da context window numa fase. Usar `/clear` entre fases.

### Comandos disponíveis
- `/new-feature` — iniciar nova feature
- `/research` — investigar e gerar PRD.md
- `/plan` — gerar Spec.md
- `/implement` — implementar conforme Spec.md
- `/commit` — commit semântico
- `/resume` — retomar contexto
- `/handoff` — preparar handoff para nova sessão

---

## Concorrência

| Concorrente/categoria | Forte em | Oportunidade Zelanna |
|---|---|---|
| Quicken LifeHub | Life organization | Cross-domain intelligence e alertas |
| Trustworthy | AI + household information | Mais foco em custos, proteção e ação |
| Prisidio | Estate/legacy | Integração com vida operacional |
| Everplans | Estate planning | Intelligence contínua |
| 1Password | Credentials | Zelanna não guarda segredos |
| Notion | Organização | Zelanna compreende relações |
| Dropbox | Documents | Storage sem intelligence |
| Warranty apps | Warranties/receipts | Podem ser absorvidos como módulo |
| Apple Legacy Contact | Digital legacy | Limitado ao ecossistema Apple |

Não tentar vencer o Quicken construindo um Quicken menor — a diferenciação é intelligence cross-domain.

**Moat:** Life Graph (relações entre entidades), Historical Life Data, Relationships (Asset → Protection → Contract → Cost → Owner → Estate), Proactive Intelligence, Trust (segurança e privacidade). AI, PDF upload, reminders e storage isoladamente **não** são moat.

---

## Estratégia de entrada

Canal inicial founder-led: outreach direto, LinkedIn, comunidades relevantes, conteúdo com exemplos de hidden money/coverage gaps, beta users, referral. Objetivo inicial: utilizadores que forneçam documentos reais, recebam insights e estejam dispostos a pagar.

**B2B2C futuro:** insurance companies, banks, financial advisors, lawyers, estate planners, wealth managers, property companies — modelo de infraestrutura de engagement em vez de subscrição B2C pura.

---

## Recursos de referência

- Documento estratégico completo: `LifeAdmin_Plano_Estratégico_Atualizado_Setembro_2026.docx` (fora deste repositório, em `Projetos/Zelanna/`)
- Identidade visual: paleta de cores e tipografia (ficheiros de referência em `Projetos/Zelanna/`)
- Schema da base de dados: `supabase/schema.sql` (a criar)
