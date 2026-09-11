# Zelanna

> **"Know what you own, what you pay for, what protects you, what needs your attention — and what happens if you can't manage it."**

App de **Personal Life Intelligence**: organiza, entende e conecta a informação que uma pessoa precisa administrar ao longo da vida — seguros, faturas, garantias, contratos, ativos e documentos.

Disponível em **iOS** e **Android** (sem web).

Mercado de validação: **Portugal**. Produto English-first, com expansão planeada para pt-PT, es-ES, fr-FR, de-DE.

---

## ⚠️ Estado do projecto

O scaffold do app (Expo + Expo Router + TypeScript) já está criado e a correr — navegação, tema e ecrãs-placeholder por feature. Mas o projecto continua em **Phase 0 — Manual Validation** (ver `CLAUDE.md`): antes de implementar lógica de produto a sério, a prioridade é validar as três hipóteses de valor (Coverage Check, Renewal/Price Increase Detection, Bills Intelligence) manualmente com 10–15 pessoas reais.

---

## Estrutura do projecto

```
zelanna/
├── app/                          → Expo Router — ecrãs e navegação (file-based)
│   ├── (auth)/                   → login, registo
│   ├── (dashboard)/              → tabs: dashboard, documents, coverage, bills, settings
│   └── onboarding/               → 3 passos (step1, step2, step3)
├── src/
│   ├── components/                → ui, documents, coverage, bills, dashboard (por implementar)
│   ├── hooks/                    → useAuth, useDocuments, useCoverageCheck, useBills, useInsights (por implementar)
│   ├── lib/                      → supabase, extraction (Vision LLM), rulesEngine, payments (por implementar)
│   ├── constants/theme.ts        → ✅ paleta, fontes, spacing (já criado)
│   └── types/                    → documents, coverage, bills, insights (por implementar)
├── supabase/
│   └── schema.sql                → schema + RLS (a criar)
├── app.json                      → configuração Expo (nome, bundle id, ícones)
└── package.json
```

Ver `CLAUDE.md` para o schema de base de dados completo e a arquitectura de IA (Vision LLM → Schema fixo → Rules Engine → LLM explica).

---

## Pré-requisitos

| Ferramenta | Versão mínima | Notas |
|---|---|---|
| Node.js | 20+ | `node -v` |
| npm | 10+ | `npm -v` |
| Xcode | 15+ | Só macOS — necessário para simulador iOS |
| Android Studio | Ladybug+ | Necessário para emulador Android |

---

## Instalação

```bash
# 1. Clonar o repositório
git clone <url-do-repo>
cd zelanna

# 2. Instalar dependências
npm install

# 3. Configurar variáveis de ambiente
cp .env.example .env
# Editar .env com as chaves reais do Supabase / Vision LLM / pagamentos
```

### Variáveis de ambiente necessárias (`.env`)

```env
EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJxxx...
```

> As chaves secretas (Vision LLM, pagamentos, Gmail) **nunca** vão para o cliente.
> Configura-as nas Edge Functions do Supabase: Dashboard → Edge Functions → Secrets.

---

## Correr o projecto

### 📷 Expo Go (forma mais rápida — sem emuladores)

```bash
npx expo start
```

Lê o QR code com a câmara (iOS) ou com a app Expo Go (Android).

### 📱 iOS (requer macOS + Xcode)

```bash
npm run ios
```

### 🤖 Android (requer Android Studio + AVD, ou telemóvel via USB)

```bash
npm run android
```

---

## Outros comandos úteis

```bash
# Verificar tipos TypeScript
npm run typecheck

# Lint
npm run lint

# Validar configuração do projeto Expo
npx expo-doctor
```

---

## Base de dados (Supabase)

```bash
# Aplicar o schema pela primeira vez
# 1. Ir ao Supabase Dashboard → SQL Editor
# 2. Copiar e executar o conteúdo de supabase/schema.sql
```

---

## Stack

| Camada | Tecnologia |
|---|---|
| Mobile | Expo (SDK 57) + React Native + Expo Router |
| Backend | Supabase (Auth + Postgres + Storage + Edge Functions) |
| IA — Extração | Vision-capable LLM |
| IA — Explicação | LLM (motor de cálculo é sempre determinístico) |
| Automação | n8n |
| Pagamentos | RevenueCat / in-app purchases (iOS StoreKit + Android Play Billing) |
| Linguagem | TypeScript |

---

## Paleta de cores

| Nome | Hex | Uso |
|---|---|---|
| Verde-carvão | `#131E15` | Background mais escuro |
| Verde-floresta | `#324138` | Cor primária — botões, CTAs, destaques |
| Verde-ardósia | `#5B685F` | Superfícies secundárias |
| Verde-pedra | `#859087` | Neutros médios |
| Verde-cinza claro | `#ADB5B0` | Bordas, separadores |
| Névoa | `#DBE0DF` | Background claro |
| Dourado | `#C9A15C` | Accent — alertas, badges, insights |
| Preto | `#000000` | Texto em fundos claros |
| Branco | `#FFFFFF` | Texto em fundos escuros |

**Tipografia:** Avenir (títulos) · Lato (corpo) — ainda por adicionar como fontes carregadas via `expo-font`.

---

*Desenvolvido por [mocruz](https://github.com/mocruz) — Henrique Espíndola Cruz*
