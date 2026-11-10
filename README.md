# TEST RIDE BRAVICK

PWA de test ride digital da BRAVICK Royal Enfield: foto da CNH com leitura automática no próprio aparelho (sem IA), termo de responsabilidade, assinatura na tela e envio do termo por WhatsApp.

Sistema independente (não usa o banco do CRM). Mesmo modelo do RH Grupo Nogueira Lins: GitHub Pages + Supabase.

## Fluxo do atendimento
1. **CNH** — foto; os dados são lidos no próprio celular (OCR) e preenchidos. PDF é aceito, com preenchimento manual.
2. **Dados** — o vendedor confere, escolhe a moto e informa o telefone. Bloqueia CNH vencida ou sem categoria A.
3. **Termo** — texto completo na tela, tempo máximo e limite do percurso.
4. **Assinaturas** — cliente e responsável assinam com o dedo.
5. **Pronto** — WhatsApp em um toque, ver, baixar ou compartilhar o PDF.

## Perfis
- **Vendedor:** registra e vê os próprios test rides.

O Master cadastra cada pessoa com nome, usuário e senha — sem e-mail.
- **Gestor:** vê todos da(s) sua(s) loja(s), cadastra motos, exporta Excel e cancela.
- **Master:** tudo, mais usuários, lojas, configurações e auditoria.

## Segurança
- Regras de acesso no banco (Row Level Security). A chave em `config.js` é a chave **pública**.
- Depois de assinado, o termo não muda: só contato, status e arquivos podem ser alterados.
- Foto da CNH apagada após o prazo de retenção (padrão 45 dias), quando um gestor abre o app.
- Toda alteração fica na auditoria. Sessão expira após 60 min sem uso.

## Arquivos
| Arquivo | O que é |
|---|---|
| `index.html`, `app.js`, `styles.css` | O aplicativo |
| `config.js` | URL e chave pública do Supabase |
| `sw.js`, `manifest.webmanifest`, `icons/` | Instalação no celular (PWA) |
| `vendor/` | Supabase 2.118.0, jsPDF 4.2.1, SheetJS 0.18.5 e Tesseract.js 5.1.1 (leitura da CNH), hospedados aqui |
| `supabase/schema.sql` | Banco completo — pode ser rodado de novo com segurança |
| `supabase/master.sql` | Cria o perfil Master |
| `supabase/admin-usuarios.ts` | Função: criar usuários, gerar senha, ativar/desativar |
| `supabase/ler-cnh.ts` | Função opcional: leitura da CNH por IA (desligada por padrão) |
| `supabase/termo.ts` | Função: link público do termo (WhatsApp) |

## Instalação
1. **Supabase:** criar o projeto (região São Paulo) e rodar `supabase/schema.sql` no SQL Editor.
2. **Master:** em Authentication > Users, criar o usuário com "Auto Confirm User"; depois rodar `supabase/master.sql`.
   O login no app é o **usuário curto** (ex.: `andre`), não o e-mail. O endereço serve só porque o serviço de login exige um.
3. **Funções (Edge Functions):** criar `admin-usuarios` e `termo` com o conteúdo dos arquivos `.ts`.
   - Em `termo`, **desligar "Verify JWT"** (o cliente abre o link sem login).
   - Opcional: criar `ler-cnh`, cadastrar `ANTHROPIC_API_KEY` ou `GEMINI_API_KEY` em Secrets e ligar "Ler a CNH com IA" em Configurações.
4. **config.js:** colar a URL e a chave pública (publishable) do projeto.
5. **GitHub Pages:** publicar a branch `main`.

## Atualizar o app
Envie os arquivos para a `main` e aumente `VERSAO` em `sw.js` para os celulares baixarem a versão nova.
