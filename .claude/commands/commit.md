# /commit — Gerar Mensagem de Commit

## Objectivo

Analisa as mudanças staged (git diff --staged) e gera uma mensagem de commit clara, em português europeu, seguindo o padrão do projecto.

---

## Instruções

1. Corre `git diff --staged` para ver o que está staged
2. Analisa as mudanças
3. Gera uma mensagem de commit no formato:

```
tipo: descrição curta e clara em pt-PT

- detalhe específico do que foi alterado
- outro detalhe relevante
- [se resolve um ticket]: resolve #123
```

### Tipos válidos
- `feat` — nova funcionalidade
- `fix` — correcção de bug
- `chore` — manutenção, dependências, configuração
- `docs` — documentação
- `style` — formatação, sem mudança de lógica
- `refactor` — refactoring sem nova feature ou fix
- `test` — adição ou correcção de testes
- `perf` — melhoria de performance

### Regras
- Primeira linha: máximo 72 caracteres
- Imperativo: "adiciona" não "adicionado"
- Em português europeu
- Específico: "adiciona pesquisa de receitas por ingrediente" não "actualiza código"

---

## Exemplo de output

```
feat: adiciona ecrã de pesquisa de receitas por ingredientes

- cria componente IngredientSearch com input e sugestões
- adiciona validação de ingredientes mínimos (pelo menos 1)
- integra hook useRecipeSearch para chamadas à Spoonacular API
- destaca ingredientes em falta da despensa com indicador visual
```

Depois de gerar a mensagem, pergunta:
```
Mensagem gerada acima. Queres que execute o commit?
Se sim, diz "sim" e corro: git commit -m "..."
```
