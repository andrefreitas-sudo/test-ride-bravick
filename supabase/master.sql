-- TEST RIDE BRAVICK — cria o perfil Master.
-- Antes: crie o usuário em Authentication > Users > Add user (marque "Auto Confirm User"),
-- usando o endereço andre@testride.bravick.com.br e uma senha sua.
-- Depois rode este script. O login no app passa a ser apenas: andre
insert into public.perfis (id, nome, usuario, email, perfil, ativo, deve_trocar_senha, todas_lojas)
select u.id, 'André Freitas', 'andre', lower(u.email), 'master', true, false, true
from auth.users u
where lower(u.email) in ('andre@testride.bravick.com.br', 'andre.freitas@bravick.com.br')
on conflict (id) do update set perfil = 'master', ativo = true, todas_lojas = true,
  usuario = coalesce(public.perfis.usuario, 'andre');

select usuario, email, perfil from public.perfis order by usuario;
