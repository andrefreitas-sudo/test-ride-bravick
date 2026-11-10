// TEST RIDE BRAVICK — Edge Function "termo"
// Link público do termo assinado, enviado ao cliente pelo WhatsApp:
//   https://<projeto>.supabase.co/functions/v1/termo?t=<código>
// O código é aleatório (um por test ride). A função confere o código e
// redireciona para o PDF por um endereço temporário (5 minutos).
// IMPORTANTE: nesta função, desligue a opção "Verify JWT" (o cliente não tem login).
import { createClient } from "npm:@supabase/supabase-js@2";

const texto = (msg: string, status: number) =>
  new Response(msg, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

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

Deno.serve(async (req) => {
  if (req.method !== "GET") return texto("Método não permitido.", 405);
  const t = new URL(req.url).searchParams.get("t") || "";
  if (!/^[0-9a-f]{32}$/.test(t)) return texto("Link inválido.", 400);

  const service = chaveServidor();
  if (!service) return texto("Serviço indisponível.", 500);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, service, { auth: { persistSession: false } });

  const { data: ride } = await admin.from("test_rides").select("termo_arquivo").eq("token_termo", t).maybeSingle();
  if (!ride?.termo_arquivo) return texto("Termo não encontrado. Fale com a concessionária.", 404);

  const { data: link, error } = await admin.storage.from("termos").createSignedUrl(ride.termo_arquivo, 300);
  if (error || !link?.signedUrl) return texto("Termo indisponível no momento. Tente novamente.", 502);

  return new Response(null, { status: 302, headers: { Location: link.signedUrl, "Cache-Control": "no-store" } });
});
