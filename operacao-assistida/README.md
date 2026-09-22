# Operação Assistida — módulo da Inteligência de Calls

Acompanhamento dos 30 dias pós-implantação: um card por cliente, fases por semana,
histórico de acionamentos, avanço automático por tempo, calendário, painel e integração com o Movidesk.

Servido em **`/operacao-assistida/`** ao lado do `index.html` da Inteligência de Calls.
Mesma origem → a sessão do Supabase é compartilhada; sem sessão, redireciona para o login.
Produção: https://era-calls-web.vercel.app/operacao-assistida/

## Rodar

```bash
cd operacao-assistida
npm install
npm run dev        # http://localhost:5174 — em dev não exige login e usa dados de exemplo (mock)
npm test           # regras de tempo (fase esperada, auto-avanço, saúde) — vitest
npm run build
```

`VITE_OA_REPO=supabase npm run dev` força o banco real em desenvolvimento.

Build de produção (Vercel): `node build.mjs` na raiz do repo gera `public_build/`
com as páginas estáticas + este app em `public_build/operacao-assistida/`. Deploy: `npx vercel --prod`.

## Persistência (mock → Supabase é só rodar o SQL)

| Situação | O que acontece |
|---|---|
| Tabelas `oa_*` **não** existem | módulo usa `MockRepository` (memória) e mostra a faixa "Dados de exemplo" |
| Tabelas existem | módulo usa `SupabaseRepository` automaticamente; primeiro acesso da empresa semeia o board padrão com as 6 fases |

Para ativar o banco: cole **`supabase/oa_schema.sql`** no SQL Editor do projeto `lhncmqqnyxqkxfhiafaz` e clique RUN.
É idempotente. Cria `oa_boards`, `oa_fases`, `oa_cards`, `oa_eventos`, `oa_templates`, `oa_visoes`, `oa_integracoes`,
todas com RLS por `empresa = public.minha_empresa()` (mesma regra das tabelas da Calls: todo mundo da empresa vê e edita).
Opcional: `public.oa_reconciliar()` + `pg_cron` para o auto-avanço rodar à meia-noite mesmo sem ninguém com a tela aberta
(a UI já reconcilia ao carregar e à meia-noite do navegador).

## Estrutura

```
src/
  domain/        tipos · seed das fases/templates · datas.ts (date-fns + fuso) · esteira.ts (fase esperada, reconciliação, saúde)
                 · filtros.ts · calendario.ts · prazo.ts — funções puras; esteira.test.ts
  data/          Repository (interface) · MockRepository · SupabaseRepository · index.ts (escolha automática)
  integrations/  IntegrationProvider · MockProvider · MovideskProvider (via Edge Function) · types.ts
  store/         uiStore (Zustand): visão ativa, filtros, seleção, undo/toasts, modais — só preferências de tela no localStorage
  features/      board (home, mutações otimistas, reconciliação) · kanban · card (painel, desfecho) · historico
                 · visoes (barra, filtros, visões salvas) · lista · timeline · calendario · painel · config · importacao · integracao
  ui/            AppShell (header + menu iguais à Calls), Badge/Avatar, MultiSelect, Toast
  styles/        tokens.css — espelho do :root da Inteligência de Calls
```

## Etapas entregues

1. ✅ Fundação — rota, item de menu, tipos, repository com mock, board semeado com as 6 fases
2. ✅ Kanban — colunas, cards, drag and drop (mouse/touch/teclado), quick add (`N`), painel de detalhe, undo
3. ✅ Tempo — prazos, saúde por regra, auto-avanço (ao carregar / meia-noite / botão), fixar, fila de finalização, modal de desfecho, selo "fora da esteira" + realinhar
4. ✅ Histórico — timeline por dia (sistema × manual), registro rápido por tipo (Ctrl+Enter), próxima ação (Registrar · Concluir · Editar), anexos
5. ✅ Visões — Kanban · Lista (ordenação, colunas, edição inline, lote, CSV/XLSX) · Linha do tempo · Calendário (mês/semana/agenda, entradas × saídas, saldo) · Painel; busca + filtros combináveis + visões salvas; última visão lembrada por usuário
6. ✅ Gerenciamento — editor de fases (drag, cor, duração, regra, WIP, checklist, arquivar, excluir com destino), ciclo/fuso/automação, templates (salvar / criar quadro), campos customizados, importação em lote (colar/CSV, prévia, mapeamento automático), duplicar
7. ✅ Integração — provider desacoplado, tela de configuração, vínculo de pessoa/organização, tickets no card, importar tickets como histórico (sem duplicar), criar ticket, sincronização manual/agendada/webhook, erro sempre visível

### Regras de tempo (`src/domain/esteira.ts`)
- **Fase esperada** = dias desde `dataEntrada` percorrendo `duracaoDias` das fases de entrada/andamento. Fase com regra `nunca` segura o card. Passou do fim → *aguardando finalização* (o sistema não finaliza sozinho).
- **Auto-avanço** só para frente, só `ativo`, nunca fixado/pausado, nunca entra na conclusão. Gera evento `sistema`.
- **Saúde**: vermelho = ciclo vencido · ação atrasada 2+ d · 3+ d atrás da esteira; amarelo = ciclo em ≤3 d · ação hoje/atrasada · atrás da esteira · pausado; verde = resto. `saudeManual` vence.

## Integração Movidesk

A UI nunca fala com a API do Movidesk: tudo passa pela **Edge Function `oa-movidesk`**
(`supabase/functions/oa-movidesk/index.ts`), que guarda o token como secret. Trocar o mock pelo real é só configuração:

```bash
supabase secrets set MOVIDESK_TOKEN=<token gerado em Configurações » Conta » Parâmetros » Token da API>
supabase functions deploy oa-movidesk
```

Depois, em **⇅ Integração** no módulo: Sistema = *Movidesk*, URL base, mapeamento (ou "Padrão Movidesk"), **Testar conexão**, Salvar.

### Endpoints usados (API pública v1, `token` na query string — só no servidor)

| Ação na UI | Método/rota Movidesk | Campos lidos |
|---|---|---|
| Buscar pessoa/organização (nome, CNPJ ou id) | `GET /persons?$filter=contains(businessName,'x') or contains(cpfCnpj,'x') or id eq 'x'` | `id, businessName, profileType (1 pessoa / 2 organização), cpfCnpj, emails[].email, phones[].number, organization.businessName` |
| Tickets do cliente | `GET /tickets?$filter=clients/any(c: c/id eq '<id>')&$expand=owner&$orderby=createdDate desc` | `id, subject, status, createdDate, lastUpdate, category, urgency, owner.businessName` |
| Criar ticket a partir de um acionamento | `POST /tickets` | envia `type:2, subject, category, status:'Novo', clients:[{id}], actions:[{type:2, origin:4, description}]` |
| Testar conexão | `GET /persons?$top=1&$select=id` | — |
| Webhook Ticket criado/atualizado | `POST https://<projeto>.supabase.co/functions/v1/oa-movidesk?webhook=1` | grava em `oa_eventos` (chave `movidesk:<ticketId>`, origem `integracao`) para todos os cards com `cliente_id` igual |

Mapeamento (card ← Movidesk), editável na tela: `clienteNome ← businessName`, `clienteId ← id`, `contatoNome ← contacts[0].businessName`,
`contatoEmail ← emails[0].email`, `contatoTelefone ← phones[0].number`, `segmento ← customFieldValues[<idDoCampo>]`, `produtoPlano ← customFieldValues[<idDoCampo>]`.

Deduplicação: eventos importados carregam `meta.ticketId`; a importação ignora tickets já presentes e o webhook usa `chave_externa` única.

Pontos que dependem de credencial real estão marcados com `// TODO: integração`:
`src/integrations/movideskProvider.ts` (chamadas), `supabase/functions/oa-movidesk/index.ts` (assinatura do webhook, agente padrão ao criar ticket),
`src/features/historico/RegistroRapido.tsx` (upload de anexo para o Storage).

## Atalhos e acessibilidade
`N` novo cliente · `Enter` cria e mantém aberto · `Esc` fecha · `Ctrl+Enter` salva acionamento · drag por teclado: Espaço → setas → Espaço ·
foco visível em tudo · `prefers-reduced-motion` respeitado · no mobile as colunas viram páginas por swipe.
