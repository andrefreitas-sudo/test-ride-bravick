-- =====================================================================
-- TEST RIDE BRAVICK
-- Script completo do banco (Supabase / Postgres)
-- Rodar inteiro no SQL Editor do Supabase. Pode ser executado de novo
-- com segurança (usa IF NOT EXISTS / OR REPLACE / DROP POLICY IF EXISTS).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. CADASTROS
-- ---------------------------------------------------------------------
create table if not exists public.lojas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cidade text not null,                      -- sai no termo (ex.: "São José do Rio Preto - SP")
  razao_social text not null default 'BRAVICK Comércio de Motos Ltda',
  limite_percurso text not null default 'Imediações da concessionária (raio de 5 km)',
  tempo_max_min int not null default 30 check (tempo_max_min between 5 and 120),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

insert into public.lojas (nome, cidade)
select v.nome, v.cidade
from (values
  ('Royal Enfield Rio Preto', 'São José do Rio Preto - SP'),
  ('Royal Enfield Presidente Prudente', 'Presidente Prudente - SP')
) as v(nome, cidade)
where not exists (select 1 from public.lojas);

create table if not exists public.perfis (
  id uuid primary key references auth.users(id) on delete restrict,
  nome text not null,
  email text not null,
  perfil text not null default 'vendedor' check (perfil in ('master','gestor','vendedor')),
  ativo boolean not null default true,
  deve_trocar_senha boolean not null default true,
  todas_lojas boolean not null default false,
  lojas uuid[] not null default '{}',
  ultimo_acesso timestamptz,
  criado_em timestamptz not null default now()
);

create table if not exists public.motos (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas(id),
  modelo text not null,
  placa text,
  ano int,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create index if not exists motos_loja_idx on public.motos (loja_id);

create table if not exists public.configuracoes (
  chave text primary key,
  valor jsonb not null,
  atualizado_em timestamptz not null default now()
);
insert into public.configuracoes (chave, valor) values
  ('retencao_cnh_dias', '45'::jsonb),
  ('cnh_obrigatoria', 'true'::jsonb),
  ('leitura_ia', 'false'::jsonb),
  ('mensagem_whatsapp', to_jsonb(
    E'Olá, {nome}! 👋\n\n' ||
    E'Agradecemos pela sua visita e pela oportunidade de realizar seu Test Ride conosco na {loja}.\n\n' ||
    E'Esperamos que a experiência tenha sido especial e que você tenha sentido a essência e o prazer únicos do universo Royal Enfield.\n\n' ||
    E'Seu termo do Test Ride está disponível no link abaixo:\n\n{link}\n\n' ||
    E'Nossa equipe permanece à disposição e será um prazer continuar acompanhando você nessa jornada sobre duas rodas 🏍️\n\n' ||
    E'Conte sempre conosco.'::text))
on conflict (chave) do nothing;

-- ---------------------------------------------------------------------
-- 2. FUNÇÕES DE PERMISSÃO (security definer: não dependem do RLS)
-- ---------------------------------------------------------------------
create or replace function public.e_ativo()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select ativo from public.perfis where id = auth.uid()), false)
$$;

create or replace function public.e_master()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select perfil = 'master' from public.perfis where id = auth.uid() and ativo), false)
$$;

create or replace function public.e_gestor()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select perfil in ('master','gestor') from public.perfis where id = auth.uid() and ativo), false)
$$;

create or replace function public.acessa_loja(l uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select perfil = 'master' or todas_lojas or l = any(lojas)
    from public.perfis where id = auth.uid() and ativo
  ), false)
$$;

-- ---------------------------------------------------------------------
-- 3. TEST RIDES
-- ---------------------------------------------------------------------
create table if not exists public.contadores (
  ano int primary key,
  ultimo int not null default 0
);

create table if not exists public.test_rides (
  id uuid primary key default gen_random_uuid(),
  numero text unique,
  status text not null default 'concluido' check (status in ('concluido','cancelado')),
  motivo_cancelamento text,
  -- Loja
  loja_id uuid not null references public.lojas(id),
  loja_nome text,
  cidade text,
  -- Responsável (usuário que conduziu o atendimento)
  vendedor_id uuid references public.perfis(id),
  vendedor_nome text,
  -- Moto
  moto_id uuid references public.motos(id) on delete set null,
  moto_modelo text not null,
  moto_placa text,
  -- Cliente
  cliente_nome text not null,
  cliente_cpf text not null,
  cliente_telefone text not null,
  cliente_email text,
  cliente_nascimento date,
  -- CNH
  cnh_numero text,
  cnh_categoria text not null check (cnh_categoria in ('A','AB','AC','AD','AE')),
  cnh_validade date not null,
  cnh_arquivo text,                -- caminho no bucket "cnh" (apagado após a retenção)
  cnh_arquivo_tipo text,
  cnh_enviada_em timestamptz,
  cnh_lida_por_ia boolean not null default false,
  -- Test ride
  saida_em timestamptz not null default now(),
  retorno_previsto_em timestamptz,
  tempo_max_min int not null default 30 check (tempo_max_min between 5 and 120),
  limite_percurso text,
  -- Assinaturas (imagem PNG em data URL) e termo
  assinatura_cliente text,
  assinatura_responsavel text,
  termo_arquivo text,              -- caminho no bucket "termos"
  token_termo text not null default replace(gen_random_uuid()::text, '-', '') unique,
  whatsapp_enviado_em timestamptz,
  -- Controle
  criado_por uuid not null default auth.uid() references public.perfis(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists test_rides_criado_idx on public.test_rides (criado_em desc);
create index if not exists test_rides_loja_idx on public.test_rides (loja_id);
create index if not exists test_rides_autor_idx on public.test_rides (criado_por);

-- Preenche número, loja e responsável no servidor (não confia no que vem do app)
create or replace function public.test_ride_antes_inserir()
returns trigger language plpgsql security definer set search_path = public as $$
declare a int := extract(year from now())::int; n int; l public.lojas; p public.perfis;
begin
  select * into p from public.perfis where id = auth.uid() and ativo;
  if p.id is null then raise exception 'Usuário sem acesso ativo.'; end if;
  select * into l from public.lojas where id = new.loja_id and ativo;
  if l.id is null then raise exception 'Loja inválida.'; end if;

  insert into public.contadores (ano, ultimo) values (a, 1)
    on conflict (ano) do update set ultimo = public.contadores.ultimo + 1
    returning ultimo into n;
  new.numero := 'TR-' || a || '-' || lpad(n::text, 4, '0');
  new.criado_por := p.id;
  new.vendedor_id := p.id;
  new.vendedor_nome := p.nome;
  new.loja_nome := l.nome;
  new.cidade := l.cidade;
  new.token_termo := replace(gen_random_uuid()::text, '-', '');
  new.criado_em := now();
  new.atualizado_em := now();
  new.retorno_previsto_em := new.saida_em + make_interval(mins => new.tempo_max_min);
  if new.cnh_validade < (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'CNH vencida.';
  end if;
  return new;
end $$;

drop trigger if exists trg_test_ride_antes_inserir on public.test_rides;
create trigger trg_test_ride_antes_inserir before insert on public.test_rides
  for each row execute function public.test_ride_antes_inserir();

-- Depois de assinado, o termo não muda: só contato, arquivos e status podem ser alterados
create or replace function public.test_ride_antes_alterar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.atualizado_em := now();
  if (new.numero, new.loja_id, new.loja_nome, new.cidade, new.vendedor_id, new.vendedor_nome, new.moto_modelo,
      new.cliente_nome, new.cliente_cpf, new.cnh_categoria, new.cnh_validade, new.saida_em, new.tempo_max_min,
      new.token_termo, new.criado_por, new.criado_em)
     is distinct from
     (old.numero, old.loja_id, old.loja_nome, old.cidade, old.vendedor_id, old.vendedor_nome, old.moto_modelo,
      old.cliente_nome, old.cliente_cpf, old.cnh_categoria, old.cnh_validade, old.saida_em, old.tempo_max_min,
      old.token_termo, old.criado_por, old.criado_em)
     or new.moto_placa is distinct from old.moto_placa
     or new.limite_percurso is distinct from old.limite_percurso
     or new.cnh_numero is distinct from old.cnh_numero
     or new.cliente_nascimento is distinct from old.cliente_nascimento
     or new.assinatura_cliente is distinct from old.assinatura_cliente
     or new.assinatura_responsavel is distinct from old.assinatura_responsavel then
    raise exception 'Os dados do termo assinado não podem ser alterados.';
  end if;
  if new.status is distinct from old.status and not public.e_gestor() then
    raise exception 'Somente o gestor pode cancelar um test ride.';
  end if;
  return new;
end $$;

drop trigger if exists trg_test_ride_antes_alterar on public.test_rides;
create trigger trg_test_ride_antes_alterar before update on public.test_rides
  for each row execute function public.test_ride_antes_alterar();

-- Quem pode ver um test ride (usado também pelos arquivos)
create or replace function public.acessa_test_ride(t public.test_rides)
returns boolean language sql stable security definer set search_path = public as $$
  select public.e_master()
      or (public.e_gestor() and public.acessa_loja(t.loja_id))
      or (public.e_ativo() and t.criado_por = auth.uid())
$$;

create or replace function public.acessa_arquivo(caminho text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare rid uuid;
begin
  begin
    rid := split_part(caminho, '/', 1)::uuid;
  exception when others then
    return false;
  end;
  return exists (select 1 from public.test_rides t where t.id = rid and public.acessa_test_ride(t));
end $$;

-- ---------------------------------------------------------------------
-- 4. AUDITORIA (registro permanente)
-- ---------------------------------------------------------------------
create table if not exists public.auditoria (
  id bigint generated always as identity primary key,
  tabela text not null,
  registro_id text,
  acao text not null,
  usuario_id uuid,
  usuario_nome text,
  dados jsonb,
  criado_em timestamptz not null default now()
);
create index if not exists auditoria_criado_idx on public.auditoria (criado_em desc);

create or replace function public.auditar()
returns trigger language plpgsql security definer set search_path = public as $$
declare antes jsonb; depois jsonb; quem text;
  fora text[] := array['assinatura_cliente','assinatura_responsavel','token_termo','atualizado_em'];
begin
  if tg_op <> 'INSERT' then antes := to_jsonb(old) - fora; end if;
  if tg_op <> 'DELETE' then depois := to_jsonb(new) - fora; end if;
  if tg_op = 'UPDATE' and antes = depois then return null; end if;
  if tg_op = 'UPDATE' and tg_table_name = 'perfis'
     and (antes - 'ultimo_acesso') = (depois - 'ultimo_acesso') then return null; end if;
  select nome into quem from public.perfis where id = auth.uid();
  insert into public.auditoria (tabela, registro_id, acao, usuario_id, usuario_nome, dados)
  values (tg_table_name, coalesce(depois->>'id', antes->>'id', depois->>'chave', antes->>'chave'), tg_op, auth.uid(), quem,
    case tg_op when 'INSERT' then depois when 'DELETE' then antes
      else jsonb_build_object('antes', antes, 'depois', depois) end);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['test_rides','motos','lojas','perfis','configuracoes'] loop
    execute format('drop trigger if exists trg_auditar on public.%I', t);
    execute format('create trigger trg_auditar after insert or update or delete on public.%I
      for each row execute function public.auditar()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 5. FUNÇÕES CHAMADAS PELO APP
-- ---------------------------------------------------------------------
create or replace function public.senha_trocada()
returns void language sql security definer set search_path = public as $$
  update public.perfis set deve_trocar_senha = false where id = auth.uid();
$$;

create or replace function public.registrar_acesso()
returns void language sql security definer set search_path = public as $$
  update public.perfis set ultimo_acesso = now() where id = auth.uid();
$$;

-- Fotos de CNH que já passaram do prazo de retenção (LGPD)
create or replace function public.cnh_vencidas()
returns table(id uuid, cnh_arquivo text)
language plpgsql stable security definer set search_path = public as $$
declare dias int;
begin
  if not public.e_gestor() then return; end if;
  select greatest(1, (c.valor #>> '{}')::int) into dias from public.configuracoes c where c.chave = 'retencao_cnh_dias';
  return query
    select t.id, t.cnh_arquivo from public.test_rides t
    where t.cnh_arquivo is not null
      and t.cnh_enviada_em < now() - make_interval(days => coalesce(dias, 45))
      and public.acessa_test_ride(t)
    limit 200;
end $$;

revoke execute on function public.cnh_vencidas() from anon, public;
grant execute on function public.cnh_vencidas() to authenticated;

-- ---------------------------------------------------------------------
-- 6. REGRAS DE ACESSO (RLS)
-- ---------------------------------------------------------------------
alter table public.lojas enable row level security;
alter table public.perfis enable row level security;
alter table public.motos enable row level security;
alter table public.configuracoes enable row level security;
alter table public.contadores enable row level security;
alter table public.test_rides enable row level security;
alter table public.auditoria enable row level security;

drop policy if exists ver on public.lojas;
create policy ver on public.lojas for select to authenticated using (public.e_ativo());
drop policy if exists gerir on public.lojas;
create policy gerir on public.lojas for all to authenticated using (public.e_master()) with check (public.e_master());

drop policy if exists ver on public.perfis;
create policy ver on public.perfis for select to authenticated using (id = auth.uid() or public.e_gestor());
drop policy if exists gerir on public.perfis;
create policy gerir on public.perfis for update to authenticated using (public.e_master()) with check (public.e_master());

drop policy if exists ver on public.motos;
create policy ver on public.motos for select to authenticated using (public.e_ativo());
drop policy if exists gerir on public.motos;
create policy gerir on public.motos for all to authenticated
  using (public.e_gestor() and public.acessa_loja(loja_id))
  with check (public.e_gestor() and public.acessa_loja(loja_id));

drop policy if exists ver on public.configuracoes;
create policy ver on public.configuracoes for select to authenticated using (public.e_ativo());
drop policy if exists gerir on public.configuracoes;
create policy gerir on public.configuracoes for all to authenticated using (public.e_master()) with check (public.e_master());

drop policy if exists ver on public.test_rides;
create policy ver on public.test_rides for select to authenticated using (public.acessa_test_ride(test_rides));
drop policy if exists criar on public.test_rides;
create policy criar on public.test_rides for insert to authenticated
  with check (public.e_ativo() and public.acessa_loja(loja_id));
drop policy if exists alterar on public.test_rides;
create policy alterar on public.test_rides for update to authenticated
  using (public.acessa_test_ride(test_rides)) with check (public.acessa_test_ride(test_rides));
drop policy if exists excluir on public.test_rides;
create policy excluir on public.test_rides for delete to authenticated using (public.e_master());

drop policy if exists ver on public.auditoria;
create policy ver on public.auditoria for select to authenticated using (public.e_master());

-- ---------------------------------------------------------------------
-- 7. ARQUIVOS (CNH e termos) — buckets privados
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('cnh', 'cnh', false, 10485760, array['image/jpeg','image/png','application/pdf']),
  ('termos', 'termos', false, 10485760, array['application/pdf'])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "trb ver arquivos" on storage.objects;
create policy "trb ver arquivos" on storage.objects for select to authenticated
  using (bucket_id in ('cnh','termos') and public.acessa_arquivo(name));
drop policy if exists "trb enviar arquivos" on storage.objects;
create policy "trb enviar arquivos" on storage.objects for insert to authenticated
  with check (bucket_id in ('cnh','termos') and public.acessa_arquivo(name));
drop policy if exists "trb trocar arquivos" on storage.objects;
create policy "trb trocar arquivos" on storage.objects for update to authenticated
  using (bucket_id in ('cnh','termos') and public.acessa_arquivo(name))
  with check (bucket_id in ('cnh','termos') and public.acessa_arquivo(name));
drop policy if exists "trb apagar arquivos" on storage.objects;
create policy "trb apagar arquivos" on storage.objects for delete to authenticated
  using (bucket_id in ('cnh','termos') and public.acessa_arquivo(name));

select 'TEST RIDE BRAVICK: banco pronto' as resultado;
