# /new-feature — Criar Ticket de Nova Feature

## Objectivo

Quando tiveres uma ideia ou feature para implementar, usa este comando para criar um ticket estruturado antes de entrar no ciclo Research → Plan → Implement.

---

## Instruções

Quando invocado com a descrição de uma feature, cria um ficheiro de ticket em `thoughts/shared/tickets/YYYY-MM-DD-[nome].md`.

### Formato do ticket

```markdown
---
data: [data actual]
status: backlog | em_progresso | concluido
prioridade: alta | media | baixa
fase_mvp: sim | nao (está no escopo do MVP?)
---

# Feature: [Nome da Feature]

## Contexto
[Por que esta feature existe? Que problema resolve para o utilizador?]

## Comportamento esperado
[Como funciona do ponto de vista do utilizador]

**Dado que** [contexto]
**Quando** [acção]
**Então** [resultado esperado]

## Critérios de aceitação
- [ ] [Critério verificável 1]
- [ ] [Critério verificável 2]
- [ ] [Critério verificável 3]

## Notas técnicas
[Considerações técnicas relevantes, dependências, riscos — ex: quota YouTube API, cache Spoonacular]

## Fora do escopo
[O que explicitamente NÃO faz parte desta feature]

## Próximo passo
/research [questão específica sobre esta feature]
```

---

## Exemplo de uso

```
/new-feature
Quero adicionar um ecrã onde o utilizador liga uma fatura, uma garantia e um seguro a um asset e pergunta se está coberto.
```

```
/new-feature
Detecção automática de aumento de preço quando aparecem duas faturas do mesmo fornecedor.
```

```
/new-feature
Dashboard de faturas de utilities com total mensal, evolução por categoria e anomalias destacadas.
```
