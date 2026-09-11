# /implement — Implementar Spec (Fase 3 do SDD)

## Objectivo

Com base na Spec.md aprovada, implementa o código exactamente como especificado, fase a fase, verificando os critérios de sucesso antes de avançar.

---

## Pré-requisito

Este comando deve ser usado **depois** de:
1. Ter corrido `/plan` e gerado a Spec.md
2. O utilizador ter revisto e aprovado a spec
3. Ter feito `/clear` para limpar o contexto
4. Fornecer o caminho: `/implement thoughts/shared/plans/[ficheiro].md`

---

## Instruções

### 1. Lê a Spec.md completamente antes de começar
- Compreende todas as fases
- Identifica dependências entre ficheiros
- Verifica se tens toda a informação necessária

### 2. Implementa fase a fase

Para **cada fase**:

**a) Antes de implementar:**
- Lê os ficheiros existentes que vais modificar
- Confirma que o teu entendimento está correcto
- Se encontrares algo que contradiz a spec, para e comunica

**b) Durante a implementação:**
- Segue o path exacto especificado na spec
- Mantém o estilo de código existente (tabs vs spaces, convenções de naming)
- Nunca modifica ficheiros fora do escopo da spec
- Actualiza os checkboxes da spec conforme completas

**c) Depois de cada fase:**
Para automaticamente e informa:
```
✅ Fase [N] concluída — Pronto para verificação manual

Verificações automáticas:
- [ ] tsc --noEmit — [passou/falhou]
- [ ] expo lint — [passou/falhou]

Por favor verifica manualmente:
- [ ] [Item específico da spec]
- [ ] [Outro item]

Diz-me quando a verificação manual estiver concluída para avançar para a Fase [N+1].
```

### 3. Regras críticas desta fase
- ❌ **NÃO** faças refactoring de código fora do escopo
- ❌ **NÃO** "melhoraças" que não estão na spec
- ❌ **NÃO** continues para a próxima fase sem verificação manual aprovada
- ✅ Se a realidade diverge da spec, comunica antes de improvisar
- ✅ Mantém o contexto limpo — se estiveres a 50%+, usa `/compact`
- ✅ Actualiza o status da spec para `em_progresso` quando começas

### 4. Quando algo não está como na spec

Comunica claramente:
```
⚠️ Divergência encontrada na Fase [N]

Spec diz: [o que a spec especifica]
Realidade: [o que encontrei no código]
Impacto: [como isto afecta a implementação]

Opções:
A) [Abordagem alternativa] — [prós/contras]
B) [Outra abordagem] — [prós/contras]

Como devo prosseguir?
```

### 5. Conclusão da implementação

Quando todas as fases estiverem completas:
```
✅ Implementação completa!

Spec: thoughts/shared/plans/[ficheiro].md
Status actualizado para: completo

Resumo do que foi criado/modificado:
- [ficheiro1]: [o que foi feito]
- [ficheiro2]: [o que foi feito]

Verificação final recomendada:
1. Corre `npx expo start` e testa no simulador
2. Verifica todos os critérios manuais da spec
3. Corre `tsc --noEmit && expo lint`

Próximos passos sugeridos:
- /commit — para gerar mensagem de commit
- /research [próxima feature] — para continuar o desenvolvimento
```

---

## Padrões de código Zelanna

Segue sempre estes padrões ao implementar:

### Componentes React Native
```typescript
// Sempre TypeScript com tipos explícitos
interface Props {
  asset: Asset;
  status: 'covered' | 'expiring_soon' | 'not_covered';
  onCheck: () => void;
}

export function CoverageResult({ asset, status, onCheck }: Props) {
  // Hooks primeiro
  // Lógica depois
  // Return no fim
}
```

### Queries Supabase
```typescript
// Sempre com tratamento de erro
const { data, error } = await supabase
  .from('bills')
  .select('*')
  .eq('user_id', userId)
  .order('invoice_date', { ascending: false });

if (error) throw error;
```

### Rules Engine — cálculo determinístico
```typescript
// Nunca deixar o LLM calcular — percentagens, médias e comparações são sempre código
export function detectPriceIncrease(current: number, previous: number) {
  const percentIncrease = ((current - previous) / previous) * 100;
  const severity = percentIncrease > 25 ? 'critical' : percentIncrease > 10 ? 'warning' : 'info';
  return { percentIncrease, severity };
}
// O LLM entra depois, só para transformar o resultado já calculado em frase natural
```

### Chamadas à Vision LLM (extração de documentos)
```typescript
// Sempre via backend/Edge Function — nunca no client
// A chave da Vision LLM nunca vai para o frontend
// Output sempre validado contra o schema fixo antes de guardar em documents.extracted_data
```

### Chamadas à Stripe
```typescript
// Sempre via backend — nunca no client
// A chave secreta da Stripe nunca vai para o frontend
// Webhooks confirmam o plano antes de actualizar profiles/users
```

---

## Exemplo de uso

```
/implement thoughts/shared/plans/2026-06-03-coverage-check.md
```

```
/implement thoughts/shared/plans/2026-06-03-bills-dashboard.md fase 1
```
