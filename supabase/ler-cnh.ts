// TEST RIDE BRAVICK — Edge Function "ler-cnh"
// Recebe a foto (ou PDF) da CNH e devolve os dados lidos por IA, para o
// vendedor apenas conferir. Só usuários ativos do sistema podem chamar.
//
// Segredos (Edge Functions > Secrets) — configure UM dos dois:
//   ANTHROPIC_API_KEY  -> usa Claude (padrão: claude-haiku-5-5)
//   GEMINI_API_KEY     -> usa Google Gemini (padrão: gemini-3.8-flash)
// Opcional: OCR_MODELO para trocar o modelo sem mexer no código.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const TIPOS = ["image/jpeg", "image/png", "application/pdf"];
const CAMPOS = ["nome", "cpf", "nascimento", "registro", "categoria", "validade"];

const INSTRUCAO = `Você lê CNH brasileira (Carteira Nacional de Habilitação), modelos novo e antigo, física ou digital.
A imagem pode estar inclinada, com reflexo ou sombra. Extraia exatamente o que está impresso.

Campos:
- nome: nome completo do condutor, como no documento.
- cpf: somente os 11 dígitos.
- nascimento: data de nascimento em AAAA-MM-DD.
- registro: "Nº REGISTRO" da CNH, somente os 11 dígitos.
- categoria: "CAT. HAB." em maiúsculas (A, B, AB, AC, AD, AE, ACC, C, D, E).
- validade: data de "VALIDADE" em AAAA-MM-DD.

Regras: converta datas DD/MM/AAAA para AAAA-MM-DD. Se um campo estiver ilegível ou ausente,
devolva texto vazio "" — nunca invente. Se o documento não for uma CNH, devolva todos os campos vazios.`;

function chaveServidor(): string {
  const antiga = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (antiga) return antiga;
  try {
    const s = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    return s.default || (Object.values(s)[0] as string) || "";
  } catch {
    return "";
  }
}

async function lerComClaude(chave: string, dados: string, tipo: string): Promise<Record<string, unknown>> {
  const arquivo = tipo === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: tipo, data: dados } }
    : { type: "image", source: { type: "base64", media_type: tipo, data: dados } };
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": chave, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: Deno.env.get("OCR_MODELO") || "claude-haiku-5-5",
      max_tokens: 500,
      system: INSTRUCAO,
      tools: [{
        name: "dados_cnh",
        description: "Devolve os campos lidos da CNH.",
        input_schema: {
          type: "object",
          properties: Object.fromEntries(CAMPOS.map((c) => [c, { type: "string" }])),
          required: CAMPOS,
        },
      }],
      tool_choice: { type: "tool", name: "dados_cnh" },
      messages: [{ role: "user", content: [arquivo, { type: "text", text: "Leia esta CNH." }] }],
    }),
  });
  if (!r.ok) throw new Error(`IA ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  const uso = (j.content || []).find((b: { type: string }) => b.type === "tool_use");
  if (!uso) throw new Error("IA sem resposta estruturada.");
  return uso.input as Record<string, unknown>;
}

async function lerComGemini(chave: string, dados: string, tipo: string): Promise<Record<string, unknown>> {
  const modelo = Deno.env.get("OCR_MODELO") || "gemini-3.8-flash";
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": chave, "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: INSTRUCAO }] },
      contents: [{ role: "user", parts: [{ inline_data: { mime_type: tipo, data: dados } }, { text: "Leia esta CNH." }] }],
      generationConfig: {
        temperature: 0,
        response_mime_type: "application/json",
        response_schema: {
          type: "OBJECT",
          properties: Object.fromEntries(CAMPOS.map((c) => [c, { type: "STRING" }])),
          required: CAMPOS,
        },
      },
    }),
  });
  if (!r.ok) throw new Error(`IA ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  const texto = j.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") || "";
  return JSON.parse(texto);
}

const soDigitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const dataISO = (v: unknown) => {
  const s = String(v ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ erro: "Método não permitido." }, 405);

  const service = chaveServidor();
  if (!service) return json({ erro: "Função sem chave de servidor configurada." }, 500);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, service, { auth: { persistSession: false } });
  const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  const { data: quem, error: eQuem } = await admin.auth.getUser(token);
  if (eQuem || !quem?.user) return json({ erro: "Sessão inválida." }, 401);
  const { data: perfil } = await admin.from("perfis").select("ativo").eq("id", quem.user.id).single();
  if (!perfil?.ativo) return json({ erro: "Acesso negado." }, 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ erro: "Requisição inválida." }, 400); }
  const dados = String(body.arquivo || "").replace(/^data:[^,]+,/, "");
  const tipo = String(body.tipo || "");
  if (!dados || !TIPOS.includes(tipo)) return json({ erro: "Envie uma foto (JPG/PNG) ou PDF da CNH." }, 400);
  if (dados.length > 9_000_000) return json({ erro: "Arquivo muito grande." }, 413);

  const claude = Deno.env.get("ANTHROPIC_API_KEY") || "";
  const gemini = Deno.env.get("GEMINI_API_KEY") || "";
  if (!claude && !gemini) return json({ erro: "Leitura automática não configurada. Preencha os dados manualmente." }, 503);

  try {
    const lido = claude ? await lerComClaude(claude, dados, tipo) : await lerComGemini(gemini, dados, tipo);
    const cpf = soDigitos(lido.cpf);
    const registro = soDigitos(lido.registro);
    const saida = {
      nome: String(lido.nome ?? "").trim().slice(0, 120),
      cpf: cpf.length === 11 ? cpf : "",
      nascimento: dataISO(lido.nascimento),
      registro: registro.length >= 9 && registro.length <= 11 ? registro : "",
      categoria: String(lido.categoria ?? "").toUpperCase().replace(/[^A-E]/g, ""),
      validade: dataISO(lido.validade),
    };
    const lidos = Object.values(saida).filter(Boolean).length;
    if (!lidos) return json({ erro: "Não foi possível ler a CNH nesta imagem. Tente outra foto ou preencha manualmente." }, 422);
    return json({ ok: true, dados: saida });
  } catch (e) {
    console.error("ler-cnh:", e);
    return json({ erro: "A leitura automática falhou. Tente outra foto ou preencha manualmente." }, 502);
  }
});
