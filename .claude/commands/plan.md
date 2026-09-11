# /plan — Criar Spec de Implementação (Fase 2 do SDD)

## Objectivo

Com base no PRD.md gerado na fase de research, cria uma spec detalhada e táctica que diz **exactamente** o que criar e modificar em cada ficheiro. **Não implementes nada nesta fase.**

---

## Pré-requisito

Este comando deve ser usado **depois** de:
1. Ter corrido `/research` e gerado o PRD.md
2. Ter feito `/clear` para limpar o contexto
3. Fornecer o caminho do PRD.md: `/plan thoughts/shared/research/[ficheiro].md`

---

## Instruções

### 1. Lê o PRD.md fornecido
- Analisa completamente o ficheiro de research
- Identifica todos os ficheiros afectados
- Compreende os padrões existentes a seguir

### 2. Questiona antes de planear (se necessário)
Se houver questões em aberto no PRD, pergunta ao utilizador:
```
Antes de criar a spec, preciso de clarificar:

1. [Questão técnica específica]
   Opção A: [descrição] — [prós/contras]
   Opção B: [descrição] — [prós/contras]

2. [Outra questão]

Qual preferes?
```

### 3. Cria a spec táctica

A spec deve ser **extremamente específica**:
- Path completo de cada ficheiro
- O que fazer em cada ficheiro (criar, modificar, deletar)
- Code snippets quando relevante para clareza
- Critérios de sucesso verificáveis

### 4. Regras críticas desta fase
- ❌ **NÃO** implementes código real
- ❌ **NÃO** sejas vago — "adicionar lógica de pesquisa" não é suficiente
- ✅ **SIM** — "em `hooks/useCoverageCheck.ts`, adicionar função `checkCoverage(assetId: string): Promise<CoverageResult>`"
- ✅ Cada ficheiro tem path completo + acção específica
- ✅ Fases ordenadas por dependência (o que tem de existir primeiro)

### 5. Output — ficheiro Spec.md

Guarda em `thoughts/shared/plans/YYYY-MM-DD-[nome-da-feature].md`:

```markdown
---
data: [data actual]
feature: "[nome da feature]"
research: "thoughts/shared/research/[ficheiro-research].md"
status: aguarda_implementacao
---

# Spec: [Nome da Feature]

## Visão Geral
[1-2 frases — o que esta spec implementa]

## Ficheiros a Criar

### `caminho/completo/ficheiro.tsx`
**Propósito:** [O que este ficheiro faz]
**Conteúdo:**
- [Item específico 1]
- [Item específico 2]
- [Code snippet se necessário para clareza]

## Ficheiros a Modificar

### `caminho/completo/existente.ts`
**Modificações:**
- [ ] Linha 45: adicionar import `{ checkCoverage } from '../lib/rulesEngine'`
- [ ] Função `handleCheck`: adicionar validação de asset seleccionado
- [ ] Exportar novo tipo `CoverageResult`

## Fases de Implementação

### Fase 1: [Nome] — [O que resolve]
**Ficheiros:**
- Criar `X`
- Modificar `Y`

**Critérios de sucesso (automáticos):**
- [ ] `tsc --noEmit` passa sem erros
- [ ] `expo lint` passa sem warnings

**Critérios de sucesso (manuais):**
- [ ] [Acção no simulador que deve funcionar]
- [ ] [Outro comportamento esperado]

### Fase 2: [Nome] — [O que resolve]
[mesma estrutura...]

## Estratégia de Testes
- **Unit:** [O que testar]
- **Manual:** [Passos específicos no simulador]

## Notas de Implementação
[Decisões técnicas importantes, edge cases, armadilhas a evitar]
[Ex: separação estrita entre cálculo determinístico (rules engine) e explicação LLM, limites de quota da Vision LLM, RLS]

## Referências
- Research: `thoughts/shared/research/[ficheiro].md`
- Padrão similar: `[ficheiro:linha]`
```

### 6. Depois de gerar a Spec.md

```
✅ Spec criada.
Ficheiro: thoughts/shared/plans/[nome].md

Revisão necessária:
- As fases estão bem ordenadas?
- Os critérios de sucesso são específicos o suficiente?
- Falta algum edge case?

Próximo passo (quando aprovado):
1. Faz /clear para limpar o contexto
2. Usa /implement com o ficheiro da spec
```

---

## Exemplo de uso

```
/plan thoughts/shared/research/2026-06-03-coverage-check.md
```
