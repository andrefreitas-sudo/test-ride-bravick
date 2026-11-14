// Service worker — guarda só a interface (nunca dados de clientes).
const VERSAO = 'trb-v7';
const CACHE_OCR = 'trb-leitura'; // arquivos da leitura da CNH: pesados e sempre iguais, nunca apagados

// Interface do app: baixada na instalação.
// jspdf e xlsx ficam de fora — são carregados só quando o termo é gerado ou a planilha exportada.
const ARQUIVOS = [
  './', './index.html', './styles.css', './app.js', './config.js',
  './vendor/supabase.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/favicon.png',
];

const ehLeitura = (url) => url.pathname.includes('/vendor/tesseract/');

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSAO)
      .then((c) => Promise.allSettled(ARQUIVOS.map((a) => c.add(a))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== VERSAO && k !== CACHE_OCR).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function daRede(req, nomeCache) {
  const res = await fetch(req);
  if (res.ok) { const copia = res.clone(); caches.open(nomeCache).then((c) => c.put(req, copia)); }
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // o servidor de dados vai sempre direto

  // Arquivos da leitura da CNH: do aparelho sempre que já estiverem lá (são ~3 MB)
  if (ehLeitura(url)) {
    e.respondWith(caches.match(req, { cacheName: CACHE_OCR }).then((r) => r || daRede(req, CACHE_OCR)));
    return;
  }

  // Interface e página: respondem na hora com o que já está no aparelho e buscam a
  // versão nova em segundo plano. É o que faz o app abrir sem esperar a rede.
  e.respondWith(
    caches.match(req).then((guardado) => {
      const rede = daRede(req, VERSAO).catch(() => guardado || caches.match('./index.html'));
      return guardado || rede;
    }),
  );
});
