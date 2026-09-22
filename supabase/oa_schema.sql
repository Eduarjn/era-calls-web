-- ============================================================
--  OPERAÇÃO ASSISTIDA — esquema do banco (Supabase / Postgres)
--  Cole no SQL Editor do projeto lhncmqqnyxqkxfhiafaz e clique RUN.
--  Idempotente: seguro rodar de novo. Depende de public.minha_empresa()
--  e public.perfis, criados por transcritor/supabase/schema.sql.
-- ============================================================

-- ----- Boards -----
create table if not exists public.oa_boards (
  id            uuid primary key default gen_random_uuid(),
  empresa       text not null default public.minha_empresa(),
  nome          text not null,
  descricao     text,
  configuracoes jsonb not null default '{"duracaoCicloDias":30,"automacaoAtiva":true,"fusoHorario":"America/Sao_Paulo"}',
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- ----- Fases (colunas) -----
create table if not exists public.oa_fases (
  id               uuid primary key default gen_random_uuid(),
  board_id         uuid not null references public.oa_boards(id) on delete cascade,
  empresa          text not null default public.minha_empresa(),
  nome             text not null,
  ordem            integer not null default 0,
  cor              text not null default '#2F62B8',
  tipo             text not null default 'andamento',   -- entrada | andamento | conclusao
  duracao_dias     integer not null default 7,
  regra_auto_avanco jsonb not null default '{"tipo":"apos_dias_na_fase"}',
  limite_wip       integer,
  checklist_padrao jsonb not null default '[]',
  arquivada        boolean not null default false
);
create index if not exists oa_fases_board_idx on public.oa_fases (board_id, ordem);

-- ----- Cards (clientes em operação assistida) -----
create sequence if not exists public.oa_codigo_seq;

create table if not exists public.oa_cards (
  id                  uuid primary key default gen_random_uuid(),
  board_id            uuid not null references public.oa_boards(id) on delete cascade,
  empresa             text not null default public.minha_empresa(),
  codigo              text not null unique default ('OA-' || lpad(nextval('public.oa_codigo_seq')::text, 4, '0')),
  cliente_nome        text not null,
  cliente_id          text,                               -- id externo (Movidesk)
  contato_principal   jsonb,
  segmento            text,
  produto_plano       text,
  responsavel_id      uuid references public.perfis(id) on delete set null,
  co_responsaveis_ids uuid[] not null default '{}',
  data_entrada        timestamptz not null default now(),
  data_prevista_saida timestamptz not null,
  data_saida_real     timestamptz,
  fase_id             uuid not null references public.oa_fases(id),
  data_entrada_na_fase timestamptz not null default now(),
  status              text not null default 'ativo',      -- ativo | pausado | finalizado | cancelado
  resultado_final     text,                               -- estabilizado | prorrogado | escalado | churn
  justificativa_resultado text,
  prioridade          text not null default 'media',
  saude               text not null default 'verde',
  saude_manual        text,
  tags                text[] not null default '{}',
  travado_manualmente boolean not null default false,
  checklist           jsonb not null default '[]',
  anexos              jsonb not null default '[]',
  campos_customizados jsonb not null default '{}',
  proxima_acao        jsonb,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now()
);
create index if not exists oa_cards_board_idx on public.oa_cards (board_id, status);
create index if not exists oa_cards_cliente_id_idx on public.oa_cards (cliente_id);

-- ----- Eventos (histórico de acionamentos) -----
create table if not exists public.oa_eventos (
  id                 uuid primary key default gen_random_uuid(),
  card_id            uuid not null references public.oa_cards(id) on delete cascade,
  empresa            text not null default public.minha_empresa(),
  tipo               text not null,                      -- ligacao | email | reuniao | ticket | whatsapp | nota | mudanca_de_fase | sistema
  titulo             text not null,
  descricao          text,
  data_hora          timestamptz not null default now(),
  autor_id           uuid references public.perfis(id) on delete set null,
  autor_nome         text,
  duracao_min        integer,
  anexos             jsonb not null default '[]',
  link_externo       text,
  origem             text not null default 'manual',     -- manual | integracao
  gerado_pelo_sistema boolean not null default false,
  meta               jsonb,
  chave_externa      text unique                         -- ex.: movidesk:<ticketId> (deduplicação do webhook)
);
create index if not exists oa_eventos_card_idx on public.oa_eventos (card_id, data_hora desc);

-- ----- Templates de board -----
create table if not exists public.oa_templates (
  id            uuid primary key default gen_random_uuid(),
  empresa       text not null default public.minha_empresa(),
  nome          text not null,
  descricao     text,
  configuracoes jsonb not null,
  fases         jsonb not null,
  criado_em     timestamptz not null default now()
);

-- ----- Visões salvas -----
create table if not exists public.oa_visoes (
  id        uuid primary key default gen_random_uuid(),
  board_id  uuid not null references public.oa_boards(id) on delete cascade,
  empresa   text not null default public.minha_empresa(),
  nome      text not null,
  visao     text not null,
  filtros   jsonb not null,
  criado_em timestamptz not null default now()
);

-- ----- Configuração da integração (sem credencial: o token é secret da Edge Function) -----
create table if not exists public.oa_integracoes (
  board_id        uuid primary key references public.oa_boards(id) on delete cascade,
  empresa         text not null default public.minha_empresa(),
  provider        text not null default 'mock',
  ativa           boolean not null default true,
  url_base        text not null default 'https://api.movidesk.com/public/v1',
  mapeamento      jsonb not null default '{}',
  agendamento_min integer not null default 0,
  ultima_sync     timestamptz,
  ultimo_erro     text
);

-- ----- atualizado_em automático -----
create or replace function public.oa_touch()
returns trigger language plpgsql as $$
begin new.atualizado_em = now(); return new; end; $$;

drop trigger if exists oa_boards_touch on public.oa_boards;
create trigger oa_boards_touch before update on public.oa_boards for each row execute function public.oa_touch();
drop trigger if exists oa_cards_touch on public.oa_cards;
create trigger oa_cards_touch before update on public.oa_cards for each row execute function public.oa_touch();

-- ----- RLS: todo mundo da empresa enxerga e mantém (o brief pede acesso para todos) -----
do $$
declare t text;
begin
  foreach t in array array['oa_boards','oa_fases','oa_cards','oa_eventos','oa_templates','oa_visoes','oa_integracoes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format('create policy %I_select on public.%I for select using (empresa = public.minha_empresa())', t, t);
    execute format('drop policy if exists %I_insert on public.%I', t, t);
    execute format('create policy %I_insert on public.%I for insert with check (empresa = public.minha_empresa())', t, t);
    execute format('drop policy if exists %I_update on public.%I', t, t);
    execute format('create policy %I_update on public.%I for update using (empresa = public.minha_empresa())', t, t);
    execute format('drop policy if exists %I_delete on public.%I', t, t);
    execute format('create policy %I_delete on public.%I for delete using (empresa = public.minha_empresa())', t, t);
  end loop;
end $$;

-- ----- Reconciliação à meia-noite também no servidor (opcional; exige extensão pg_cron) -----
-- A UI já reconcilia ao carregar e à meia-noite do navegador. Para garantir mesmo sem ninguém
-- com a tela aberta, ative pg_cron no painel do Supabase e agende a função abaixo.
create or replace function public.oa_reconciliar()
returns integer language plpgsql security definer set search_path = public as $$
declare
  c record; f record; movidos integer := 0; dias integer; acumulado integer; alvo uuid; alvo_nome text; atual_ordem integer;
begin
  for c in select ca.*, b.configuracoes as cfg from oa_cards ca join oa_boards b on b.id = ca.board_id
           where ca.status = 'ativo' and not ca.travado_manualmente and coalesce((b.configuracoes->>'automacaoAtiva')::boolean, true) loop
    dias := greatest(0, (date(now() at time zone coalesce(c.cfg->>'fusoHorario','America/Sao_Paulo'))
                        - date(c.data_entrada at time zone coalesce(c.cfg->>'fusoHorario','America/Sao_Paulo'))));
    acumulado := 0; alvo := null;
    select ordem into atual_ordem from oa_fases where id = c.fase_id;
    for f in select * from oa_fases where board_id = c.board_id and not arquivada and tipo <> 'conclusao' order by ordem loop
      if f.regra_auto_avanco->>'tipo' = 'nunca' then alvo := f.id; alvo_nome := f.nome; exit; end if;
      acumulado := acumulado + greatest(0, f.duracao_dias);
      if dias < acumulado then alvo := f.id; alvo_nome := f.nome; exit; end if;
      alvo := f.id; alvo_nome := f.nome;   -- passou do fim: fica na última (aguardando finalização)
    end loop;
    if alvo is not null and alvo <> c.fase_id and (select ordem from oa_fases where id = alvo) > coalesce(atual_ordem, -1) then
      update oa_cards set fase_id = alvo, data_entrada_na_fase = now() where id = c.id;
      insert into oa_eventos (card_id, empresa, tipo, titulo, descricao, autor_nome, origem, gerado_pelo_sistema, meta)
      values (c.id, c.empresa, 'mudanca_de_fase', 'Avançou automaticamente para ' || alvo_nome, 'Pelo tempo decorrido desde a entrada.', 'Sistema', 'manual', true,
              jsonb_build_object('deFaseId', c.fase_id, 'paraFaseId', alvo, 'automatico', true));
      movidos := movidos + 1;
    end if;
  end loop;
  return movidos;
end $$;

-- security definer + roda em todas as empresas: só o servidor (pg_cron) pode chamar, nunca a API.
revoke execute on function public.oa_reconciliar() from public, anon, authenticated;

-- Para agendar (depois de ativar pg_cron em Database » Extensions):
-- select cron.schedule('oa-reconciliar', '5 3 * * *', $$select public.oa_reconciliar()$$);  -- 03:05 UTC = 00:05 em São Paulo

-- Fim. ✅
