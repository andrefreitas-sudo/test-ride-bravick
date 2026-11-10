-- TEST RIDE BRAVICK — cria o perfil Master.
-- Antes: crie o usuário em Authentication > Users > Add user (marque "Auto Confirm User").
-- Depois rode este script. deve_trocar_senha = true: o app pede nova senha no primeiro acesso.
insert into public.perfis (id, nome, email, perfil, ativo, deve_trocar_senha, todas_lojas)
select u.id, 'André Freitas', lower(u.email), 'master', true, true, true
from auth.users u
where lower(u.email) in ('andre.freitas@bravick.com.br')
on conflict (id) do update set perfil = 'master', ativo = true, todas_lojas = true, deve_trocar_senha = true;

select email, perfil, deve_trocar_senha from public.perfis order by email;
