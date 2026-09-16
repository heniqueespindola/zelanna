---
data: 2026-09-15
status: backlog
prioridade: baixa
fase_mvp: nao
---

# Feature: Digital Estate (F11)

## Contexto

Digital Estate é a Phase 4 do roadmap (`CLAUDE.md` → Roadmap), fora do wedge inicial (Coverage Check / Renewal Detection / Bills Intelligence) e fora do MVP. A própria ficha do Warranty Vault (F10) já assinala esta ficha explicitamente no seu "Fora do escopo": *"Digital Estate / Trusted People / Emergency Pack (F11+, Phase 4) — Warranty Vault é um pré-requisito de dados, não inclui partilha com terceiros"* (`thoughts/shared/tickets/2026-09-15-warranty-vault.md:102`). **F11 é o próximo número de feature disponível** — F03 a F10 já cobrem Upload, Coverage Check, Renewal Detection, Bills Intelligence, Bills Dashboard, Alerts/Life Calendar, Gmail Intelligence e Warranty Vault (todos com ficha própria em `thoughts/shared/tickets/`).

O `CLAUDE.md` → "Módulos posteriores" descreve o Digital Estate como: *"Make sure the people you trust can find what matters when you can't."* — com Digital Assets, Financial Assets, Important Documents, Trusted People e Instructions, com "Permissões granulares — nunca expor tudo a um trusted person [por defeito]".

**Esta é uma feature greenfield — não existe hoje nenhum código relacionado.** Confirmado por pesquisa exaustiva em `src/`, `app/` e `supabase/`:

- **Nenhuma tabela** `trusted_people`, `digital_assets`, `financial_assets` ou `audit_log`/`estate_access_log` existe em `supabase/schema.sql` (421 linhas, 11 tabelas: `users`, `documents`, `assets`, `coverage`, `maintenance`, `claims`, `contracts`, `insights`, `bills`, `events`, `gmail_connections`, `gmail_import_items`).
- **Nenhum tipo** existe em `src/types/` para estes conceitos (ficheiros existentes: `assets.ts`, `bills.ts`, `contracts.ts`, `coverage.ts`, `documents.ts`, `events.ts`, `gmail.ts`, `insights.ts` — todos de domínios já implementados).
- **Nenhuma função** existe em `src/lib/` para CRUD de estate.
- **Nenhum ecrã/tab** existe em `app/(dashboard)/` — o tab bar actual (`app/(dashboard)/_layout.tsx`) tem 7 tabs: Dashboard, Documents, Coverage, Assets, Bills, Alerts, Settings.
- O único hit relacionado no código é cosmético: `app/onboarding/step1.tsx:12,31` tem "Preparing your digital estate" como uma das opções de objectivo no onboarding — só copy, não implementação.

**Implicação central:** ao contrário do F10 (que estendia CRUD já parcialmente construído), esta ficha desenha um modelo de dados novo do zero. O ponto mais delicado não é o schema em si — é decidir **como** um "trusted person" acede de facto à informação partilhada, porque só faz sentido ter um audit log ("sempre que uma trusted person visualiza informação") se existir um mecanismo real de visualização por alguém que não é o `auth.uid()` dono dos dados. Hoje o Supabase Auth (`auth.users`) só tem contas do próprio utilizador — não existe nenhum conceito de conta secundária, convite, magic link ou portal de acesso para terceiros. Esta ficha propõe o modelo de dados e a gestão do lado do dono (owner-side); o mecanismo de acesso do trusted person deve ser decidido em `/plan` (ver `## Notas técnicas`) e pode legitimamente ficar reduzido a um placeholder nesta fase, com o audit log a registar apenas acessos simulados/manuais até o mecanismo de acesso real ser construído — não faz sentido bloquear o modelo de dados por causa disto.

## Comportamento esperado

**Dado que** o utilizador não tem nenhum digital asset, financial asset ou trusted person registado
**Quando** abre o tab/ecrã Digital Estate
**Então** vê um estado vazio com opções claras para começar a registar cada secção (Digital Assets, Financial Assets, Important Documents, Trusted People, Instructions)

**Dado que** o utilizador quer registar um digital asset (domain, website, social account, YouTube, online business, digital IP, crypto account)
**Quando** preenche o formulário
**Então** indica nome, tipo/categoria, **onde está** (ex: "Google account", "GoDaddy", exchange de crypto) e **onde as credenciais estão guardadas** (texto livre, ex: "stored in 1Password") — **nunca** um campo de password, seed phrase ou chave privada

**Dado que** o utilizador quer registar um financial asset (bank, investments, pension, insurance, crypto, property)
**Quando** preenche o formulário
**Então** indica instituição, tipo, e notas relevantes (ex: número de conta parcial, referência) — mesma regra: nunca credenciais bancárias

**Dado que** o utilizador quer marcar um documento como "important document" para efeitos de estate (will, property documents, insurance, contracts, certificates)
**Quando** carrega um novo documento ou selecciona um já existente
**Então** o documento fica marcado/associado ao Digital Estate — decidir em `/plan` se isto reutiliza a tabela `documents` já existente (estendendo `document_type` com `'will'`/`'certificate'`, os dois tipos do `CLAUDE.md` que ainda não existem em `DocumentType`) ou se é uma referência nova numa tabela de junção

**Dado que** o utilizador quer adicionar uma trusted person
**Quando** preenche nome, relação e contacto (email)
**Então** a pessoa fica registada, sem qualquer acesso por defeito a nenhuma secção

**Dado que** o utilizador está a configurar permissões de uma trusted person
**Quando** activa acesso a uma ou mais secções (Digital Assets, Financial Assets, Important Documents, Assets/Warranty Vault, Coverage, Instructions)
**Então** só essas secções ficam visíveis para essa pessoa — nunca um "acesso total" implícito ou por omissão

**Dado que** o utilizador quer deixar instruções em texto livre para os trusted people
**Quando** escreve no campo Instructions
**Então** o texto fica persistido e visível apenas às trusted people com permissão para a secção "Instructions"

**Dado que** uma trusted person acede/visualiza qualquer secção partilhada com ela
**Quando** essa visualização acontece
**Então** fica um registo em audit log (quem, o quê, quando) — visível ao dono na secção Trusted People

## Critérios de aceitação

- [ ] `supabase/schema.sql`: tabela `digital_assets` (user-owned, RLS directa por `user_id`, padrão de `assets`/`contracts`/`bills`) — campos: `name`, `type` (`'domain'|'website'|'social_account'|'youtube'|'online_business'|'digital_ip'|'crypto_account'|'other'`), `location` (onde está registado/alojado), `credentials_location` (texto livre, nunca a credencial em si), `notes`
- [ ] `supabase/schema.sql`: tabela `financial_assets` (user-owned, mesmo padrão) — campos: `name`, `type` (`'bank'|'investment'|'pension'|'insurance'|'crypto'|'property'|'other'`), `institution`, `notes`
- [ ] `supabase/schema.sql`: tabela `trusted_people` (user-owned, mesmo padrão) — campos: `name`, `relationship`, `email`, `phone` (opcional), `status` (ex: `'active'|'revoked'`)
- [ ] `supabase/schema.sql`: tabela `trusted_person_permissions` (RLS via join a `trusted_people.user_id`, padrão de `coverage`/`maintenance`/`claims`) — campos: `trusted_person_id`, `section` (`'digital_assets'|'financial_assets'|'important_documents'|'assets'|'coverage'|'instructions'`), sem valor por defeito "tudo visível" — a ausência de registo para uma secção significa **sem acesso**
- [ ] `supabase/schema.sql`: tabela `estate_access_log` (audit log) — campos: `trusted_person_id`, `section`, `accessed_at`; decidir em `/plan` se é populada por um endpoint/RPC dedicado ou apenas manualmente enquanto não existe mecanismo real de acesso de terceiros
- [ ] `supabase/schema.sql`: decisão sobre "important documents" — extensão de `document_type` (`src/types/documents.ts` → `DocumentType`) com `'will'` e `'certificate'`, e/ou nova tabela/coluna de associação a Digital Estate (decidido em `/plan`)
- [ ] `supabase/schema.sql`: decisão sobre onde vive o campo Instructions — tabela dedicada `estate_instructions` (um registo por `user_id`) vs. coluna por trusted person; nunca um campo partilhado por defeito com todas as trusted people (decidido em `/plan`)
- [ ] `src/types/estate.ts` — novos tipos seguindo a convenção existente (uma union por enum + interfaces snake_case a espelhar as colunas, como em `src/types/assets.ts`/`coverage.ts`)
- [ ] `src/lib/estate.ts` — funções `fetchX`/`createX`/`updateX`/`deleteX` para digital assets, financial assets, trusted people e permissões, seguindo a convenção de `src/lib/coverage.ts`
- [ ] Nunca existe nenhum campo, coluna ou input de password, seed phrase, private key, banking credential ou recovery code em nenhuma das tabelas/formulários novos (`CLAUDE.md` regra #7 e secção "O que NÃO ser") — só campos de localização/referência (ex: "stored in 1Password")
- [ ] Novo ecrã/tab "Estate" em `app/(dashboard)/` com sub-secções para Digital Assets, Financial Assets, Important Documents, Trusted People e Instructions — decidir em `/plan` se é um 8º tab em `app/(dashboard)/_layout.tsx` ou um sub-ecrã dentro de Settings, dado que a app já tem 7 tabs
- [ ] Gestão de permissões por trusted person: UI explícita de toggle por secção, sem nenhum estado "select all" pré-activado
- [ ] Audit log visível na vista de detalhe de cada trusted person (lista de acessos, mesmo que populada só manualmente nesta fase, ver nota acima)
- [ ] RLS em todas as tabelas novas — utilizador só acede aos seus próprios dados (owner-side); qualquer acesso futuro de trusted people passa por um mecanismo de autenticação/autorização separado, fora do escopo desta ficha (ver `## Fora do escopo`)
- [ ] `tsc --noEmit` sem erros antes de commit

## Notas técnicas

- **Maior questão em aberto — mecanismo de acesso do trusted person:** hoje `auth.users` só serve o dono dos dados. Duas abordagens possíveis para investigar em `/research`/decidir em `/plan`: (a) trusted person recebe um convite por email com um magic link/token de acesso limitado, sem conta Supabase própria — mais simples, mas exige uma camada de autorização paralela ao RLS baseado em `auth.uid()`; (b) trusted person cria conta Supabase própria (mesmo `auth.users`) e o RLS de `trusted_person_permissions` é estendido para também dar `select` a essa conta nas secções autorizadas — mais robusto e alinhado com o padrão RLS já usado em todo o schema, mas implica um fluxo de convite/registo novo. Esta ficha **não** precisa de resolver isto até ao fim — o modelo de dados (tabelas + permissões + audit log) pode ser construído e testado do lado do dono, com o acesso real de terceiros a ficar como próximo passo explícito.
- **Reaproveitar `documents` para "Important Documents":** a tabela `documents` (`supabase/schema.sql:36-67`) já cobre `'invoice'|'warranty'|'insurance'|'contract'|'receipt'` como `document_type` — coluna `text` livre, **sem check constraint na base de dados** (só a union TypeScript `DocumentType` restringe), o que torna barato adicionar `'will'` e `'certificate'` sem migração destrutiva. Isto evita duplicar o pipeline de upload/extração já existente (`src/lib/extraction.ts`). Decidir em `/plan` se "important document" é só um `document_type` novo ou se precisa de uma flag/tabela de junção adicional para distinguir "documento normal" de "documento de estate" independentemente do tipo (ex: um recibo pode também ser relevante para o estate).
- **Padrão RLS a replicar:** tabelas directamente do utilizador (`digital_assets`, `financial_assets`, `trusted_people`, `estate_instructions` se for tabela própria) seguem o padrão simples `using (auth.uid() = user_id)` de `assets`/`contracts`/`bills` (`supabase/schema.sql:84-98`). Tabelas filhas (`trusted_person_permissions`, `estate_access_log`) seguem o padrão de `coverage`/`maintenance`/`claims` (`supabase/schema.sql:104-143`): `exists (select 1 from trusted_people where trusted_people.id = trusted_person_permissions.trusted_person_id and trusted_people.user_id = auth.uid())`.
- **Nunca acesso total por defeito:** ao contrário de `coverage`/`maintenance`/`claims` (onde o `asset_id` já implica que o dono vê tudo), `trusted_person_permissions` deve ser desenhado para que a **ausência** de um registo numa secção signifique sem acesso — nunca um campo boolean `all_access` ou um default `true`. Isto é uma regra de produto explícita do `CLAUDE.md` ("nunca expor tudo a um trusted person [por defeito]"), não só uma preferência técnica.
- **Insights/Life Calendar:** esta ficha não precisa de gerar insights nem eventos de Life Calendar (`src/types/insights.ts` → `InsightType`, `src/lib/events.ts` → `LifeCalendarEntry`/`joinLifeCalendarEvents`). Se no futuro fizer sentido um alerta tipo "reveres as tuas trusted people há mais de 12 meses" ou "acesso de trusted person expira em breve", isso implica estender ambas as uniões fechadas — seguindo o mesmo padrão de extensão incremental já usado para `coverage_expiring`/`return_deadline` no F10 — mas fica fora do escopo desta ficha.
- **Tema/cores:** reutilizar `colors.warning`/`colors.critical`/`colors.success`/`colors.info` já existentes em `src/constants/theme.ts` para estados de permissão (ex: "no access" vs "shared") — não introduzir cores novas.
- **Tab bar:** a app já tem 7 tabs (`Dashboard`, `Documents`, `Coverage`, `Assets`, `Bills`, `Alerts`, `Settings`). Um 8º tab "Estate" é viável mas aumenta a densidade da tab bar num ecrã pequeno — considerar em `/plan` se faz mais sentido como sub-secção dentro de `Settings` nesta fase inicial, promovendo a tab própria só se/quando a feature justificar.

## Fora do escopo

- **Emergency Pack** (export organizado para situações de emergência) — módulo distinto, referenciado no `CLAUDE.md` a par do Digital Estate mas com ficha própria futura; esta ficha só constrói os dados que o Emergency Pack viria a exportar
- **Mecanismo real de autenticação/convite para trusted people** (magic link ou conta própria) — ver questão em aberto nas Notas técnicas; esta ficha entrega o modelo de dados e a UI de gestão do lado do dono
- **Integração com APIs externas** de bancos, crypto exchanges ou registries de domínio para validar ou sincronizar automaticamente os dados de digital/financial assets — tudo é registo manual nesta ficha
- **Verificação automática de morte/inatividade** para accionar acesso das trusted people — explicitamente adiado no `CLAUDE.md` → "Não construir ainda"
- **Zelanna Agent** (Phase 6) — nenhuma acção automática (cancelamentos, alterações) sobre os dados de estate
- **Armazenamento de qualquer segredo** (passwords, seed phrases, private keys, banking credentials, recovery codes) — nunca, em nenhuma tabela desta ficha (`CLAUDE.md` → "O que NÃO ser")
- **Notificações push** para trusted people quando lhes é dado acesso — fora do escopo, pode ficar para quando o mecanismo de acesso real existir

## Próximo passo
/research Qual o mecanismo mínimo de acesso de uma trusted person (magic link sem conta própria vs. conta Supabase Auth própria com RLS estendido) que permite implementar um audit log real em `estate_access_log`, e como reaproveitar ao máximo `documents`/`DocumentType` (`src/types/documents.ts`) e o padrão de CRUD de `src/lib/coverage.ts` sem duplicar o pipeline de upload/extração já existente?
