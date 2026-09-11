---
data: 2026-09-11
status: backlog
prioridade: alta
fase_mvp: sim
---

# Feature: Autenticação (Login, Registo e Protecção de Rotas)

## Contexto

O Zelanna lida com informação sensível do utilizador — seguros, ativos, documentos, dados financeiros e familiares. Antes de qualquer feature de produto (Coverage Check, Bills Intelligence, etc.) poder ser testada em validação manual (Phase 0) ou implementada (Phase 1), é necessário que cada utilizador tenha uma conta própria, isolada por Row Level Security no Supabase, e que só aceda ao dashboard depois de autenticado.

Sem autenticação funcional, não há como:
- Associar documentos, ativos, contratos e faturas a um `user_id` real
- Garantir RLS (`users` só acede aos seus próprios dados, conforme `## Segurança` e `## Regras de desenvolvimento` do CLAUDE.md)
- Avançar com onboarding (`app/onboarding/step1.tsx` a `step3.tsx`) que assume um utilizador autenticado

Esta feature é fundação técnica — não é uma feature de "intelligence", mas é bloqueadora para todo o resto do scaffold (`(dashboard)/*`, `onboarding/*`) que já existe como placeholder.

## Comportamento esperado

Do ponto de vista do utilizador:

**Dado que** um novo utilizador abre a app pela primeira vez
**Quando** navega para o ecrã de registo e submete email + password válidos
**Então** a conta é criada no Supabase Auth, a sessão é iniciada, e o utilizador é redireccionado automaticamente para o dashboard (ou para o onboarding, se for a primeira vez)

**Dado que** um utilizador já registado abre a app
**Quando** introduz email + password correctos no ecrã de login
**Então** a sessão é criada e o utilizador é redireccionado automaticamente para `(dashboard)`

**Dado que** um utilizador introduz credenciais inválidas (email inexistente, password errada, email mal formatado)
**Quando** submete o formulário
**Então** vê uma mensagem de erro clara e específica, sem expor detalhes técnicos do Supabase

**Dado que** um utilizador não autenticado tenta aceder directamente a qualquer rota dentro de `(dashboard)` (ex: `/bills`, `/coverage`, `/settings`)
**Quando** a rota é carregada
**Então** é redireccionado automaticamente para `(auth)/login`, sem ver conteúdo do dashboard

**Dado que** um utilizador autenticado reabre a app depois de fechar (sessão válida persistida)
**Quando** a app arranca
**Então** é redireccionado directamente para `(dashboard)`, sem passar por login novamente

**Dado que** um utilizador autenticado faz logout (a partir de `settings.tsx`)
**Quando** confirma a acção
**Então** a sessão é terminada e é redireccionado para `(auth)/login`

## Critérios de aceitação

- [ ] Ecrã `app/(auth)/login.tsx` funcional: campos email + password, validação de formulário, submissão via Supabase Auth (`signInWithPassword`), estado de loading, mensagens de erro
- [ ] Ecrã `app/(auth)/register.tsx` funcional: campos email + password (+ confirmação de password), validação, submissão via Supabase Auth (`signUp`), estado de loading, mensagens de erro
- [ ] Hook `src/hooks/useAuth.ts` criado: expõe `user`, `session`, `loading`, `signIn`, `signUp`, `signOut`, e escuta mudanças de sessão (`onAuthStateChange`)
- [ ] Cliente Supabase configurado em `src/lib/supabase.ts` (usa `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_ANON_KEY`, persistência de sessão via `AsyncStorage` — obrigatório em React Native/Expo)
- [ ] `app/index.tsx` liga-se ao `useAuth`: redirecciona para `(dashboard)` se autenticado, para `(auth)/login` caso contrário, mostra estado de loading enquanto a sessão inicial é resolvida
- [ ] Protecção de rotas: nenhuma rota dentro de `(dashboard)/*` é acessível sem sessão válida — redirecciona para login (via layout guard em `(dashboard)/_layout.tsx` ou equivalente)
- [ ] Link/navegação entre login ↔ registo nos dois ecrãs
- [ ] Logout implementado (mínimo: acção em `settings.tsx`, pode ser um botão simples nesta fase)
- [ ] UI segue a paleta Zelanna: fundo `#131E15`, botões primários `#324138`, accent `#C9A15C` para links/destaques (ex: "Esqueci-me da password", "Criar conta"), texto branco (`#FFFFFF`) sobre fundo escuro — usar tokens de `src/constants/theme.ts`, nunca hexadecimais soltos no componente
- [ ] Tipografia: títulos com `fonts.display` (Avenir), corpo/inputs/labels com `fonts.body` (Lato) — usar tokens de `theme.ts`
- [ ] Erros do Supabase traduzidos para mensagens amigáveis (não mostrar strings de erro cruas da API)
- [ ] `tsc --noEmit` sem erros antes de commit (regra do projecto)
- [ ] RLS confirmada: qualquer tabela nova ou existente que dependa de `user_id` continua a filtrar correctamente pelo utilizador autenticado (sem bypass)

## Notas técnicas

- **Persistência de sessão em Expo/React Native:** o cliente Supabase por defeito usa `localStorage`, que não existe em React Native — é necessário configurar `AsyncStorage` (`@react-native-async-storage/async-storage`) como storage adapter ao criar o cliente em `src/lib/supabase.ts`, com `autoRefreshToken: true` e `persistSession: true`. Sem isto a sessão não sobrevive a reinícios da app.
- **Redireccionamento com Expo Router:** usar `router.replace()` (não `router.push()`) nos redirects de auth, para não deixar o ecrã de login/registo na stack de navegação (evitar "voltar" para login depois de autenticado).
- **Guard de rotas:** decidir entre (a) verificar sessão no `(dashboard)/_layout.tsx` com redirect condicional, ou (b) usar `Stack.Protected`/lógica equivalente do Expo Router mais recente. Confirmar qual abordagem está disponível na versão de Expo Router usada no scaffold antes de implementar (Expo SDK 57).
- **Onboarding vs Dashboard directo:** o CLAUDE.md refere `app/onboarding/step1.tsx` a `step3.tsx` como parte do fluxo inicial. Esta feature assume que, no MVP desta ficha, um novo registo vai directo para `(dashboard)` — a decisão de intercalar onboarding fica fora de escopo aqui e deve ser tratada como feature separada (ver `## Fora do escopo`).
- **Confirmação de email:** por defeito, o Supabase Auth pode exigir confirmação de email antes do login funcionar. Decidir e documentar se a confirmação de email fica activa já nesta fase de validação (Phase 0/MVP) ou se é desactivada nas definições do projecto Supabase para reduzir fricção nos testes com os 10–15 participantes da Phase 0. **Isto é uma decisão a validar com o utilizador/founder antes de implementar**, pois afecta a configuração do projecto Supabase e a experiência de registo.
- **Dependência de setup:** esta feature está bloqueada até o projecto Supabase estar criado (região EU) e o `.env` preenchido com `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` reais (ver checklist "Setup ainda por fazer" no CLAUDE.md).
- **Componentes UI reutilizáveis:** esta feature é boa candidata para criar os primeiros componentes em `src/components/ui/` (Button, Input) já que ainda não existem — devem ser desenhados para reutilização por todas as features seguintes, não apenas para os ecrãs de auth.
- **Sem `any` nem `@ts-ignore`** — tipar respostas do Supabase Auth (`Session`, `User` importados de `@supabase/supabase-js`).

## Fora do escopo

- Login social (Google, Apple, etc.) — não mencionado nos requisitos, avaliar como feature separada se necessário
- Recuperação de password ("Esqueci-me da password") — pode ser mencionado como link na UI mas o fluxo completo (reset por email) não está incluído nesta ficha
- MFA (Multi-Factor Authentication) — referido no CLAUDE.md como requisito de segurança geral do produto, mas não faz parte desta primeira implementação; deve ser tratado em ficha própria antes do lançamento público
- Onboarding (`app/onboarding/*`) — fluxo de boas-vindas e primeiro upload fica fora desta ficha, apenas o redireccionamento pós-login/registo para o dashboard está incluído
- Gestão de perfil (alterar nome, avatar, alterar password a partir de definições) — fora de escopo, apenas login/registo/logout
- Deep linking / verificação de email via link mágico — decisão de confirmação de email é apenas ligar/desligar, não construir o fluxo de verificação customizado
- Auditoria/logs de login (audit logs mencionados no CLAUDE.md como requisito geral de segurança) — não faz parte desta ficha inicial

## Próximo passo
/research Como configurar o cliente Supabase Auth em Expo/React Native (SDK 57) com persistência de sessão via AsyncStorage, e qual o padrão recomendado de protecção de rotas com Expo Router para o grupo `(dashboard)` deste scaffold?
