-- ============================================================================
--  Papéis de acesso da Inteligência de Calls / Operação Assistida (25/09/2026)
--    gestor       = Administrador: tudo + gerenciar usuários (aba 👥 Usuários)
--    vendedor     = Usuário: edita (fluxo de hoje)
--    marketing    = Usuário (legado)
--    visualizador = Somente visualização: lê tudo da empresa, não grava nada
--  Criar/editar/excluir usuário é só pela Edge Function `oa-usuarios` (service role).
--  Idempotente: pode rodar de novo.
-- ============================================================================

-- Quem pode gravar: qualquer papel da empresa, menos o visualizador.
create or replace function public.pode_editar()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select papel <> 'visualizador' from public.perfis where id = auth.uid()), false);
$$;
revoke execute on function public.pode_editar() from public, anon;
grant execute on function public.pode_editar() to authenticated;

-- Ninguém muda o próprio papel/empresa pelo app (antes o perfis_update_proprio permitia se promover a gestor).
-- A service role (Edge Function) não tem auth.uid() e continua podendo.
create or replace function public.perfis_protege_papel()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and (new.papel is distinct from old.papel or new.empresa is distinct from old.empresa) then
    raise exception 'Papel e empresa só mudam pela aba Usuários (administrador).';
  end if;
  return new;
end $$;
drop trigger if exists perfis_protege_papel on public.perfis;
create trigger perfis_protege_papel before update on public.perfis
  for each row execute function public.perfis_protege_papel();

-- Operação Assistida: escrita exige pode_editar().
do $$
declare t text;
begin
  for t in select distinct tablename from pg_policies where schemaname = 'public' and tablename like 'oa\_%' loop
    execute format('drop policy if exists %I_insert on public.%I', t, t);
    execute format('create policy %I_insert on public.%I for insert with check (empresa = public.minha_empresa() and public.pode_editar())', t, t);
    execute format('drop policy if exists %I_update on public.%I', t, t);
    execute format('create policy %I_update on public.%I for update using (empresa = public.minha_empresa() and public.pode_editar())', t, t);
    execute format('drop policy if exists %I_delete on public.%I', t, t);
    execute format('create policy %I_delete on public.%I for delete using (empresa = public.minha_empresa() and public.pode_editar())', t, t);
  end loop;
end $$;

-- Calls e participantes: visualizador também não grava.
drop policy if exists calls_insert_propria on public.calls;
create policy calls_insert_propria on public.calls for insert with check (user_id = auth.uid() and public.pode_editar());
drop policy if exists calls_update_propria on public.calls;
create policy calls_update_propria on public.calls for update using (user_id = auth.uid() and public.pode_editar());
drop policy if exists calls_delete_propria on public.calls;
create policy calls_delete_propria on public.calls for delete using (user_id = auth.uid() and public.pode_editar());

-- participantes só existe se o supabase/participantes.sql tiver rodado (em produção ainda não existe).
do $$
begin
  if to_regclass('public.participantes') is null then return; end if;
  execute 'drop policy if exists participantes_insert on public.participantes';
  execute 'create policy participantes_insert on public.participantes for insert with check (empresa = public.minha_empresa() and public.pode_editar())';
  execute 'drop policy if exists participantes_update on public.participantes';
  execute 'create policy participantes_update on public.participantes for update using (empresa = public.minha_empresa() and public.pode_editar())';
  execute 'drop policy if exists participantes_delete on public.participantes';
  execute 'create policy participantes_delete on public.participantes for delete using (empresa = public.minha_empresa() and public.pode_editar())';
end $$;

-- Acesso "só Operação Assistida" (app_metadata.acesso = 'oa'): não lê as calls.
drop policy if exists calls_select_empresa on public.calls;
create policy calls_select_empresa on public.calls for select
  using (empresa = public.minha_empresa() and coalesce(auth.jwt() -> 'app_metadata' ->> 'acesso', 'todos') <> 'oa');
