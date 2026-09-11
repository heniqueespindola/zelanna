# /handoff — Guardar Estado da Sessão

## Objectivo

Quando precisas de parar o trabalho a meio, guarda o estado completo para poderes retomar exactamente de onde ficaste numa sessão futura.

---

## Instruções

Cria um ficheiro em `thoughts/shared/handoffs/YYYY-MM-DD-HHmm-handoff.md`:

```markdown
---
data: [data e hora]
status: em_progresso
---

# Handoff: [Descrição do que estava a fazer]

## Estado actual
[O que estava a ser implementado neste momento]

## O que foi feito
- [x] [Tarefa concluída 1]
- [x] [Tarefa concluída 2]

## O que falta fazer
- [ ] [Próximo passo imediato]
- [ ] [Depois desse]

## Ficheiros modificados nesta sessão
- `path/ficheiro.tsx` — [o que foi alterado]
- `path/outro.ts` — [o que foi alterado]

## Ficheiros relevantes para retomar
- Spec activa: `thoughts/shared/plans/[ficheiro].md`
- Research: `thoughts/shared/research/[ficheiro].md`

## Contexto importante para retomar
[Decisões tomadas, edge cases descobertos, o que não está óbvio no código]

## Comando para retomar
/resume thoughts/shared/handoffs/[este-ficheiro].md
```

Depois de criar o ficheiro:
```
✅ Handoff guardado em thoughts/shared/handoffs/[ficheiro].md

Para retomar: /resume thoughts/shared/handoffs/[ficheiro].md
```
