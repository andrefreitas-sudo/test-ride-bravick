// TEST RIDE BRAVICK — Edge Function "admin-usuarios"
// Somente o Master pode chamar. Ações: criar, redefinir_senha, definir_ativo.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// PIN de 6 números — é o que a pessoa digita para entrar.
function senhaTemporaria(): string {
  const buf = new Uint32Array(6);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => n % 10).join("");
}

const PERFIS = ["master", "gestor", "vendedor"];
// O login no app é só o usuário curto. Este endereço existe apenas porque o
// serviço de login do Supabase exige um e-mail; nada é enviado para ele.
const DOMINIO = "testride.bravick.com.br";
const USUARIO_OK = /^[a-z0-9][a-z0-9._-]{2,19}$/;
const enderecoDe = (usuario: string) => `${usuario}@${DOMINIO}`;

function senhaValida(s: string): string | null {
  if (s.length < 6) return "O PIN precisa ter 6 números.";
  if (s.length > 72) return "A senha é longa demais.";
  return null;
}

function chaveServidor(): string {
  // Aceita a chave antiga (service_role) ou as novas chaves secretas (sb_secret_...)
  const antiga = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (antiga) return antiga;
  try {
    const s = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    return s.default || (Object.values(s)[0] as string) || "";
  } catch {
    return "";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ erro: "Método não permitido." }, 405);

  const service = chaveServidor();
  if (!service) return json({ erro: "Função sem chave de servidor configurada." }, 500);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, service, { auth: { persistSession: false } });

  // Quem está chamando?
  const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  const { data: quem, error: eQuem } = await admin.auth.getUser(token);
  if (eQuem || !quem?.user) return json({ erro: "Sessão inválida." }, 401);
  const { data: chamador } = await admin.from("perfis").select("perfil, ativo").eq("id", quem.user.id).single();
  if (!chamador || chamador.perfil !== "master" || !chamador.ativo) return json({ erro: "Acesso negado." }, 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ erro: "Requisição inválida." }, 400); }
  const acao = String(body.acao || "");

  if (acao === "criar") {
    const nome = String(body.nome || "").trim().slice(0, 120);
    const usuario = String(body.usuario || "").trim().toLowerCase();
    const perfil = String(body.perfil || "vendedor");
    const senha = String(body.senha || "") || senhaTemporaria();
    if (!nome) return json({ erro: "Informe o nome." }, 400);
    if (!USUARIO_OK.test(usuario)) return json({ erro: "Usuário inválido. Use de 3 a 20 letras ou números, sem espaços nem acentos." }, 400);
    if (!PERFIS.includes(perfil)) return json({ erro: "Perfil inválido." }, 400);
    const ruim = senhaValida(senha);
    if (ruim) return json({ erro: ruim }, 400);

    const { data: existe } = await admin.from("perfis").select("id").eq("usuario", usuario).maybeSingle();
    if (existe) return json({ erro: "Já existe um usuário com esse login." }, 400);

    const { data: novo, error } = await admin.auth.admin.createUser({
      email: enderecoDe(usuario), password: senha, email_confirm: true,
    });
    if (error) {
      const msg = /already/i.test(error.message) ? "Já existe um usuário com esse login." : "Não foi possível criar o usuário.";
      return json({ erro: msg }, 400);
    }
    const { error: e2 } = await admin.from("perfis").insert({
      id: novo.user.id, nome, usuario, email: enderecoDe(usuario), perfil, ativo: true,
      deve_trocar_senha: body.trocar_senha !== false,
      todas_lojas: body.todas_lojas === true,
      lojas: Array.isArray(body.lojas) ? (body.lojas as string[]).filter((u) => /^[0-9a-f-]{36}$/i.test(u)) : [],
    });
    if (e2) {
      await admin.auth.admin.deleteUser(novo.user.id);
      return json({ erro: "Não foi possível gravar o perfil." }, 400);
    }
    return json({ ok: true, id: novo.user.id, usuario, senha });
  }

  if (acao === "redefinir_senha") {
    const id = String(body.id || "");
    const senha = String(body.senha || "") || senhaTemporaria();
    const ruim = senhaValida(senha);
    if (ruim) return json({ erro: ruim }, 400);
    const { error } = await admin.auth.admin.updateUserById(id, { password: senha });
    if (error) return json({ erro: "Não foi possível redefinir a senha." }, 400);
    await admin.from("perfis").update({ deve_trocar_senha: body.trocar_senha !== false }).eq("id", id);
    return json({ ok: true, senha });
  }

  if (acao === "definir_ativo") {
    const id = String(body.id || "");
    const ativo = body.ativo === true;
    if (id === quem.user.id && !ativo) return json({ erro: "Você não pode desativar a si mesmo." }, 400);
    const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: ativo ? "none" : "876000h" });
    if (error) return json({ erro: "Não foi possível alterar o acesso." }, 400);
    await admin.from("perfis").update({ ativo }).eq("id", id);
    return json({ ok: true });
  }

  return json({ erro: "Ação desconhecida." }, 400);
});
