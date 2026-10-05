# Operação Assistida — módulo da Inteligência de Calls

Acompanhamento pós-implantação (desde 24/09/2026: Kick-off + 2 semanas, ciclo de 16 dias): um card por cliente, fases por semana,
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
| Tabelas existem | módulo usa `SupabaseRepository` automaticamente; primeiro acesso da empresa semeia o board padrão (Kick-off + Semana 1 + Semana 2 + Finalização) |

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

### Esteira de 2 semanas, cores e responsável (24/09/2026)
- Padrão: Entrada/Kick-off (2 d) → Semana 1 (7 d) → Semana 2 (7 d) → Finalização; uma cor por etapa (azul, ciano, verde, roxo).
- Quadro antigo de 4 semanas é ajustado sozinho na 1ª abertura (`features/board/migracao2s.ts`): Semana 3/4 arquivadas,
  cards delas para a Semana 2, ciclo 16 d, saída prevista recalculada só onde seguia o ciclo antigo. Marca `esteiraVersao='2s'`;
  quadros criados por template já nascem marcados (o de 30 dias continua disponível).
- Cor do card e responsável sem login ficam em `camposCustomizados` (`_cor`, `_responsavel_nome`) — sem migração de banco.
  Responsável: usuário da plataforma (tabela `perfis` da empresa) ou "Outro (digitar nome)".

### Kick-off de 1 semana (02/10/2026)
- Kick-off passou de 2 para **7 dias** (acompanhamento preliminar antes da Semana 1); ciclo padrão **21 d** (`KICKOFF_DIAS`, `CICLO_2_SEMANAS` em `domain/seed.ts`).
- Quadro no ar é ajustado sozinho na 1ª abertura (`ajustarEsteira` em `features/board/migracao2s.ts`): Kick-off → 7 d, cards ativos
  e não fixados que estavam na Semana 1 com menos de 7 dias desde a entrada voltam para o Kick-off (com evento no histórico),
  saída prevista 16 → 21 d só onde seguia o ciclo antigo. Marca `esteiraVersao='2s-k7'`. Quadros de 30/60 dias não são mexidos.

### Vendedor, TIP e integração (05/10/2026)
Três dados comerciais por cliente, pedidos para a reunião de acompanhamento (`src/domain/comercial.ts`):
**vendedor interno** (Nicole · Junior Salim · Gustavo), **cliente da TIP** (parceiro) e **integração** (sim/não + qual).

- Guardados em `camposCustomizados` com chave reservada (`_vendedor`, `_tip`, `_integracao`, `_integracao_qual`),
  do mesmo jeito que a cor e o responsável digitado: **sem migração de banco** e sem virar campo customizado do board.
- Aparecem como selo no card do kanban, bloco "Comercial" no painel do cliente, três colunas com edição inline na Lista
  (e ação em lote para vendedor e TIP), três filtros na barra (Vendedor · Origem · Integração), na busca livre,
  na exportação CSV/XLSX e no mapeamento da importação em lote (aceita "sim/s/x/1" e casa o primeiro nome do vendedor).
- Para mudar quem são os vendedores internos, edite `VENDEDORES_INTERNOS` em `domain/comercial.ts`.
- Preenchimento é **manual**. O vendedor e a origem TIP também existem no assunto do ticket do Movidesk
  (`código | TIPO | cliente | vendedor`, ver `ERAREASON/movidesk_sync.py`) e a integração aparece como categoria/serviço
  "Integração" e "Ativação de CRM" — é de lá que dá para preencher sozinho mais adiante.

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
