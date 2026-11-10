/* TEST RIDE BRAVICK — test ride digital (CNH, termo, assinatura e WhatsApp)
   App PWA em JavaScript puro. Toda permissão é garantida no banco (RLS);
   aqui a interface apenas esconde o que o usuário não pode fazer. */
(() => {
  'use strict';

  const C = window.TRB_CONFIG || {};
  const NOME_APP = 'TEST RIDE BRAVICK';
  const root = document.getElementById('root');
  const S = { me: null, lojas: [], motos: [], config: {}, ultimaAtividade: Date.now() };
  let sb = null;
  let W = null; // test ride em andamento (assistente)

  // ------------------------------------------------------------------ utilidades
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dt = (d) => (d ? new Date(String(d).length === 10 ? d + 'T12:00:00' : d) : null);
  const fmtData = (d) => (d ? dt(d).toLocaleDateString('pt-BR') : '—');
  const fmtDH = (d) => (d ? dt(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
  const iniciais = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  const txt = (s) => (s === null || s === undefined || s === '' ? '—' : esc(s));
  const on = (el, sel, ev, fn) => $$(sel, el).forEach((n) => n.addEventListener(ev, fn));
  const digitos = (s) => String(s ?? '').replace(/\D/g, '');
  const hojeLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const diaLocal = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  const isMaster = () => S.me?.perfil === 'master';
  const isGestor = () => ['master', 'gestor'].includes(S.me?.perfil);
  const temLoja = (id) => isMaster() || S.me.todas_lojas || (S.me.lojas || []).includes(id);
  const minhasLojas = () => S.lojas.filter((l) => l.ativo && temLoja(l.id));
  const loja = (id) => S.lojas.find((l) => l.id === id);
  const PERFIS = { master: 'Master', gestor: 'Gestor', vendedor: 'Vendedor' };
  const CATS_MOTO = ['A', 'AB', 'AC', 'AD', 'AE'];
  const CATS_TODAS = ['A', 'AB', 'AC', 'AD', 'AE', 'B', 'C', 'D', 'E', 'ACC'];
  const MODELOS_RE = ['Hunter 350', 'Classic 350', 'Meteor 350', 'Bullet 350', 'Himalayan 450', 'Guerrilla 450', 'Super Meteor 650', 'Shotgun 650', 'Bear 650', 'Classic 650'];

  // Máscaras e validações
  const maskCPF = (v) => { const d = digitos(v).slice(0, 11); return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1-$2'); };
  const maskFone = (v) => {
    const d = digitos(v).slice(0, 11);
    if (d.length <= 2) return d.length ? '(' + d : '';
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  };
  const maskData = (v) => { const d = digitos(v).slice(0, 8); return d.length <= 2 ? d : d.length <= 4 ? `${d.slice(0, 2)}/${d.slice(2)}` : `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`; };
  function validaCPF(cpf) {
    const c = digitos(cpf);
    if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
    const calc = (n) => { let s = 0; for (let i = 0; i < n; i++) s += +c[i] * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
    return calc(9) === +c[9] && calc(10) === +c[10];
  }
  function brParaISO(v) {
    const m = String(v || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return '';
    const dia = +m[1], mes = +m[2], ano = +m[3];
    if (mes < 1 || mes > 12 || ano < 1900 || ano > 2100 || dia < 1 || dia > new Date(ano, mes, 0).getDate()) return '';
    return `${m[3]}-${m[2]}-${m[1]}`;
  }
  const isoParaBR = (v) => { const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };

  function toast(msg, erro = false) {
    $$('.toast').forEach((t) => t.remove());
    const t = document.createElement('div');
    t.className = 'toast' + (erro ? ' err' : '');
    t.setAttribute('role', 'status');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), erro ? 5000 : 2800);
  }

  function erroAmigavel(e) {
    const m = (e && (e.message || e.error_description || e.erro)) || String(e || '');
    if (/Failed to fetch|NetworkError|network|Load failed/i.test(m)) return 'Sem conexão. Verifique a internet e tente novamente.';
    if (/JWT|session|token/i.test(m)) return 'Sua sessão expirou. Entre novamente.';
    if (/row-level security|permission|permiss/i.test(m)) return 'Você não tem permissão para esta ação.';
    return m.length < 160 ? m : 'Não foi possível concluir. Tente novamente.';
  }

  function modal(html, { wide = false } = {}) {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true" ${wide ? 'style="max-width:720px"' : ''}>${html}</div>`;
    document.body.appendChild(back);
    const fechar = () => { back.remove(); document.removeEventListener('keydown', esc_); };
    const esc_ = (e) => { if (e.key === 'Escape') fechar(); };
    document.addEventListener('keydown', esc_);
    back.addEventListener('click', (e) => { if (e.target === back) fechar(); });
    on(back, '[data-fechar]', 'click', fechar);
    const primeiro = $('input, select, textarea', back);
    if (primeiro) setTimeout(() => primeiro.focus(), 50);
    return { el: back, fechar };
  }

  function confirmar(titulo, texto, botao = 'Confirmar', perigo = false) {
    return new Promise((ok) => {
      const m = modal(`<h2>${esc(titulo)}</h2><p class="muted">${esc(texto)}</p>
        <div class="actions"><button class="btn" data-fechar>Voltar</button>
        <button class="btn ${perigo ? 'danger' : 'primary'}" data-ok>${esc(botao)}</button></div>`);
      $('[data-ok]', m.el).addEventListener('click', () => { m.fechar(); ok(true); });
      on(m.el, '[data-fechar]', 'click', () => ok(false));
    });
  }

  function travar(btn, texto = 'Aguarde…') {
    if (!btn) return () => {};
    const antes = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = texto;
    return () => { btn.disabled = false; btn.innerHTML = antes; };
  }

  const scripts = {};
  function carregarScript(src) {
    if (!scripts[src]) {
      scripts[src] = new Promise((ok, erro) => {
        const s = document.createElement('script');
        s.src = src; s.onload = ok; s.onerror = () => { delete scripts[src]; erro(new Error('Sem conexão. Verifique a internet e tente novamente.')); };
        document.head.appendChild(s);
      });
    }
    return scripts[src];
  }

  async function invocar(funcao, corpo) {
    const { data, error } = await sb.functions.invoke(funcao, { body: corpo });
    if (error) {
      let msg = error.message;
      try { const j = await error.context.json(); msg = j.erro || msg; } catch (_) { /* sem corpo */ }
      if (/non-2xx|not found|404/i.test(msg)) msg = 'Função do servidor indisponível.';
      throw new Error(msg);
    }
    if (data?.erro) throw new Error(data.erro);
    return data;
  }

  // ------------------------------------------------------------------ ícones
  const svg = (p) => `<span class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg></span>`;
  const I = {
    home: svg('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>'),
    list: svg('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    more: svg('<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>'),
    users: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0113 0"/><path d="M16 4.5a3.5 3.5 0 010 7M21.5 20a6.5 6.5 0 00-4-6"/>'),
    building: svg('<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1M10 21v-3h4v3"/>'),
    shield: svg('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>'),
    user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/>'),
    out: svg('<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>'),
    back: svg('<path d="M15 6l-6 6 6 6"/>'),
    next: svg('<path d="M9 6l6 6-6 6"/>'),
    down: svg('<path d="M12 4v12M7 11l5 5 5-5M5 20h14"/>'),
    copy: svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/>'),
    doc: svg('<path d="M14 3H6a1 1 0 00-1 1v16a1 1 0 001 1h12a1 1 0 001-1V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>'),
    gear: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/>'),
    check: svg('<path d="M5 12l5 5L20 7"/>'),
    alert: svg('<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>'),
    camera: svg('<path d="M4 8h3l2-3h6l2 3h3a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z"/><circle cx="12" cy="13.5" r="3.5"/>'),
    upload: svg('<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>'),
    bike: svg('<circle cx="5.5" cy="16.5" r="3.5"/><circle cx="18.5" cy="16.5" r="3.5"/><path d="M5.5 16.5l4-7h5l4 7M9.5 9.5L8 6H5.5M14.5 9.5l1.5-3h2.5"/>'),
    chat: svg('<path d="M4 20l1.5-4.5A8 8 0 1112 20a8 8 0 01-3.6-.9z"/>'),
    share: svg('<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 10.9l7.6-3.8M8.2 13.1l7.6 3.8"/>'),
    erase: svg('<path d="M4 16l9-9 6 6-7 7H8z"/><path d="M12 20h8"/>'),
    edit: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/>'),
    trash: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
  };

  // ------------------------------------------------------------------ sessão
  function iniciar() {
    if (!/^https:\/\/[a-z0-9]+\.supabase\.co/.test(C.SUPABASE_URL || '')) {
      root.innerHTML = `<div class="login-wrap"><div class="card login"><h2>Configuração pendente</h2>
        <p class="muted">Informe a URL e a chave pública do Supabase no arquivo config.js.</p></div></div>`;
      return;
    }
    sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'trb-auth', detectSessionInUrl: false },
    });
    sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') { S.me = null; W = null; telaLogin(); } });
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
    ['pointerdown', 'keydown', 'touchstart'].forEach((e) => window.addEventListener(e, () => { S.ultimaAtividade = Date.now(); }, { passive: true }));
    setInterval(verificarInatividade, 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && S.me) verificarInatividade(); });
    window.addEventListener('hashchange', rotear);
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); S.instalar = e; });
    carregarSessao();
  }

  async function verificarInatividade() {
    if (!S.me) return;
    const lim = (C.INATIVIDADE_MIN || 60) * 60000;
    if (Date.now() - S.ultimaAtividade > lim) {
      await sb.auth.signOut();
      telaLogin('Sessão encerrada por inatividade. Entre novamente.');
    }
  }

  async function carregarSessao(msg) {
    const { data } = await sb.auth.getUser().catch(() => ({ data: {} }));
    if (!data?.user) return telaLogin(msg);
    const { data: me, error } = await sb.from('perfis').select('*').eq('id', data.user.id).maybeSingle();
    if (error || !me || !me.ativo) {
      await sb.auth.signOut();
      return telaLogin(error ? erroAmigavel(error) : 'Seu acesso não está ativo. Fale com o administrador do sistema.');
    }
    S.me = me;
    S.ultimaAtividade = Date.now();
    sb.rpc('registrar_acesso').then(() => {});
    if (me.deve_trocar_senha) return telaTrocarSenha(true);
    await carregarCadastros();
    montarApp();
  }

  async function carregarCadastros() {
    const [l, m, cf] = await Promise.all([
      sb.from('lojas').select('*').order('nome'),
      sb.from('motos').select('*').order('modelo'),
      sb.from('configuracoes').select('*'),
    ]);
    S.lojas = l.data || []; S.motos = m.data || [];
    S.config = Object.fromEntries((cf.data || []).map((x) => [x.chave, x.valor]));
  }

  // ------------------------------------------------------------------ login
  function telaLogin(msg) {
    root.innerHTML = `
      <div class="login-wrap"><form class="login" id="f-login" novalidate>
        <div class="logo"><img src="icons/icon-192.png" alt=""><div><h1>${NOME_APP}</h1>
        <small>Royal Enfield · Termo digital de test ride</small></div></div>
        <div class="card form-grid">
          ${msg ? `<div class="chip warn plain" style="white-space:normal">${esc(msg)}</div>` : ''}
          <label class="f"><span>E-mail</span><input class="input" type="email" name="email" autocomplete="username" inputmode="email" required></label>
          <label class="f"><span>Senha</span><input class="input" type="password" name="senha" autocomplete="current-password" required></label>
          <button class="btn primary block" type="submit">Entrar</button>
          <small class="muted" style="text-align:center">Esqueceu a senha? Fale com o administrador do sistema.</small>
        </div>
      </form></div>`;
    const f = $('#f-login');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = f.email.value.trim(), senha = f.senha.value;
      if (!email || !senha) return toast('Informe e-mail e senha.', true);
      const solta = travar($('button[type=submit]', f), 'Entrando…');
      const { error } = await sb.auth.signInWithPassword({ email, password: senha });
      if (error) {
        solta();
        const m = /rate|too many/i.test(error.message) ? 'Muitas tentativas. Aguarde alguns minutos.'
          : /banned|disabled/i.test(error.message) ? 'Seu acesso está desativado.'
          : /fetch|network/i.test(error.message) ? 'Sem conexão. Verifique a internet e tente novamente.' : 'E-mail ou senha incorretos.';
        return toast(m, true);
      }
      if (!location.hash || location.hash === '#/') location.hash = '#/inicio';
      carregarSessao();
    });
  }

  function validarSenha(s) {
    if (s.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
    if (!/[A-Za-z]/.test(s) || !/\d/.test(s)) return 'Use letras e números na senha.';
    return null;
  }

  function telaTrocarSenha(obrigatoria) {
    const html = `
      <form id="f-senha" class="form-grid" novalidate>
        ${obrigatoria ? '<p class="muted" style="margin:0">Por segurança, crie uma senha pessoal para continuar.</p>' : ''}
        <label class="f"><span>Nova senha</span><input class="input" type="password" name="s1" autocomplete="new-password" required></label>
        <label class="f"><span>Repita a nova senha</span><input class="input" type="password" name="s2" autocomplete="new-password" required>
        <div class="hint">Mínimo de 8 caracteres, com letras e números.</div></label>
        <div class="actions" style="justify-content:flex-end">
          ${obrigatoria ? '<button type="button" class="btn ghost" data-sair>Sair</button>' : '<button type="button" class="btn" data-fechar>Cancelar</button>'}
          <button class="btn primary" type="submit">Salvar senha</button></div>
      </form>`;
    let m = null;
    if (obrigatoria) {
      root.innerHTML = `<div class="login-wrap"><div class="login"><div class="logo"><img src="icons/icon-192.png" alt="">
        <h1>Crie sua senha</h1></div><div class="card">${html}</div></div></div>`;
      on(root, '[data-sair]', 'click', () => sb.auth.signOut());
    } else {
      m = modal(`<h2>Trocar senha</h2>${html}`);
    }
    const f = $('#f-senha');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const s1 = f.s1.value, s2 = f.s2.value;
      const inval = validarSenha(s1);
      if (inval) return toast(inval, true);
      if (s1 !== s2) return toast('As senhas não conferem.', true);
      const solta = travar($('button[type=submit]', f), 'Salvando…');
      const { error } = await sb.auth.updateUser({ password: s1 });
      if (error) { solta(); return toast(/same|different/i.test(error.message) ? 'A nova senha deve ser diferente da atual.' : erroAmigavel(error), true); }
      await sb.rpc('senha_trocada');
      toast('Senha atualizada.');
      if (m) m.fechar(); else carregarSessao();
    });
  }

  // ------------------------------------------------------------------ estrutura
  function itensMenu() {
    const it = [{ h: 'inicio', l: 'Início', i: I.home }, { h: 'test-rides', l: 'Test rides', i: I.list }, { h: 'novo', l: 'Novo test ride', i: I.plus, cta: true }];
    if (isGestor()) it.push({ h: 'motos', l: 'Motos', i: I.bike, soLado: true });
    return it;
  }
  function itensAdmin() {
    if (!isMaster()) return [];
    return [{ h: 'admin/usuarios', l: 'Usuários', i: I.users }, { h: 'admin/lojas', l: 'Lojas', i: I.building },
      { h: 'admin/config', l: 'Configurações', i: I.gear }, { h: 'auditoria', l: 'Auditoria', i: I.shield }];
  }

  function montarApp() {
    const menu = itensMenu(), adm = itensAdmin();
    const lado = [...menu, ...adm, { h: 'conta', l: 'Minha conta', i: I.user }];
    const baixo = [...menu.filter((x) => !x.soLado), { h: 'mais', l: 'Mais', i: I.more }];
    root.innerHTML = `
      <div class="app">
        <nav class="sidebar" aria-label="Menu">
          <div class="brand"><img src="icons/icon-192.png" alt=""><b>TEST RIDE<br>BRAVICK</b></div>
          ${lado.map((x) => `<a href="#/${x.h}" data-nav="${x.h}">${x.i}<span>${esc(x.l)}</span></a>`).join('')}
          <div class="grow"></div>
          <a href="#" data-sair>${I.out}<span>Sair</span></a>
        </nav>
        <div class="main">
          <header class="topbar">
            <div class="brand"><img src="icons/icon-192.png" alt=""><b>${NOME_APP}</b></div>
            <button class="icon-btn" data-go="conta" aria-label="Minha conta"><span class="avatar" style="width:32px;height:32px;font-size:12px">${esc(iniciais(S.me.nome))}</span></button>
          </header>
          <main id="view"></main>
        </div>
        <nav class="bottomnav" style="grid-template-columns:repeat(${baixo.length},1fr)" aria-label="Navegação">
          ${baixo.map((x) => `<a href="#/${x.h}" data-nav="${x.h}" class="${x.cta ? 'cta' : ''}">${x.i}<span>${x.cta ? 'Novo' : esc(x.l)}</span></a>`).join('')}
        </nav>
      </div>`;
    on(root, '[data-sair]', 'click', (e) => { e.preventDefault(); sair(); });
    on(root, '[data-go]', 'click', (e) => { location.hash = '#/' + e.currentTarget.dataset.go; });
    if (!location.hash || location.hash === '#/') location.hash = '#/inicio';
    else rotear();
    setTimeout(retencaoAutomatica, 4000);
  }

  async function sair() {
    if (!(await confirmar('Sair', 'Deseja encerrar sua sessão neste aparelho?', 'Sair'))) return;
    await sb.auth.signOut();
  }

  function view() { return $('#view'); }

  function rotear() {
    if (!S.me || !view()) return;
    const raw = (location.hash || '#/inicio').slice(2);
    const [caminho, qs] = raw.split('?');
    const params = new URLSearchParams(qs || '');
    const p = caminho.split('/');
    $$('.modal-back').forEach((m) => m.remove());
    $$('[data-nav]').forEach((a) => {
      const n = a.dataset.nav;
      a.classList.toggle('on', caminho === n || (n === 'test-rides' && p[0] === 'test-ride')
        || (n === 'mais' && ['conta', 'admin', 'auditoria', 'mais', 'motos'].includes(p[0])));
    });
    window.scrollTo(0, 0);
    const r = {
      inicio: () => telaPainel(),
      'test-rides': () => telaLista(params),
      'test-ride': () => telaRide(p[1]),
      novo: () => telaNovo(),
      motos: () => telaMotos(),
      mais: () => telaMais(),
      conta: () => telaConta(),
      admin: () => (p[1] === 'usuarios' ? telaUsuarios() : p[1] === 'lojas' ? telaLojas() : telaConfig()),
      auditoria: () => telaAuditoria(params),
    }[p[0]];
    (r || telaPainel)();
  }

  const carregando = () => { view().innerHTML = `<div class="page"><div class="skeleton" style="height:28px;width:40%;margin-bottom:16px"></div><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>`; };
  const semAcesso = () => { view().innerHTML = `<div class="page"><div class="empty"><b>Acesso restrito</b>Você não tem permissão para esta área.</div></div>`; };

  // ------------------------------------------------------------------ dados
  const COLS_LISTA = 'id,numero,status,loja_id,loja_nome,vendedor_id,vendedor_nome,moto_modelo,moto_placa,cliente_nome,cliente_cpf,cliente_telefone,cliente_email,cnh_numero,cnh_categoria,cnh_validade,saida_em,criado_em,whatsapp_enviado_em';

  async function buscarRides() {
    const { data, error } = await sb.from('test_rides').select(COLS_LISTA).order('criado_em', { ascending: false }).limit(3000);
    if (error) throw error;
    return data || [];
  }

  const chipStatus = (r) => (r.status === 'cancelado' ? '<span class="chip bad">Cancelado</span>' : '<span class="chip ok">Concluído</span>');

  function itemRide(r) {
    return `<a class="ride-item" href="#/test-ride/${r.id}">
      <div class="top"><div><div class="num">${esc(r.numero || '')} · ${fmtDH(r.criado_em)}</div><b>${esc(r.cliente_nome)}</b></div>${chipStatus(r)}</div>
      <div class="meta"><span>${esc(r.moto_modelo)}${r.moto_placa ? ' · ' + esc(r.moto_placa) : ''}</span><span>${esc(r.vendedor_nome || '')}</span>${S.lojas.length > 1 ? `<span>${esc(r.loja_nome || '')}</span>` : ''}</div>
    </a>`;
  }

  // ------------------------------------------------------------------ painel
  async function telaPainel() {
    carregando();
    let rs;
    try { rs = await buscarRides(); } catch (e) { return toast(erroAmigavel(e), true); }
    const validos = rs.filter((r) => r.status !== 'cancelado');
    const hoje = hojeLocal(), mes = hoje.slice(0, 7);
    const ant = (() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })();
    const doMes = validos.filter((r) => diaLocal(r.criado_em).startsWith(mes));
    const conta = (lista, campo) => {
      const m = new Map();
      lista.forEach((r) => m.set(r[campo] || '—', (m.get(r[campo] || '—') || 0) + 1));
      return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };
    const barras = (pares) => {
      const max = Math.max(1, ...pares.map((p) => p[1]));
      return pares.length ? `<div class="bars">${pares.slice(0, 8).map(([l, v]) => `<div class="bar-row"><span class="lbl">${esc(l)}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.round((v / max) * 100)}%"></div></div><span class="v">${v}</span></div>`).join('')}</div>`
        : '<p class="muted" style="margin:0">Sem test rides neste mês.</p>';
    };
    view().innerHTML = `<div class="page">
      <div class="card hero"><div><h2>Olá, ${esc(S.me.nome.split(' ')[0])}</h2><small>${isGestor() ? 'Visão das suas lojas' : 'Seus test rides'}</small></div>
        <a class="btn primary lg" href="#/novo">${I.plus} Novo test ride</a></div>
      <div class="grid kpi" style="margin-top:12px">
        <div class="card kpi-card"><div class="l">Hoje</div><div class="n">${validos.filter((r) => diaLocal(r.criado_em) === hoje).length}</div></div>
        <div class="card kpi-card" style="margin-top:0"><div class="l">Este mês</div><div class="n">${doMes.length}</div></div>
        <div class="card kpi-card" style="margin-top:0"><div class="l">Mês anterior</div><div class="n">${validos.filter((r) => diaLocal(r.criado_em).startsWith(ant)).length}</div></div>
        <div class="card kpi-card" style="margin-top:0"><div class="l">Total</div><div class="n">${validos.length}</div></div>
      </div>
      <div class="grid two" style="margin-top:12px">
        <div class="card"><h2 style="margin-bottom:12px">Motos mais testadas no mês</h2>${barras(conta(doMes, 'moto_modelo'))}</div>
        ${isGestor() ? `<div class="card" style="margin-top:0"><h2 style="margin-bottom:12px">Test rides por vendedor no mês</h2>${barras(conta(doMes, 'vendedor_nome'))}</div>` : ''}
      </div>
      <div class="section-title" style="margin-top:20px"><h2>Últimos test rides</h2><a href="#/test-rides">Ver todos</a></div>
      ${rs.length ? rs.slice(0, 5).map(itemRide).join('') : '<div class="card empty"><b>Nenhum test ride ainda</b>Toque em “Novo test ride” para começar.</div>'}
    </div>`;
  }

  // ------------------------------------------------------------------ lista
  async function telaLista(params) {
    carregando();
    let rs;
    try { rs = await buscarRides(); } catch (e) { return toast(erroAmigavel(e), true); }
    const vendedores = [...new Set(rs.map((r) => r.vendedor_nome).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const lojasUsadas = S.lojas.filter((l) => rs.some((r) => r.loja_id === l.id));
    view().innerHTML = `<div class="page">
      <div class="page-head"><div><h1>Test rides</h1><small id="cont"></small></div>
        <div class="actions">${isGestor() ? `<button class="btn" data-xlsx>${I.down} Exportar Excel</button>` : ''}<a class="btn primary" href="#/novo">${I.plus} Novo</a></div></div>
      <div class="filters rides">
        <input class="input" type="search" id="fq" placeholder="Cliente, CPF, telefone ou número" aria-label="Buscar" value="${esc(params.get('q') || '')}">
        <input class="input" type="month" id="fm" aria-label="Mês">
        ${lojasUsadas.length > 1 ? `<select class="input" id="fl" aria-label="Loja"><option value="">Todas as lojas</option>${lojasUsadas.map((l) => `<option value="${l.id}">${esc(l.nome)}</option>`).join('')}</select>` : ''}
        ${isGestor() && vendedores.length > 1 ? `<select class="input" id="fv" aria-label="Vendedor"><option value="">Todos os vendedores</option>${vendedores.map((v) => `<option>${esc(v)}</option>`).join('')}</select>` : ''}
      </div>
      <div id="lr"></div></div>`;
    let filtrados = rs;
    const pintar = () => {
      const q = $('#fq').value.trim().toLowerCase(), qd = digitos(q);
      const m = $('#fm').value, l = $('#fl')?.value, v = $('#fv')?.value;
      filtrados = rs.filter((r) => {
        if (m && !diaLocal(r.criado_em).startsWith(m)) return false;
        if (l && r.loja_id !== l) return false;
        if (v && r.vendedor_nome !== v) return false;
        if (!q) return true;
        const base = `${r.cliente_nome} ${r.numero} ${r.cliente_email || ''} ${r.moto_modelo}`.toLowerCase();
        return base.includes(q) || (qd.length >= 3 && (digitos(r.cliente_cpf).includes(qd) || digitos(r.cliente_telefone).includes(qd)));
      });
      $('#cont').textContent = `${filtrados.length} de ${rs.length} registros`;
      $('#lr').innerHTML = filtrados.length ? filtrados.slice(0, 300).map(itemRide).join('') + (filtrados.length > 300 ? '<p class="muted" style="text-align:center">Mostrando os 300 mais recentes. Use os filtros para refinar.</p>' : '')
        : '<div class="card empty"><b>Nenhum test ride encontrado</b>Ajuste os filtros ou registre um novo.</div>';
    };
    ['#fq', '#fm', '#fl', '#fv'].forEach((s) => $(s)?.addEventListener('input', pintar));
    on(view(), '[data-xlsx]', 'click', async (e) => {
      if (!filtrados.length) return toast('Nada para exportar.', true);
      const solta = travar(e.currentTarget, 'Gerando…');
      try {
        await carregarScript('vendor/xlsx.js');
        const linhas = filtrados.map((r) => ({
          'Número': r.numero, 'Data': fmtDH(r.criado_em), 'Loja': r.loja_nome, 'Vendedor': r.vendedor_nome,
          'Moto': r.moto_modelo, 'Placa': r.moto_placa || '', 'Cliente': r.cliente_nome, 'Telefone': r.cliente_telefone,
          'E-mail': r.cliente_email || '', 'CPF': r.cliente_cpf, 'Nº CNH': r.cnh_numero || '', 'Categoria': r.cnh_categoria,
          'Validade CNH': fmtData(r.cnh_validade), 'Status': r.status === 'cancelado' ? 'Cancelado' : 'Concluído',
          'WhatsApp enviado': r.whatsapp_enviado_em ? 'Sim' : 'Não',
        }));
        const ws = window.XLSX.utils.json_to_sheet(linhas);
        ws['!cols'] = Object.keys(linhas[0]).map((k) => ({ wch: Math.max(k.length + 2, 14) }));
        const wb = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(wb, ws, 'Test Rides');
        window.XLSX.writeFile(wb, `test-rides-bravick-${hojeLocal()}.xlsx`);
        toast('Planilha exportada.');
      } catch (err) { toast(erroAmigavel(err), true); }
      solta();
    });
    pintar();
  }

  // ------------------------------------------------------------------ termo (texto único para tela e PDF)
  function termoSecoes(d) {
    return [
      { t: '2. Declarações do condutor', p: ['Declaro, para os devidos fins, que:'], i: [
        'Estou plenamente apto(a) a conduzir motocicletas, possuindo experiência compatível com o modelo disponibilizado para teste;',
        'Sou habilitado(a) conforme legislação vigente, com CNH válida e na categoria adequada;',
        'Encontro-me em perfeitas condições físicas e psicológicas para condução do veículo;',
        'Não estou sob efeito de álcool, substâncias psicoativas, entorpecentes ou medicamentos que possam comprometer minha capacidade de condução;',
        'Tenho pleno conhecimento das normas de trânsito vigentes e me comprometo a cumpri-las integralmente.'] },
      { t: '4. Regras do test ride', p: ['O condutor declara ciência e concordância com as seguintes regras:'], i: [
        'Uso obrigatório de capacete devidamente afixado, recomendado o uso de luvas, calçados fechados e vestimenta adequada;',
        'Respeitar integralmente as leis de trânsito vigentes;',
        'É expressamente proibida a condução da motocicleta por terceiros;',
        `O percurso deverá respeitar o limite geográfico definido pela concessionária: ${d.limite_percurso || '—'};`,
        `Tempo máximo de utilização: ${d.tempo_max_min} minutos;`,
        'Vedado o uso para fins diversos do test ride, incluindo transporte de terceiros, manobras perigosas ou condução imprudente;',
        'O condutor deverá zelar pela integridade da motocicleta.'] },
      { t: '5. Responsabilidade e danos', p: ['O condutor assume total responsabilidade durante o período do test ride, declarando que:'], i: [
        'Será integralmente responsável por quaisquer multas, infrações ou penalidades decorrentes da utilização do veículo;',
        'Responderá por quaisquer danos causados à motocicleta, a terceiros ou ao patrimônio público ou privado;',
        'Em caso de danos, autoriza a concessionária a realizar a cobrança do valor de franquia (quando aplicável) ou do valor integral do prejuízo, na ausência de cobertura securitária;',
        'Autoriza, desde já, o acionamento de seguro do veículo, quando existente, ciente das condições e eventuais custos.'] },
      { t: '6. Dados pessoais', p: [`Autorizo a ${d.razao_social || 'concessionária'} a tratar os dados informados neste termo e a imagem da minha CNH para registro e segurança do test ride e para contato sobre este atendimento. A imagem da CNH é apagada automaticamente após ${d.retencao_dias} dias.`], i: [] },
      { t: '7. Autorização e ciência', p: ['Declaro que li, compreendi e concordo integralmente com todos os termos deste documento, assumindo total responsabilidade pela condução da motocicleta durante o período do test ride.'], i: [] },
    ];
  }

  const dadosTermo = (r) => {
    const l = loja(r.loja_id) || {};
    return { ...r, razao_social: l.razao_social || 'BRAVICK Comércio de Motos Ltda', retencao_dias: parseInt(S.config.retencao_cnh_dias, 10) || 45 };
  };

  function tamanhoImagem(dataUrl) {
    return new Promise((ok) => {
      const im = new Image();
      im.onload = () => ok({ w: im.naturalWidth || 2, h: im.naturalHeight || 1 });
      im.onerror = () => ok(null);
      im.src = dataUrl;
    });
  }

  async function gerarTermoPDF(r) {
    await carregarScript('vendor/jspdf.js');
    const d = dadosTermo(r);
    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', compress: true });
    const COBRE = [148, 102, 64], CARVAO = [38, 35, 30], CINZA = [110, 100, 88];
    const W_ = doc.internal.pageSize.getWidth(), H_ = doc.internal.pageSize.getHeight(), M = 18;
    let y = M;
    const quebra = (alt) => { if (y > H_ - alt) { doc.addPage(); y = M; } };

    doc.setFillColor(...CARVAO); doc.rect(0, 0, W_, 28, 'F');
    doc.setFillColor(...COBRE); doc.rect(0, 28, W_, 1, 'F');
    doc.setTextColor(247, 240, 225); doc.setFont('helvetica', 'bold'); doc.setFontSize(17);
    doc.text('TERMO DE RESPONSABILIDADE', W_ / 2, 12, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.text('TEST RIDE DE MOTOCICLETAS', W_ / 2, 18.5, { align: 'center' });
    doc.setFontSize(8.5);
    doc.text(`${NOME_APP} · ${d.loja_nome || ''} · Nº ${d.numero || ''}`, W_ / 2, 24, { align: 'center' });
    y = 38; doc.setTextColor(...CARVAO);

    const titulo = (t) => {
      quebra(30); y += 2;
      doc.setFillColor(...COBRE); doc.rect(M, y - 4, 4, 5, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...CARVAO);
      doc.text(t.toUpperCase(), M + 6, y); y += 6;
      doc.setDrawColor(220, 210, 195); doc.line(M, y - 2, W_ - M, y - 2); y += 2;
    };
    const campos = (pares) => {
      quebra(20);
      const larg = (W_ - M * 2) / pares.length;
      pares.forEach(([rotulo, valor], i) => {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...CINZA);
        doc.text(rotulo.toUpperCase(), M + larg * i, y);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...CARVAO);
        doc.text(doc.splitTextToSize(String(valor || '—'), larg - 3)[0], M + larg * i, y + 4.5);
      });
      y += 11;
    };
    const paragrafo = (t, recuo = 0) => {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...CARVAO);
      const linhas = doc.splitTextToSize(t, W_ - M * 2 - recuo);
      quebra(14 + linhas.length * 4.4);
      doc.text(linhas, M + recuo, y); y += linhas.length * 4.4 + 1.8;
    };
    const secao = (s) => { titulo(s.t); s.p.forEach((p) => paragrafo(p)); s.i.forEach((i) => paragrafo('• ' + i, 2)); y += 1; };
    const secoes = termoSecoes(d);

    titulo('1. Identificação do condutor');
    campos([['Nome completo', d.cliente_nome]]);
    campos([['CPF', d.cliente_cpf], ['Data de nascimento', d.cliente_nascimento ? fmtData(d.cliente_nascimento) : '—'], ['Telefone', d.cliente_telefone]]);
    campos([['Nº de registro da CNH', d.cnh_numero], ['Categoria', d.cnh_categoria], ['Validade da CNH', fmtData(d.cnh_validade)]]);
    campos([['E-mail', d.cliente_email], ['Cidade do test ride', d.cidade]]);
    secao(secoes[0]);

    titulo('3. Informações da motocicleta');
    campos([['Marca', 'Royal Enfield'], ['Modelo', d.moto_modelo], ['Placa', d.moto_placa]]);
    campos([['Saída', fmtDH(d.saida_em)], ['Retorno previsto', fmtDH(d.retorno_previsto_em)], ['Responsável', d.vendedor_nome]]);
    secoes.slice(1).forEach(secao);

    quebra(72);
    titulo('8. Assinaturas');
    campos([['Local', d.cidade], ['Data', fmtData(diaLocal(d.saida_em))]]);
    const lw = (W_ - M * 2 - 8) / 2, lh = 30, sy = y + 2;
    const caixa = async (x, png, rotulo, nome) => {
      doc.setDrawColor(180, 165, 140); doc.setLineWidth(0.3); doc.rect(x, sy, lw, lh);
      if (png) {
        const t = await tamanhoImagem(png);
        if (t) {
          const esc_ = Math.min((lw - 4) / t.w, (lh - 4) / t.h);
          const w = t.w * esc_, h = t.h * esc_;
          try { doc.addImage(png, 'PNG', x + (lw - w) / 2, sy + (lh - h) / 2, w, h, undefined, 'FAST'); } catch (_) { /* imagem inválida */ }
        }
      }
      doc.setFontSize(8); doc.setTextColor(...CINZA); doc.text(rotulo, x + lw / 2, sy + lh + 4, { align: 'center' });
      doc.setFontSize(9); doc.setTextColor(...CARVAO); doc.text(doc.splitTextToSize(nome || '', lw)[0] || '', x + lw / 2, sy + lh + 8, { align: 'center' });
    };
    await caixa(M, d.assinatura_cliente, 'Assinatura do condutor', d.cliente_nome);
    await caixa(M + lw + 8, d.assinatura_responsavel, 'Responsável pela concessionária', d.vendedor_nome);

    const total = doc.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i); doc.setFontSize(8); doc.setTextColor(...CINZA);
      doc.text(`${d.razao_social} · Documento gerado em ${new Date().toLocaleString('pt-BR')}`, M, H_ - 8);
      doc.text(`Página ${i} de ${total}`, W_ - M, H_ - 8, { align: 'right' });
    }
    return doc.output('blob');
  }

  // ------------------------------------------------------------------ assinatura
  function criarAssinatura(box, tracosIniciais, aoMudar) {
    const cv = $('canvas', box), ctx = cv.getContext('2d');
    const tracos = tracosIniciais || []; // pontos normalizados (0–1): sobrevivem a girar a tela
    let atual = null;
    const desenhar = () => {
      const w = cv.clientWidth, h = cv.clientHeight;
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111'; ctx.fillStyle = '#111';
      tracos.forEach((t) => {
        if (t.length === 1) { ctx.beginPath(); ctx.arc(t[0][0] * w, t[0][1] * h, 1.4, 0, Math.PI * 2); ctx.fill(); return; }
        ctx.beginPath(); ctx.moveTo(t[0][0] * w, t[0][1] * h);
        for (let i = 1; i < t.length; i++) ctx.lineTo(t[i][0] * w, t[i][1] * h);
        ctx.stroke();
      });
      box.classList.toggle('ok', valida());
    };
    const ajustar = () => {
      const r = box.getBoundingClientRect(), dpr = Math.max(1, window.devicePixelRatio || 1);
      if (!r.width) return;
      cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      desenhar();
    };
    const ponto = (e) => { const r = cv.getBoundingClientRect(); return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))]; };
    const valida = () => tracos.reduce((n, t) => n + t.length, 0) >= 12;
    cv.addEventListener('pointerdown', (e) => { e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (_) { /* ok */ } atual = [ponto(e)]; tracos.push(atual); desenhar(); });
    cv.addEventListener('pointermove', (e) => { if (!atual) return; e.preventDefault(); atual.push(ponto(e)); desenhar(); });
    const fim = () => { if (!atual) return; atual = null; aoMudar(); };
    cv.addEventListener('pointerup', fim); cv.addEventListener('pointercancel', fim);
    if (window.ResizeObserver) new ResizeObserver(ajustar).observe(box); else window.addEventListener('resize', ajustar);
    ajustar();
    return {
      tracos, valida,
      limpar: () => { tracos.length = 0; desenhar(); aoMudar(); },
      png: () => {
        if (!valida()) return null;
        const c = document.createElement('canvas'); c.width = 700; c.height = Math.round(700 * (cv.clientHeight / Math.max(1, cv.clientWidth)));
        const x = c.getContext('2d');
        x.lineWidth = 4; x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = '#111'; x.fillStyle = '#111';
        tracos.forEach((t) => {
          if (t.length === 1) { x.beginPath(); x.arc(t[0][0] * c.width, t[0][1] * c.height, 3, 0, Math.PI * 2); x.fill(); return; }
          x.beginPath(); x.moveTo(t[0][0] * c.width, t[0][1] * c.height);
          for (let i = 1; i < t.length; i++) x.lineTo(t[i][0] * c.width, t[i][1] * c.height);
          x.stroke();
        });
        return c.toDataURL('image/png');
      },
    };
  }

  // ------------------------------------------------------------------ arquivo da CNH
  function lerArquivo(file) {
    return new Promise((ok, erro) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => erro(new Error('Não foi possível ler o arquivo.')); r.readAsDataURL(file); });
  }
  async function prepararCNH(file) {
    const pdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (!pdf && !file.type.startsWith('image/')) throw new Error('Use uma foto (JPG/PNG) ou um PDF.');
    if (file.size > 12 * 1024 * 1024) throw new Error('Arquivo maior que 12 MB. Tente um menor.');
    const bruto = await lerArquivo(file);
    if (pdf) {
      if (file.size > 6 * 1024 * 1024) throw new Error('PDF maior que 6 MB. Tente uma foto.');
      return { dataUrl: bruto, tipo: 'application/pdf', nome: file.name };
    }
    const img = await new Promise((ok, erro) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => erro(new Error('Imagem inválida. Tente tirar a foto de novo.')); i.src = bruto; });
    const max = 1800, esc_ = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * esc_); c.height = Math.round(img.height * esc_);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return { dataUrl: c.toDataURL('image/jpeg', 0.85), tipo: 'image/jpeg', nome: file.name };
  }
  // Converte sem usar fetch (a política de segurança da página bloqueia fetch de data:)
  function dataUrlParaBlob(u) {
    const [cab, dados] = u.split(',');
    const bin = atob(dados), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: (cab.match(/data:([^;]+)/) || [])[1] || 'application/octet-stream' });
  }

  // ------------------------------------------------------------------ leitura da CNH no próprio aparelho (OCR, sem IA)
  let ocr = null;
  async function reconhecer(canvas) {
    await carregarScript('vendor/tesseract/tesseract.min.js');
    if (!ocr) {
      const base = new URL('vendor/tesseract/', location.href.split('#')[0]).href;
      ocr = await window.Tesseract.createWorker('por', 1, { workerPath: base + 'worker.min.js', corePath: base, langPath: base, workerBlobURL: false, gzip: true });
    }
    const { data } = await ocr.recognize(canvas);
    return data.text || '';
  }

  // Tons de cinza com contraste reforçado: reduz o fundo de segurança da CNH
  function prepararParaLeitura(img, giro) {
    const max = 2200, esc_ = Math.min(1, max / Math.max(img.width, img.height));
    const w = Math.round(img.width * esc_), h = Math.round(img.height * esc_);
    const c = document.createElement('canvas'), deitado = giro === 90 || giro === 270;
    c.width = deitado ? h : w; c.height = deitado ? w : h;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.translate(c.width / 2, c.height / 2); x.rotate((giro * Math.PI) / 180); x.drawImage(img, -w / 2, -h / 2, w, h);
    const d = x.getImageData(0, 0, c.width, c.height), p = d.data;
    for (let i = 0; i < p.length; i += 4) {
      let v = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
      v = Math.max(0, Math.min(255, (v - 110) * 1.9 + 128));
      p[i] = p[i + 1] = p[i + 2] = v;
    }
    x.putImageData(d, 0, 0);
    return c;
  }

  function validaRegistroCNH(n) {
    if (!/^\d{11}$/.test(n) || /^(\d)\1+$/.test(n)) return false;
    let v = 0;
    for (let i = 0, j = 9; i < 9; i++, j--) v += +n[i] * j;
    let d1 = v % 11, desc = 0;
    if (d1 >= 10) { d1 = 0; desc = 2; }
    v = 0;
    for (let i = 0, j = 1; i < 9; i++, j++) v += +n[i] * j;
    const r = v % 11, d2 = r >= 10 ? 0 : r - desc;
    return `${d1}${d2 < 0 ? d2 + 11 : d2}` === n.slice(9);
  }

  // Interpreta o texto reconhecido. Só devolve o que tiver boa evidência; o resto fica para o vendedor.
  function extrairCNH(texto) {
    const T = texto.toUpperCase().replace(/[|]/g, ' ');
    const linhas = T.split('\n').map((l) => l.trim()).filter(Boolean);
    const out = { nome: '', cpf: '', nascimento: '', registro: '', categoria: '', validade: '' };

    const cpfs = [...T.matchAll(/(\d{3})[.,\s]?(\d{3})[.,\s]?(\d{3})\s?[-–—]\s?(\d{2})/g)].map((m) => m.slice(1).join(''));
    out.cpf = cpfs.find(validaCPF) || '';

    const onzes = [...T.matchAll(/(?<!\d)\d{11}(?!\d)/g)].map((m) => m[0]).filter((n) => n !== out.cpf);
    if (!out.cpf) { const c = onzes.find((n) => validaCPF(n) && !validaRegistroCNH(n)); if (c) out.cpf = c; }
    out.registro = onzes.find((n) => n !== out.cpf && validaRegistroCNH(n)) || '';

    const hoje = hojeLocal(), ano = +hoje.slice(0, 4);
    const datas = [...new Set([...T.matchAll(/(\d{2})\s?[\/.]\s?(\d{2})\s?[\/.]\s?(\d{4})/g)].map((m) => brParaISO(`${m[1]}/${m[2]}/${m[3]}`)).filter(Boolean))].sort();
    const nasc = datas.find((d) => +d.slice(0, 4) >= ano - 100 && +d.slice(0, 4) <= ano - 18);
    if (nasc && datas.length >= 2) out.nascimento = nasc;
    const ult = datas[datas.length - 1];
    if (ult && datas.length >= 2 && +ult.slice(0, 4) <= ano + 11 && ult !== out.nascimento && ult > `${ano - 6}-01-01`) out.validade = ult;

    // Os rótulos da CNH são miúdos e muitas vezes não saem na leitura; por isso a busca não depende deles.
    const CAT = /^(ACC|A[B-E]|[A-E])$/;
    const soLetras = (l) => l.replace(/\d{2}\s?[\/.]\s?\d{2}\s?[\/.]\s?\d{4}/g, ' ').replace(/[\d.,\-–—\/]+/g, ' ').replace(/[^A-ZÀ-Ü\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const ROTULO = /CAT|HAB|REGISTRO|CPF|VALIDADE|EMISS|N[ºO°]?$/;
    const comNumero = linhas.filter((l) => (out.registro && l.includes(out.registro)) || /\d{3}[.,\s]?\d{3}[.,\s]?\d{3}\s?[-–—]\s?\d{2}/.test(l) || /CAT[.\s]*HAB|CATEGORIA/.test(l));
    for (const l of comNumero) {
      const sobra = soLetras(l).split(' ').filter((p) => p && !ROTULO.test(p));
      const achou = sobra.filter((p) => CAT.test(p));
      if (achou.length === 1 && sobra.length <= 2) { out.categoria = achou[0]; break; }
    }
    if (!out.categoria) {
      const i = linhas.findIndex((l) => /CAT[.\s]*HAB|CATEGORIA/.test(l));
      const prox = i >= 0 ? soLetras(linhas[i + 1] || '').split(' ').filter(Boolean) : [];
      if (prox.length === 1 && CAT.test(prox[0])) out.categoria = prox[0];
    }

    const CABECALHO = /REP[UÚ]BLICA|FEDERATIVA|BRASIL|MINIST|SECRETARIA|CARTEIRA|NACIONAL|HABILITA|DEPARTAMENTO|TR[AÂ]NSITO|DENATRAN|SENATRAN|TERRIT|V[AÁ]LIDA|NOME|FILIA|IDENTIDADE|ASSINATURA|PERMISS|REGISTRO|OBSERVA/;
    const iData = linhas.findIndex((l) => /\d{2}\s?[\/.]\s?\d{2}\s?[\/.]\s?\d{4}/.test(l));
    for (const l of linhas.slice(0, iData >= 0 ? iData : linhas.length)) {
      if (/\d/.test(l) || CABECALHO.test(l)) continue;
      const limpo = l.replace(/[^A-ZÀ-Ü\s]/g, ' ').replace(/\s+/g, ' ').trim();
      const partes = limpo.split(' ').filter((p) => p.length >= 2);
      if (partes.length >= 2 && limpo.length >= 8) { out.nome = partes.join(' ').slice(0, 120); break; }
    }
    if (!out.cpf && !out.registro && !out.validade) out.nome = ''; // sem nenhum número de CNH, não é um documento confiável
    return out;
  }

  async function lerLocal(dataUrl) {
    const img = await new Promise((ok, erro) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => erro(new Error('Imagem inválida.')); i.src = dataUrl; });
    let melhor = null, pontos = -1;
    for (const giro of [0, 90, 270]) {
      const d = extrairCNH(await reconhecer(prepararParaLeitura(img, giro)));
      const n = Object.values(d).filter(Boolean).length;
      if (n > pontos) { melhor = d; pontos = n; }
      if (d.cpf || n >= 3) break; // já está na posição certa
    }
    return melhor;
  }

  // ------------------------------------------------------------------ novo test ride (assistente)
  const PASSOS = ['CNH', 'Dados', 'Termo', 'Assinaturas', 'Pronto'];

  function novoW() {
    const ls = minhasLojas();
    let ultima = ''; try { ultima = localStorage.getItem('trb-loja') || ''; } catch (_) { /* sem armazenamento */ }
    return { passo: 1, loja_id: (ls.find((l) => l.id === ultima) || ls[0])?.id || '', cnh: null, lendo: false, erroLeitura: '', lidos: [], leuIA: false,
      f: { moto_id: '', nome: '', cpf: '', telefone: '', email: '', nascimento: '', registro: '', categoria: '', validade: '' },
      tempo: null, limite: null, ciente: false, sigCliente: [], sigResp: [], ride: null, pdfBlob: null };
  }

  function cabecalhoPassos() {
    return `<div class="steps-n">${PASSOS.map((l, i) => `<div class="st ${W.passo === i + 1 ? 'on' : W.passo > i + 1 ? 'done' : ''}"><b>${W.passo > i + 1 ? '✓' : i + 1}</b><span>${l}</span></div>${i < PASSOS.length - 1 ? '<i class="ln"></i>' : ''}`).join('')}</div>`;
  }

  function telaNovo() {
    if (!W) W = novoW();
    if (!minhasLojas().length) {
      view().innerHTML = `<div class="page"><div class="card empty"><b>Nenhuma loja liberada</b>Peça ao administrador para liberar uma loja no seu usuário.</div></div>`;
      return;
    }
    if (!loja(W.loja_id)) W.loja_id = minhasLojas()[0].id;
    ({ 1: passoCNH, 2: passoDados, 3: passoTermo, 4: passoAssinaturas, 5: passoPronto })[W.passo]();
    window.scrollTo(0, 0);
  }
  const irPasso = (n) => { W.passo = n; telaNovo(); };

  function passoCNH() {
    const ls = minhasLojas(), obrig = S.config.cnh_obrigatoria !== false;
    const pdf = W.cnh?.tipo === 'application/pdf';
    view().innerHTML = `<div class="page" style="max-width:720px">${cabecalhoPassos()}
      <div class="card stack">
        <div><h1>Foto da CNH</h1><small>Fotografe a CNH aberta do cliente. Os dados são preenchidos automaticamente.</small></div>
        ${ls.length > 1 ? `<div><span style="display:block;font-size:13px;font-weight:600;margin-bottom:8px">Loja</span><div class="seg">${ls.map((l) => `<label><input type="radio" name="loja" value="${l.id}" ${W.loja_id === l.id ? 'checked' : ''}><span>${esc(l.nome)}</span></label>`).join('')}</div></div>` : ''}
        <div class="capture ${W.cnh ? 'has' : ''}" id="cap">
          ${W.cnh ? (pdf ? `<div class="ph" style="color:#fff">${I.doc}<b>${esc(W.cnh.nome)}</b><br><small style="color:#ddd">PDF anexado</small></div>` : `<img src="${W.cnh.dataUrl}" alt="CNH do cliente">`)
            : `<div class="ph">${I.camera}<b>CNH do cliente</b><br><small>Boa luz, sem reflexo, documento inteiro na foto</small></div>`}
          ${W.cnh && !W.lendo ? '<button class="x" data-tirar aria-label="Remover foto">×</button>' : ''}
          ${W.lendo ? '<div class="busy"><div><div class="spin"></div>Lendo a CNH…<br><small class="muted" style="font-weight:400">Pode levar alguns segundos</small></div></div>' : ''}
        </div>
        ${W.erroLeitura ? `<div class="banner warn">${I.alert}<div>${esc(W.erroLeitura)}</div></div>` : ''}
        ${W.cnh && !W.lendo ? `<div class="actions"><button class="btn primary lg" style="flex:1" data-seguir>${W.leuIA ? 'Conferir dados' : 'Preencher os dados'} ${I.next}</button>${!W.leuIA ? `<button class="btn" data-reler>Ler de novo</button>` : ''}</div>`
          : `<div class="actions"><button class="btn primary lg" style="flex:1" data-cam ${W.lendo ? 'disabled' : ''}>${I.camera} Tirar foto</button><button class="btn lg" data-arq ${W.lendo ? 'disabled' : ''}>${I.upload} Arquivo</button></div>`}
        ${!W.cnh && !obrig ? '<button class="btn ghost" data-sem>Continuar sem foto</button>' : ''}
        <input type="file" id="in-cam" accept="image/*" capture="environment" class="hidden">
        <input type="file" id="in-arq" accept="image/*,application/pdf" class="hidden">
        <small class="muted">A foto fica guardada por ${parseInt(S.config.retencao_cnh_dias, 10) || 45} dias e depois é apagada automaticamente.</small>
      </div></div>`;
    on(view(), 'input[name=loja]', 'change', (e) => { W.loja_id = e.target.value; W.f.moto_id = ''; W.tempo = null; W.limite = null; });
    on(view(), '[data-cam]', 'click', () => $('#in-cam').click());
    on(view(), '[data-arq]', 'click', () => $('#in-arq').click());
    on(view(), '[data-tirar]', 'click', () => { W.cnh = null; W.erroLeitura = ''; W.leuIA = false; W.lidos = []; passoCNH(); });
    on(view(), '[data-seguir]', 'click', () => irPasso(2));
    on(view(), '[data-sem]', 'click', () => irPasso(2));
    on(view(), '[data-reler]', 'click', () => lerCNH());
    const escolher = async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      try { W.cnh = await prepararCNH(file); } catch (err) { return toast(erroAmigavel(err), true); }
      lerCNH();
    };
    $('#in-cam').addEventListener('change', escolher);
    $('#in-arq').addEventListener('change', escolher);
  }

  async function lerCNH() {
    const w = W;
    w.lendo = true; w.erroLeitura = ''; w.leuIA = false; w.lidos = [];
    passoCNH();
    try {
      const pdf = w.cnh.tipo === 'application/pdf', ia = S.config.leitura_ia === true;
      let d;
      if (ia) {
        try { d = (await invocar('ler-cnh', { arquivo: w.cnh.dataUrl.split(',')[1], tipo: w.cnh.tipo })).dados || {}; }
        catch (e) { if (pdf) throw e; d = await lerLocal(w.cnh.dataUrl); }
      } else {
        if (pdf) throw new Error('A leitura automática funciona com foto. Para PDF, preencha os dados.');
        d = await lerLocal(w.cnh.dataUrl);
      }
      const mapa = { nome: d.nome, cpf: d.cpf ? maskCPF(d.cpf) : '', nascimento: isoParaBR(d.nascimento), registro: d.registro, categoria: CATS_TODAS.includes(d.categoria) ? d.categoria : '', validade: isoParaBR(d.validade) };
      Object.entries(mapa).forEach(([k, v]) => { if (v) { w.f[k] = v; w.lidos.push(k); } });
      w.leuIA = w.lidos.length > 0;
      if (!w.leuIA) w.erroLeitura = 'Não foi possível ler a CNH nesta imagem. Tente outra foto ou preencha manualmente.';
    } catch (err) {
      w.erroLeitura = /PDF/.test(err?.message || '') ? err.message : 'Não foi possível ler a CNH. Tente outra foto ou preencha manualmente.';
    }
    w.lendo = false;
    if (W !== w || !location.hash.startsWith('#/novo')) return; // saiu da tela enquanto lia
    if (w.leuIA) { toast('CNH lida. Confira os dados.'); irPasso(2); } else passoCNH();
  }

  function situacaoCNH(f) {
    const erros = [];
    if (f.categoria && !CATS_MOTO.includes(f.categoria)) erros.push('Categoria sem habilitação para motocicleta. É obrigatória a categoria A.');
    const v = brParaISO(f.validade);
    if (v && v < hojeLocal()) erros.push(`CNH vencida em ${f.validade}. O test ride não pode ser realizado.`);
    return erros;
  }

  function passoDados() {
    const f = W.f, motos = S.motos.filter((m) => m.ativo && m.loja_id === W.loja_id);
    const cl = (k) => (W.lidos.includes(k) ? 'input lido' : 'input');
    view().innerHTML = `<div class="page" style="max-width:720px">${cabecalhoPassos()}
      <form class="card form-grid" id="f-dados" novalidate>
        <div><h1>Dados do atendimento</h1><small>${W.leuIA ? 'Os campos em verde foram lidos da foto. Confira cada um com o documento antes de continuar.' : 'Preencha os dados do cliente.'}</small></div>
        <div id="avisos"></div>
        <label class="f"><span>Moto do test ride <em>*</em></span><select class="input" name="moto_id"><option value="">Selecione…</option>${motos.map((m) => `<option value="${m.id}" ${f.moto_id === m.id ? 'selected' : ''}>${esc(m.modelo)}${m.placa ? ' · ' + esc(m.placa) : ''}</option>`).join('')}</select>
          ${motos.length ? '' : `<div class="hint" style="color:var(--bad)">Nenhuma moto cadastrada para ${esc(loja(W.loja_id)?.nome || 'esta loja')}. ${isGestor() ? '<a href="#/motos">Cadastrar moto</a>' : 'Peça ao gestor para cadastrar.'}</div>`}</label>
        <label class="f"><span>Nome completo <em>*</em></span><input class="${cl('nome')}" name="nome" maxlength="120" autocomplete="off" value="${esc(f.nome)}"></label>
        <div class="form-grid cols-2">
          <label class="f"><span>CPF <em>*</em></span><input class="${cl('cpf')}" name="cpf" inputmode="numeric" placeholder="000.000.000-00" autocomplete="off" value="${esc(f.cpf)}"></label>
          <label class="f"><span>Data de nascimento</span><input class="${cl('nascimento')}" name="nascimento" inputmode="numeric" placeholder="DD/MM/AAAA" autocomplete="off" value="${esc(f.nascimento)}"></label>
          <label class="f"><span>Telefone (WhatsApp) <em>*</em></span><input class="input" name="telefone" inputmode="tel" placeholder="(17) 91234-5678" autocomplete="off" value="${esc(f.telefone)}"></label>
          <label class="f"><span>E-mail</span><input class="input" name="email" type="email" inputmode="email" placeholder="cliente@email.com" autocomplete="off" value="${esc(f.email)}"></label>
          <label class="f"><span>Nº de registro da CNH</span><input class="${cl('registro')}" name="registro" inputmode="numeric" maxlength="11" autocomplete="off" value="${esc(f.registro)}"></label>
          <label class="f"><span>Categoria da CNH <em>*</em></span><select class="${cl('categoria')}" name="categoria"><option value="">Selecione…</option>${CATS_TODAS.map((c) => `<option value="${c}" ${f.categoria === c ? 'selected' : ''}>${c}${CATS_MOTO.includes(c) ? '' : ' (não habilita moto)'}</option>`).join('')}</select></label>
          <label class="f"><span>Validade da CNH <em>*</em></span><input class="${cl('validade')}" name="validade" inputmode="numeric" placeholder="DD/MM/AAAA" autocomplete="off" value="${esc(f.validade)}"></label>
          <label class="f"><span>Responsável</span><input class="input" value="${esc(S.me.nome)}" disabled></label>
        </div>
        <div class="actions" style="justify-content:space-between"><button type="button" class="btn" data-voltar>${I.back} Voltar</button><button class="btn primary" type="submit">Continuar ${I.next}</button></div>
      </form></div>`;
    const form = $('#f-dados');
    const ler = () => { ['moto_id', 'nome', 'cpf', 'telefone', 'email', 'nascimento', 'registro', 'categoria', 'validade'].forEach((k) => { f[k] = form[k].value.trim(); }); };
    const avisar = () => {
      const erros = situacaoCNH(f);
      $('#avisos').innerHTML = erros.map((e) => `<div class="banner bad" style="margin-bottom:8px">${I.alert}<div><b>Não é possível continuar.</b> ${esc(e)}</div></div>`).join('');
      $('button[type=submit]', form).disabled = erros.length > 0;
    };
    form.cpf.addEventListener('input', (e) => { e.target.value = maskCPF(e.target.value); });
    form.telefone.addEventListener('input', (e) => { e.target.value = maskFone(e.target.value); });
    form.registro.addEventListener('input', (e) => { e.target.value = digitos(e.target.value).slice(0, 11); });
    ['nascimento', 'validade'].forEach((k) => form[k].addEventListener('input', (e) => { e.target.value = maskData(e.target.value); }));
    form.addEventListener('input', () => { ler(); avisar(); });
    form.addEventListener('change', () => { ler(); avisar(); });
    on(form, '[data-voltar]', 'click', () => { ler(); irPasso(1); });
    form.addEventListener('submit', (e) => {
      e.preventDefault(); ler();
      const erro = (campo, msg) => { toast(msg, true); form[campo]?.focus(); };
      if (!f.moto_id) return erro('moto_id', 'Selecione a moto do test ride.');
      if (f.nome.split(/\s+/).length < 2) return erro('nome', 'Informe o nome completo do cliente.');
      if (!validaCPF(f.cpf)) return erro('cpf', 'CPF inválido.');
      if (f.nascimento && (!brParaISO(f.nascimento) || brParaISO(f.nascimento) >= hojeLocal())) return erro('nascimento', 'Data de nascimento inválida.');
      if (digitos(f.telefone).length < 10) return erro('telefone', 'Telefone inválido. Informe DDD e número.');
      if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) return erro('email', 'E-mail inválido.');
      if (!f.categoria) return erro('categoria', 'Selecione a categoria da CNH.');
      if (!brParaISO(f.validade)) return erro('validade', 'Informe a validade da CNH (DD/MM/AAAA).');
      if (situacaoCNH(f).length) return avisar();
      irPasso(3);
    });
    avisar();
  }

  function rascunhoRide() {
    const f = W.f, l = loja(W.loja_id), m = S.motos.find((x) => x.id === f.moto_id);
    if (W.tempo === null) W.tempo = l.tempo_max_min;
    if (W.limite === null) W.limite = l.limite_percurso;
    return {
      loja_id: l.id, loja_nome: l.nome, cidade: l.cidade, vendedor_nome: S.me.nome,
      moto_id: m?.id || null, moto_modelo: m?.modelo || '', moto_placa: m?.placa || null,
      cliente_nome: f.nome, cliente_cpf: f.cpf, cliente_telefone: f.telefone, cliente_email: f.email || null,
      cliente_nascimento: brParaISO(f.nascimento) || null, cnh_numero: f.registro || null,
      cnh_categoria: f.categoria, cnh_validade: brParaISO(f.validade),
      tempo_max_min: W.tempo, limite_percurso: W.limite,
    };
  }

  function passoTermo() {
    const r = rascunhoRide(), d = dadosTermo(r);
    const linha = (k, v) => `<div><dt>${k}</dt><dd>${txt(v)}</dd></div>`;
    view().innerHTML = `<div class="page" style="max-width:720px">${cabecalhoPassos()}
      <div class="card stack">
        <div><h1>Termo de responsabilidade</h1><small>Apresente o termo ao cliente antes de coletar as assinaturas.</small></div>
        <dl class="dl">${linha('Condutor', r.cliente_nome)}${linha('CPF', r.cliente_cpf)}${linha('CNH', `Categoria ${r.cnh_categoria} · válida até ${W.f.validade}`)}${linha('Moto', r.moto_modelo + (r.moto_placa ? ' · ' + r.moto_placa : ''))}${linha('Loja', `${r.loja_nome} · ${r.cidade}`)}${linha('Responsável', r.vendedor_nome)}</dl>
        <div class="form-grid cols-2">
          <label class="f"><span>Tempo máximo (minutos)</span><input class="input" type="number" id="tempo" min="5" max="120" inputmode="numeric" value="${r.tempo_max_min}"></label>
          <label class="f"><span>Limite do percurso</span><input class="input" id="limite" maxlength="160" value="${esc(r.limite_percurso)}"></label>
        </div>
        <div class="termo" id="termo-txt"></div>
        <label class="check"><input type="checkbox" id="ciente" ${W.ciente ? 'checked' : ''}> O cliente leu o termo e concorda com as condições</label>
        <div class="actions" style="justify-content:space-between"><button class="btn" data-voltar>${I.back} Voltar</button><button class="btn primary" data-seguir>Coletar assinaturas ${I.next}</button></div>
      </div></div>`;
    const pintarTermo = () => {
      $('#termo-txt').innerHTML = termoSecoes({ ...d, tempo_max_min: W.tempo, limite_percurso: W.limite })
        .map((s) => `<h3>${esc(s.t)}</h3>${s.p.map((p) => `<p>${esc(p)}</p>`).join('')}${s.i.length ? `<ul>${s.i.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}`).join('');
    };
    $('#tempo').addEventListener('input', (e) => { W.tempo = Math.min(120, Math.max(5, parseInt(e.target.value, 10) || 30)); pintarTermo(); });
    $('#tempo').addEventListener('blur', (e) => { e.target.value = W.tempo; });
    $('#limite').addEventListener('input', (e) => { W.limite = e.target.value.trim(); pintarTermo(); });
    $('#ciente').addEventListener('change', (e) => { W.ciente = e.target.checked; });
    on(view(), '[data-voltar]', 'click', () => irPasso(2));
    on(view(), '[data-seguir]', 'click', () => {
      if (!W.limite) return toast('Informe o limite do percurso.', true);
      if (!W.ciente) return toast('Confirme que o cliente leu e concorda com o termo.', true);
      irPasso(4);
    });
    pintarTermo();
  }

  function passoAssinaturas() {
    const bloco = (id, rotulo) => `<div><div class="sig-head"><b>${esc(rotulo)}</b><button type="button" class="btn sm ghost" data-limpar="${id}">${I.erase} Limpar</button></div>
      <div class="sig" id="${id}"><canvas></canvas><div class="linha"></div></div></div>`;
    view().innerHTML = `<div class="page" style="max-width:720px">${cabecalhoPassos()}
      <div class="card stack">
        <div><h1>Assinaturas</h1><small>Assinem com o dedo dentro de cada quadro.</small></div>
        ${bloco('sig-c', `Cliente — ${W.f.nome}`)}
        ${bloco('sig-r', `Responsável — ${S.me.nome}`)}
        <div id="falha"></div>
        <div class="actions" style="justify-content:space-between"><button class="btn" data-voltar>${I.back} Voltar</button><button class="btn primary lg" data-fim disabled>${I.check} Finalizar test ride</button></div>
      </div></div>`;
    const btn = $('[data-fim]');
    const mudou = () => { btn.disabled = !(sc.valida() && sr.valida()); };
    const sc = criarAssinatura($('#sig-c'), W.sigCliente, () => mudou());
    const sr = criarAssinatura($('#sig-r'), W.sigResp, () => mudou());
    mudou();
    on(view(), '[data-limpar]', 'click', (e) => (e.currentTarget.dataset.limpar === 'sig-c' ? sc : sr).limpar());
    on(view(), '[data-voltar]', 'click', () => irPasso(3));
    btn.addEventListener('click', async () => {
      const solta = travar(btn, 'Finalizando…');
      try {
        await finalizar(sc.png(), sr.png());
        W.passo = 5; telaNovo(); toast('Test ride finalizado!');
      } catch (err) {
        solta();
        $('#falha').innerHTML = `<div class="banner bad">${I.alert}<div><b>Não foi possível finalizar.</b> ${esc(erroAmigavel(err))} As assinaturas foram mantidas — toque em “Finalizar” para tentar de novo.</div></div>`;
      }
    });
  }

  // Grava em etapas e pode ser repetido sem duplicar: registro → foto da CNH → termo em PDF
  async function finalizar(pngCliente, pngResp) {
    if (!pngCliente || !pngResp) throw new Error('Colete as duas assinaturas.');
    if (!W.ride) {
      const r = rascunhoRide();
      const { data, error } = await sb.from('test_rides').insert({
        loja_id: r.loja_id, moto_id: r.moto_id, moto_modelo: r.moto_modelo, moto_placa: r.moto_placa,
        cliente_nome: r.cliente_nome, cliente_cpf: r.cliente_cpf, cliente_telefone: r.cliente_telefone, cliente_email: r.cliente_email,
        cliente_nascimento: r.cliente_nascimento, cnh_numero: r.cnh_numero, cnh_categoria: r.cnh_categoria, cnh_validade: r.cnh_validade,
        cnh_lida_por_ia: W.leuIA, saida_em: new Date().toISOString(), tempo_max_min: r.tempo_max_min, limite_percurso: r.limite_percurso,
        assinatura_cliente: pngCliente, assinatura_responsavel: pngResp,
      }).select().single();
      if (error) throw error;
      W.ride = data;
      try { localStorage.setItem('trb-loja', data.loja_id); } catch (_) { /* sem armazenamento */ }
    }
    const id = W.ride.id;
    if (W.cnh && !W.ride.cnh_arquivo) {
      const pdf = W.cnh.tipo === 'application/pdf', caminho = `${id}/cnh.${pdf ? 'pdf' : 'jpg'}`;
      const { error } = await sb.storage.from('cnh').upload(caminho, dataUrlParaBlob(W.cnh.dataUrl), { contentType: W.cnh.tipo, upsert: true });
      if (error) throw error;
      const upd = { cnh_arquivo: caminho, cnh_arquivo_tipo: W.cnh.tipo, cnh_enviada_em: new Date().toISOString() };
      const { error: e2 } = await sb.from('test_rides').update(upd).eq('id', id);
      if (e2) throw e2;
      Object.assign(W.ride, upd);
    }
    if (!W.pdfBlob) W.pdfBlob = await gerarTermoPDF(W.ride);
    if (!W.ride.termo_arquivo) {
      const caminho = `${id}/termo.pdf`;
      const { error } = await sb.storage.from('termos').upload(caminho, W.pdfBlob, { contentType: 'application/pdf', upsert: true });
      if (error) throw error;
      const { error: e2 } = await sb.from('test_rides').update({ termo_arquivo: caminho }).eq('id', id);
      if (e2) throw e2;
      W.ride.termo_arquivo = caminho;
    }
  }

  // ------------------------------------------------------------------ envio do termo
  const primeiroNome = (n) => { const p = String(n || '').trim().split(/\s+/)[0] || ''; return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase(); };
  const linkTermo = (r) => `${C.SUPABASE_URL}/functions/v1/termo?t=${r.token_termo}`;
  const nomeArquivoTermo = (r) => `termo-test-ride-${String(r.cliente_nome).normalize('NFD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_')}.pdf`;

  function enviarWhatsApp(r) {
    let fone = digitos(r.cliente_telefone).replace(/^0+/, '');
    if (!(fone.startsWith('55') && fone.length >= 12)) fone = '55' + fone;
    const local = fone.slice(2);
    if (local.length < 10 || local.length > 11) { toast('Telefone do cliente inválido. Corrija o contato e tente de novo.', true); return false; }
    if (!r.termo_arquivo) { toast('O termo ainda não foi gerado.', true); return false; }
    const modelo = typeof S.config.mensagem_whatsapp === 'string' && S.config.mensagem_whatsapp.includes('{link}') ? S.config.mensagem_whatsapp
      : 'Olá, {nome}! Seu termo do Test Ride na {loja} está disponível no link abaixo:\n\n{link}';
    const msg = modelo.replace(/\{nome\}/g, primeiroNome(r.cliente_nome)).replace(/\{loja\}/g, r.loja_nome || 'Royal Enfield Bravick').replace(/\{link\}/g, linkTermo(r));
    window.open(`https://wa.me/${fone}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
    sb.from('test_rides').update({ whatsapp_enviado_em: new Date().toISOString() }).eq('id', r.id).then(() => {});
    return true;
  }

  async function baixarTermo(r) {
    const { data, error } = await sb.storage.from('termos').download(r.termo_arquivo);
    if (error) throw error;
    return data;
  }
  function abrirBlob(blob) {
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank');
    if (!w) { const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); }
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  }
  function salvarBlob(blob, nome) {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  const podeCompartilhar = (nome) => { try { return !!navigator.canShare && navigator.canShare({ files: [new File([new Blob(['x'], { type: 'application/pdf' })], nome, { type: 'application/pdf' })] }); } catch (_) { return false; } };
  async function compartilhar(blob, r) {
    try { await navigator.share({ files: [new File([blob], nomeArquivoTermo(r), { type: 'application/pdf' })], title: 'Termo de Test Ride' }); }
    catch (e) { if (e?.name !== 'AbortError') toast('Não foi possível compartilhar.', true); }
  }

  function botoesTermo(r) {
    return `<button class="btn wa lg block" data-wa>${I.chat} Enviar termo pelo WhatsApp</button>
      <div class="actions"><button class="btn" style="flex:1" data-ver>${I.doc} Ver PDF</button><button class="btn" style="flex:1" data-baixar>${I.down} Baixar</button>
      ${podeCompartilhar(nomeArquivoTermo(r)) ? `<button class="btn" style="flex:1" data-comp>${I.share} Compartilhar</button>` : ''}</div>`;
  }
  function ligarBotoesTermo(el, r, obterBlob) {
    const com = (fn) => async (e) => {
      const solta = travar(e.currentTarget, 'Abrindo…');
      try { fn(await obterBlob()); } catch (err) { toast(erroAmigavel(err), true); }
      solta();
    };
    on(el, '[data-wa]', 'click', () => enviarWhatsApp(r));
    on(el, '[data-ver]', 'click', com((b) => abrirBlob(b)));
    on(el, '[data-baixar]', 'click', com((b) => salvarBlob(b, nomeArquivoTermo(r))));
    on(el, '[data-comp]', 'click', com((b) => compartilhar(b, r)));
  }

  function passoPronto() {
    const r = W.ride, blob = W.pdfBlob;
    view().innerHTML = `<div class="page" style="max-width:560px">${cabecalhoPassos()}
      <div class="card stack" style="text-align:center">
        <div><div class="done-ic">${I.check}</div><h1>Test ride finalizado!</h1><small>${esc(r.numero)} · ${esc(r.cliente_nome)} · ${esc(r.moto_modelo)}</small></div>
        ${botoesTermo(r)}
        <div class="actions" style="justify-content:center"><button class="btn ghost" data-novo>${I.plus} Novo test ride</button><a class="btn ghost" href="#/test-ride/${r.id}">Ver registro</a></div>
      </div></div>`;
    ligarBotoesTermo(view(), r, async () => blob);
    on(view(), '[data-novo]', 'click', () => { W = null; telaNovo(); });
    const sairDoPronto = () => { if (!location.hash.startsWith('#/novo')) { W = null; window.removeEventListener('hashchange', sairDoPronto); } };
    window.addEventListener('hashchange', sairDoPronto);
  }

  // ------------------------------------------------------------------ registro do test ride
  async function telaRide(id) {
    carregando();
    const { data: r, error } = await sb.from('test_rides').select('*').eq('id', id).maybeSingle();
    if (error || !r) { view().innerHTML = `<div class="page"><div class="card empty"><b>Test ride não encontrado</b><a href="#/test-rides">Voltar para a lista</a></div></div>`; return; }
    const linha = (k, v, full) => `<div class="${full ? 'full' : ''}"><dt>${k}</dt><dd>${v}</dd></div>`;
    const cancelado = r.status === 'cancelado';
    view().innerHTML = `<div class="page" style="max-width:820px">
      <div class="page-head"><div><a href="#/test-rides" class="muted" style="display:inline-flex;align-items:center;gap:4px;font-size:13px">${I.back} Test rides</a>
        <h1 style="margin-top:4px">${esc(r.cliente_nome)}</h1><small>${esc(r.numero)} · ${fmtDH(r.criado_em)}</small></div>${chipStatus(r)}</div>
      ${cancelado ? `<div class="banner bad" style="margin-bottom:12px">${I.alert}<div><b>Cancelado.</b> ${esc(r.motivo_cancelamento || '')}</div></div>` : ''}
      <div class="card stack"><h2>Termo assinado</h2>
        ${r.termo_arquivo ? botoesTermo(r) : `<div class="banner warn">${I.alert}<div>O PDF do termo não chegou a ser gravado. Gere novamente — os dados e as assinaturas estão guardados.</div></div><button class="btn primary" data-regerar>Gerar termo novamente</button>`}
        <small class="muted">${r.whatsapp_enviado_em ? `Enviado por WhatsApp em ${fmtDH(r.whatsapp_enviado_em)}.` : 'Ainda não enviado por WhatsApp.'}</small></div>
      <div class="card"><div class="section-title"><h2>Cliente</h2><button class="btn sm" data-contato>${I.edit} Corrigir contato</button></div>
        <dl class="dl">${linha('CPF', txt(r.cliente_cpf))}${linha('Nascimento', r.cliente_nascimento ? fmtData(r.cliente_nascimento) : '—')}${linha('Telefone', txt(r.cliente_telefone))}${linha('E-mail', txt(r.cliente_email))}</dl></div>
      <div class="card"><div class="section-title"><h2>CNH</h2>${r.cnh_arquivo ? `<button class="btn sm" data-cnh>${I.doc} Ver documento</button>` : ''}</div>
        <dl class="dl">${linha('Nº de registro', txt(r.cnh_numero))}${linha('Categoria', txt(r.cnh_categoria))}${linha('Validade', fmtData(r.cnh_validade))}
        ${linha('Documento', r.cnh_arquivo ? `Guardado desde ${fmtData(diaLocal(r.cnh_enviada_em))}${r.cnh_lida_por_ia ? ' · dados lidos automaticamente' : ''}` : (r.cnh_enviada_em ? 'Apagado após o prazo de retenção' : 'Não anexado'))}</dl></div>
      <div class="card"><h2 style="margin-bottom:12px">Test ride</h2>
        <dl class="dl">${linha('Moto', esc(r.moto_modelo) + (r.moto_placa ? ' · ' + esc(r.moto_placa) : ''))}${linha('Loja', `${txt(r.loja_nome)} · ${txt(r.cidade)}`)}${linha('Saída', fmtDH(r.saida_em))}${linha('Retorno previsto', fmtDH(r.retorno_previsto_em))}
        ${linha('Tempo máximo', `${r.tempo_max_min} min`)}${linha('Responsável', txt(r.vendedor_nome))}${linha('Limite do percurso', txt(r.limite_percurso), true)}</dl></div>
      ${isGestor() ? `<div class="actions" style="margin-top:14px">${cancelado ? '' : `<button class="btn danger" data-cancelar>Cancelar test ride</button>`}${isMaster() ? `<button class="btn danger" data-excluir>${I.trash} Excluir registro</button>` : ''}</div>` : ''}
    </div>`;
    if (r.termo_arquivo) ligarBotoesTermo(view(), r, () => baixarTermo(r));
    on(view(), '[data-regerar]', 'click', async (e) => {
      const solta = travar(e.currentTarget, 'Gerando…');
      try {
        const blob = await gerarTermoPDF(r), caminho = `${r.id}/termo.pdf`;
        const { error: e1 } = await sb.storage.from('termos').upload(caminho, blob, { contentType: 'application/pdf', upsert: true });
        if (e1) throw e1;
        const { error: e2 } = await sb.from('test_rides').update({ termo_arquivo: caminho }).eq('id', r.id);
        if (e2) throw e2;
        toast('Termo gerado.'); telaRide(id);
      } catch (err) { solta(); toast(erroAmigavel(err), true); }
    });
    on(view(), '[data-cnh]', 'click', async (e) => {
      const solta = travar(e.currentTarget, 'Abrindo…');
      try {
        const { data, error: e1 } = await sb.storage.from('cnh').download(r.cnh_arquivo);
        if (e1) throw e1;
        if (r.cnh_arquivo_tipo === 'application/pdf') abrirBlob(data);
        else {
          const url = URL.createObjectURL(data);
          const m = modal(`<h2>CNH — ${esc(r.cliente_nome)}</h2><img src="${url}" alt="CNH" style="width:100%;border-radius:10px"><div class="actions"><button class="btn primary" data-fechar>Fechar</button></div>`, { wide: true });
          on(m.el, '[data-fechar]', 'click', () => URL.revokeObjectURL(url));
        }
      } catch (err) { toast(erroAmigavel(err), true); }
      solta();
    });
    on(view(), '[data-contato]', 'click', () => {
      const m = modal(`<h2>Corrigir contato</h2><form id="f-ct" class="form-grid" novalidate>
        <p class="muted" style="margin:0">Use para reenviar o termo. Os demais dados fazem parte do termo assinado e não mudam.</p>
        <label class="f"><span>Telefone (WhatsApp)</span><input class="input" name="telefone" inputmode="tel" value="${esc(r.cliente_telefone)}"></label>
        <label class="f"><span>E-mail</span><input class="input" name="email" type="email" value="${esc(r.cliente_email || '')}"></label>
        <div class="actions"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn primary" type="submit">Salvar</button></div></form>`);
      const f = $('#f-ct', m.el);
      f.telefone.addEventListener('input', (e) => { e.target.value = maskFone(e.target.value); });
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (digitos(f.telefone.value).length < 10) return toast('Telefone inválido.', true);
        const email = f.email.value.trim();
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast('E-mail inválido.', true);
        const solta = travar($('button[type=submit]', f), 'Salvando…');
        const { error: e1 } = await sb.from('test_rides').update({ cliente_telefone: f.telefone.value, cliente_email: email || null }).eq('id', r.id);
        if (e1) { solta(); return toast(erroAmigavel(e1), true); }
        m.fechar(); toast('Contato atualizado.'); telaRide(id);
      });
    });
    on(view(), '[data-cancelar]', 'click', () => {
      const m = modal(`<h2>Cancelar test ride</h2><form id="f-cc" class="form-grid" novalidate>
        <p class="muted" style="margin:0">O registro continua guardado, marcado como cancelado, e sai dos indicadores.</p>
        <label class="f"><span>Motivo <em>*</em></span><textarea class="input" name="motivo" maxlength="300"></textarea></label>
        <div class="actions"><button type="button" class="btn" data-fechar>Voltar</button><button class="btn danger" type="submit">Cancelar test ride</button></div></form>`);
      const f = $('#f-cc', m.el);
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const motivo = f.motivo.value.trim();
        if (motivo.length < 5) return toast('Descreva o motivo do cancelamento.', true);
        const solta = travar($('button[type=submit]', f), 'Salvando…');
        const { error: e1 } = await sb.from('test_rides').update({ status: 'cancelado', motivo_cancelamento: motivo }).eq('id', r.id);
        if (e1) { solta(); return toast(erroAmigavel(e1), true); }
        m.fechar(); toast('Test ride cancelado.'); telaRide(id);
      });
    });
    on(view(), '[data-excluir]', 'click', async () => {
      if (!(await confirmar('Excluir registro', `O test ride ${r.numero} de ${r.cliente_nome}, a foto da CNH e o termo serão apagados em definitivo. Esta ação não pode ser desfeita.`, 'Excluir em definitivo', true))) return;
      try {
        if (r.cnh_arquivo) await sb.storage.from('cnh').remove([r.cnh_arquivo]);
        if (r.termo_arquivo) await sb.storage.from('termos').remove([r.termo_arquivo]);
        const { error: e1 } = await sb.from('test_rides').delete().eq('id', r.id);
        if (e1) throw e1;
        toast('Registro excluído.'); location.hash = '#/test-rides';
      } catch (err) { toast(erroAmigavel(err), true); }
    });
  }

  // Retenção (LGPD): apaga fotos de CNH vencidas quando um gestor abre o app
  async function retencaoAutomatica() {
    if (!S.me || !isGestor()) return;
    try {
      const { data } = await sb.rpc('cnh_vencidas');
      if (!data?.length) return;
      const { error } = await sb.storage.from('cnh').remove(data.map((x) => x.cnh_arquivo));
      if (error) return;
      await sb.from('test_rides').update({ cnh_arquivo: null, cnh_arquivo_tipo: null }).in('id', data.map((x) => x.id));
    } catch (_) { /* tenta de novo no próximo acesso */ }
  }

  // ------------------------------------------------------------------ motos
  function formMoto(m) {
    const novo = !m, ls = minhasLojas();
    const d = m || { loja_id: ls[0]?.id, modelo: '', placa: '', ano: '', ativo: true };
    const md = modal(`<h2>${novo ? 'Nova moto de test ride' : 'Editar moto'}</h2><form id="f-moto" class="form-grid" novalidate>
      <label class="f"><span>Loja <em>*</em></span><select class="input" name="loja_id">${ls.map((l) => `<option value="${l.id}" ${d.loja_id === l.id ? 'selected' : ''}>${esc(l.nome)}</option>`).join('')}</select></label>
      <label class="f"><span>Modelo <em>*</em></span><input class="input" name="modelo" list="dl-modelos" maxlength="60" value="${esc(d.modelo)}"><datalist id="dl-modelos">${MODELOS_RE.map((x) => `<option value="${x}">`).join('')}</datalist></label>
      <div class="form-grid cols-2"><label class="f"><span>Placa</span><input class="input" name="placa" maxlength="8" style="text-transform:uppercase" value="${esc(d.placa || '')}"></label>
      <label class="f"><span>Ano</span><input class="input" name="ano" inputmode="numeric" maxlength="4" value="${esc(d.ano || '')}"></label></div>
      ${novo ? '' : `<label class="check"><input type="checkbox" name="ativo" ${d.ativo ? 'checked' : ''}> Disponível para test ride</label>`}
      <div class="actions"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn primary" type="submit">${novo ? 'Cadastrar' : 'Salvar'}</button></div></form>`);
    const f = $('#f-moto', md.el);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const linha = { loja_id: f.loja_id.value, modelo: f.modelo.value.trim(), placa: f.placa.value.trim().toUpperCase() || null, ano: parseInt(f.ano.value, 10) || null, ativo: novo ? true : f.ativo.checked };
      if (!linha.modelo) return toast('Informe o modelo.', true);
      const solta = travar($('button[type=submit]', f), 'Salvando…');
      const { error } = novo ? await sb.from('motos').insert(linha) : await sb.from('motos').update(linha).eq('id', m.id);
      if (error) { solta(); return toast(erroAmigavel(error), true); }
      md.fechar(); toast(novo ? 'Moto cadastrada.' : 'Moto atualizada.');
      await carregarCadastros(); telaMotos();
    });
  }

  function telaMotos() {
    if (!isGestor()) return semAcesso();
    const ls = minhasLojas();
    view().innerHTML = `<div class="page" style="max-width:820px"><div class="page-head"><div><h1>Motos de test ride</h1><small>Motos disponíveis para escolha no atendimento</small></div>
      <button class="btn primary" data-nova>${I.plus} Nova moto</button></div>
      ${ls.map((l) => {
        const ms = S.motos.filter((m) => m.loja_id === l.id);
        return `<div class="card"><h2 style="margin-bottom:6px">${esc(l.nome)}</h2>${ms.length ? ms.map((m) => `<a class="list-row" href="#" data-m="${m.id}" style="color:inherit">${I.bike}
          <div class="grow"><b>${esc(m.modelo)}</b><br><small>${[m.placa, m.ano].filter(Boolean).map(esc).join(' · ') || 'Sem placa informada'}</small></div>
          ${m.ativo ? '<span class="chip ok">Disponível</span>' : '<span class="chip">Inativa</span>'}</a>`).join('') : '<p class="muted" style="margin:6px 0 0">Nenhuma moto cadastrada nesta loja.</p>'}</div>`;
      }).join('')}</div>`;
    on(view(), '[data-nova]', 'click', () => formMoto(null));
    on(view(), '[data-m]', 'click', (e) => { e.preventDefault(); formMoto(S.motos.find((x) => x.id === e.currentTarget.dataset.m)); });
  }

  // ------------------------------------------------------------------ mais / conta
  function telaMais() {
    const adm = itensAdmin();
    view().innerHTML = `<div class="page" style="max-width:760px"><h1 style="margin-bottom:16px">Mais</h1>
      ${isGestor() ? `<div class="card"><a class="list-row" href="#/motos" style="color:inherit">${I.bike}<div class="grow">Motos de test ride</div>›</a></div>` : ''}
      ${adm.length ? `<div class="card"><h2 style="margin-bottom:6px">Administração</h2>${adm.map((x) => `<a class="list-row" href="#/${x.h}" style="color:inherit">${x.i}<div class="grow">${esc(x.l)}</div>›</a>`).join('')}</div>` : ''}
      <div class="card"><a class="list-row" href="#/conta" style="color:inherit">${I.user}<div class="grow">Minha conta</div>›</a>
      <a class="list-row" href="#" data-sair2 style="color:var(--bad)">${I.out}<div class="grow">Sair</div></a></div></div>`;
    on(view(), '[data-sair2]', 'click', (e) => { e.preventDefault(); sair(); });
  }

  function telaConta() {
    const me = S.me;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const instalado = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    view().innerHTML = `<div class="page" style="max-width:760px"><h1 style="margin-bottom:16px">Minha conta</h1>
      <div class="card"><div class="list-row" style="border:0"><span class="avatar" style="width:48px;height:48px;font-size:16px">${esc(iniciais(me.nome))}</span>
        <div class="grow"><h2>${esc(me.nome)}</h2><small>${esc(me.email)} · ${esc(PERFIS[me.perfil])}</small></div></div>
        <div class="actions" style="margin-top:8px"><button class="btn" data-senha>Trocar senha</button><button class="btn danger" data-sair3>Sair</button></div></div>
      ${instalado ? '' : `<div class="card"><h2 style="margin-bottom:8px">Instalar no celular</h2>
        ${S.instalar ? '<button class="btn primary" data-instalar>Instalar aplicativo</button>'
          : ios ? '<p class="muted" style="margin:0">No Safari, toque em <b>Compartilhar</b> e depois em <b>Adicionar à Tela de Início</b>.</p>'
          : '<p class="muted" style="margin:0">No Chrome, abra o menu ⋮ e toque em <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.</p>'}</div>`}
      <div class="card"><h2 style="margin-bottom:8px">Segurança</h2><p class="muted" style="margin:0">Sua sessão é encerrada após ${C.INATIVIDADE_MIN || 60} minutos sem uso. Não compartilhe sua senha; cada acesso fica registrado.</p></div></div>`;
    on(view(), '[data-senha]', 'click', () => telaTrocarSenha(false));
    on(view(), '[data-sair3]', 'click', sair);
    on(view(), '[data-instalar]', 'click', async () => { S.instalar.prompt(); await S.instalar.userChoice; S.instalar = null; telaConta(); });
  }

  // ------------------------------------------------------------------ administração: usuários
  function mostrarSenha(nome, email, senha) {
    const m = modal(`<h2>Acesso criado</h2><p class="muted" style="margin:0">Envie estes dados para <b>${esc(nome)}</b> por um canal seguro. No primeiro acesso, o sistema pedirá uma nova senha.</p>
      <div style="margin-top:12px"><small class="muted">Endereço</small><div class="secret" style="font-size:14px;letter-spacing:0">${esc(location.origin + location.pathname)}</div>
      <small class="muted">E-mail</small><div class="secret" style="font-size:15px;letter-spacing:0">${esc(email)}</div>
      <small class="muted">Senha temporária</small><div class="secret">${esc(senha)}</div></div>
      <div class="actions"><button class="btn" data-copiar>${I.copy} Copiar mensagem</button><button class="btn primary" data-fechar>Pronto</button></div>`);
    $('[data-copiar]', m.el).addEventListener('click', async () => {
      const t = `Olá, ${nome}! Seu acesso ao ${NOME_APP}:\n${location.origin + location.pathname}\nE-mail: ${email}\nSenha temporária: ${senha}\nNo primeiro acesso você criará sua senha pessoal.`;
      try { await navigator.clipboard.writeText(t); toast('Mensagem copiada.'); } catch (_) { toast('Não foi possível copiar.', true); }
    });
  }

  function formUsuario(u) {
    const novo = !u;
    const d = u || { perfil: 'vendedor', lojas: [], todas_lojas: false };
    const m = modal(`<h2>${novo ? 'Novo usuário' : 'Editar usuário'}</h2>
      <form id="f-user" class="form-grid" novalidate>
        <label class="f"><span>Nome completo <em>*</em></span><input class="input" name="nome" maxlength="120" value="${esc(d.nome || '')}">
          <div class="hint">É o nome que sai no termo como responsável pela concessionária.</div></label>
        <label class="f"><span>E-mail (login) <em>*</em></span><input class="input" name="email" type="email" value="${esc(d.email || '')}" ${novo ? '' : 'readonly'}></label>
        <label class="f"><span>Perfil</span><select class="input" name="perfil">${Object.entries(PERFIS).map(([k, l]) => `<option value="${k}" ${d.perfil === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
          <div class="hint">Vendedor: registra e vê os próprios test rides. Gestor: vê todos da loja, cadastra motos, exporta e cancela. Master: tudo, inclusive usuários.</div></label>
        <div class="f"><span style="display:block;font-size:13px;font-weight:600;margin-bottom:8px">Lojas que pode acessar</span>
          <label class="check"><input type="checkbox" name="todas_lojas" ${d.todas_lojas ? 'checked' : ''}> Todas as lojas</label>
          <div id="lista-lj" class="perm-grid ${d.todas_lojas ? 'hidden' : ''}">${S.lojas.filter((x) => x.ativo || (d.lojas || []).includes(x.id)).map((x) => `<label class="check"><input type="checkbox" name="lj" value="${x.id}" ${(d.lojas || []).includes(x.id) ? 'checked' : ''}> ${esc(x.nome)}</label>`).join('')}</div></div>
        ${novo ? '' : `<div class="card" style="background:var(--surface-2);box-shadow:none"><div class="actions">
          <button type="button" class="btn sm" data-reset>Gerar nova senha</button>
          ${u.id !== S.me.id ? `<button type="button" class="btn sm ${u.ativo ? 'danger' : ''}" data-ativo>${u.ativo ? 'Desativar acesso' : 'Reativar acesso'}</button>` : ''}</div>
          <small class="muted">Último acesso: ${fmtDH(u.ultimo_acesso)}</small></div>`}
        <div class="actions"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn primary" type="submit">${novo ? 'Criar acesso' : 'Salvar'}</button></div>
      </form>`, { wide: true });
    const f = $('#f-user', m.el);
    f.todas_lojas.addEventListener('change', () => $('#lista-lj', f).classList.toggle('hidden', f.todas_lojas.checked));
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const corpo = { nome: f.nome.value.trim(), email: f.email.value.trim().toLowerCase(), perfil: f.perfil.value,
        todas_lojas: f.todas_lojas.checked, lojas: $$('input[name=lj]:checked', f).map((x) => x.value) };
      if (corpo.nome.split(/\s+/).length < 2) return toast('Informe nome e sobrenome.', true);
      if (novo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(corpo.email)) return toast('Informe um e-mail válido.', true);
      if (!corpo.todas_lojas && !corpo.lojas.length && corpo.perfil !== 'master') return toast('Selecione ao menos uma loja.', true);
      if (!novo && u.id === S.me.id && corpo.perfil !== 'master') return toast('Você não pode remover seu próprio perfil Master.', true);
      const solta = travar($('button[type=submit]', f), 'Salvando…');
      try {
        if (novo) {
          const r = await invocar('admin-usuarios', { acao: 'criar', ...corpo });
          m.fechar(); mostrarSenha(corpo.nome, corpo.email, r.senha_temporaria);
        } else {
          const { email, ...upd } = corpo;
          const { error } = await sb.from('perfis').update(upd).eq('id', u.id);
          if (error) throw error;
          if (u.id === S.me.id) Object.assign(S.me, upd);
          m.fechar(); toast('Usuário atualizado.');
        }
        telaUsuarios();
      } catch (err) { solta(); toast(erroAmigavel(err), true); }
    });
    if (!novo) {
      on(f, '[data-reset]', 'click', async () => {
        if (!(await confirmar('Gerar nova senha', `Uma senha temporária será criada para ${u.nome}. A senha atual deixará de funcionar.`, 'Gerar'))) return;
        try { const r = await invocar('admin-usuarios', { acao: 'redefinir_senha', id: u.id }); m.fechar(); mostrarSenha(u.nome, u.email, r.senha_temporaria); }
        catch (err) { toast(erroAmigavel(err), true); }
      });
      on(f, '[data-ativo]', 'click', async () => {
        const ativo = !u.ativo;
        if (!(await confirmar(ativo ? 'Reativar acesso' : 'Desativar acesso', ativo ? `${u.nome} voltará a acessar o sistema.` : `${u.nome} perderá o acesso imediatamente. O histórico é preservado.`, ativo ? 'Reativar' : 'Desativar', !ativo))) return;
        try { await invocar('admin-usuarios', { acao: 'definir_ativo', id: u.id, ativo }); m.fechar(); toast(ativo ? 'Acesso reativado.' : 'Acesso desativado.'); telaUsuarios(); }
        catch (err) { toast(erroAmigavel(err), true); }
      });
    }
  }

  async function telaUsuarios() {
    if (!isMaster()) return semAcesso();
    carregando();
    const { data, error } = await sb.from('perfis').select('*').order('nome');
    if (error) return toast(erroAmigavel(error), true);
    const us = data || [];
    view().innerHTML = `<div class="page" style="max-width:900px"><div class="page-head"><h1>Usuários</h1><button class="btn primary" data-novo>${I.plus} Novo usuário</button></div>
      <input class="input" type="search" placeholder="Buscar por nome ou e-mail" id="bu" style="margin-bottom:12px" aria-label="Buscar usuário">
      <div class="card" id="lu"></div></div>`;
    const pintar = () => {
      const q = $('#bu').value.toLowerCase();
      const r = us.filter((u) => !q || (u.nome + ' ' + u.email).toLowerCase().includes(q));
      $('#lu').innerHTML = r.length ? r.map((u) => `<a class="list-row" href="#" data-u="${u.id}" style="color:inherit">
        <span class="avatar">${esc(iniciais(u.nome))}</span>
        <div class="grow"><b>${esc(u.nome)}</b><br><small>${esc(u.email)} · ${u.perfil === 'master' || u.todas_lojas ? 'Todas as lojas' : esc((u.lojas || []).map((id) => loja(id)?.nome).filter(Boolean).join(', ') || 'Sem loja')}</small></div>
        <div style="text-align:right"><span class="chip info plain">${esc(PERFIS[u.perfil])}</span>${u.ativo ? '' : '<br><span class="chip bad" style="margin-top:4px">Inativo</span>'}</div></a>`).join('')
        : '<div class="empty"><b>Nenhum usuário</b></div>';
      on($('#lu'), '[data-u]', 'click', (e) => { e.preventDefault(); formUsuario(us.find((x) => x.id === e.currentTarget.dataset.u)); });
    };
    $('#bu').addEventListener('input', pintar);
    on(view(), '[data-novo]', 'click', () => formUsuario(null));
    pintar();
  }

  // ------------------------------------------------------------------ administração: lojas
  function formLoja(l) {
    const novo = !l;
    const d = l || { nome: '', cidade: '', razao_social: 'BRAVICK Comércio de Motos Ltda', limite_percurso: 'Imediações da concessionária (raio de 5 km)', tempo_max_min: 30, ativo: true };
    const m = modal(`<h2>${novo ? 'Nova loja' : 'Editar loja'}</h2><form id="f-loja" class="form-grid" novalidate>
      <label class="f"><span>Nome <em>*</em></span><input class="input" name="nome" maxlength="80" placeholder="Royal Enfield Araçatuba" value="${esc(d.nome)}"></label>
      <label class="f"><span>Cidade do test ride <em>*</em></span><input class="input" name="cidade" maxlength="80" placeholder="Araçatuba - SP" value="${esc(d.cidade)}"><div class="hint">Sai no termo como local do test ride e da assinatura.</div></label>
      <label class="f"><span>Razão social <em>*</em></span><input class="input" name="razao_social" maxlength="120" value="${esc(d.razao_social)}"></label>
      <label class="f"><span>Limite do percurso (padrão)</span><input class="input" name="limite_percurso" maxlength="160" value="${esc(d.limite_percurso)}"></label>
      <label class="f"><span>Tempo máximo padrão (minutos)</span><input class="input" name="tempo_max_min" type="number" min="5" max="120" value="${esc(d.tempo_max_min)}"></label>
      ${novo ? '' : `<label class="check"><input type="checkbox" name="ativo" ${d.ativo ? 'checked' : ''}> Loja ativa</label>`}
      <div class="actions"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn primary" type="submit">${novo ? 'Cadastrar' : 'Salvar'}</button></div></form>`);
    const f = $('#f-loja', m.el);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const linha = { nome: f.nome.value.trim(), cidade: f.cidade.value.trim(), razao_social: f.razao_social.value.trim(), limite_percurso: f.limite_percurso.value.trim(),
        tempo_max_min: Math.min(120, Math.max(5, parseInt(f.tempo_max_min.value, 10) || 30)), ativo: novo ? true : f.ativo.checked };
      if (!linha.nome || !linha.cidade || !linha.razao_social || !linha.limite_percurso) return toast('Preencha os campos obrigatórios.', true);
      const solta = travar($('button[type=submit]', f), 'Salvando…');
      const { error } = novo ? await sb.from('lojas').insert(linha) : await sb.from('lojas').update(linha).eq('id', l.id);
      if (error) { solta(); return toast(erroAmigavel(error), true); }
      m.fechar(); toast(novo ? 'Loja cadastrada.' : 'Loja atualizada.');
      await carregarCadastros(); telaLojas();
    });
  }

  function telaLojas() {
    if (!isMaster()) return semAcesso();
    view().innerHTML = `<div class="page" style="max-width:820px"><div class="page-head"><h1>Lojas</h1><button class="btn primary" data-nova>${I.plus} Nova loja</button></div>
      <div class="card">${S.lojas.map((l) => `<a class="list-row" href="#" data-l="${l.id}" style="color:inherit">${I.building}
        <div class="grow"><b>${esc(l.nome)}</b><br><small>${esc(l.cidade)} · ${l.tempo_max_min} min · ${S.motos.filter((m) => m.loja_id === l.id && m.ativo).length} moto(s)</small></div>
        ${l.ativo ? '' : '<span class="chip">Inativa</span>'}</a>`).join('') || '<div class="empty"><b>Nenhuma loja</b></div>'}</div></div>`;
    on(view(), '[data-nova]', 'click', () => formLoja(null));
    on(view(), '[data-l]', 'click', (e) => { e.preventDefault(); formLoja(loja(e.currentTarget.dataset.l)); });
  }

  // ------------------------------------------------------------------ administração: configurações
  function telaConfig() {
    if (!isMaster()) return semAcesso();
    const c = S.config;
    view().innerHTML = `<div class="page" style="max-width:760px"><h1 style="margin-bottom:16px">Configurações</h1>
      <form class="card form-grid" id="f-cfg" novalidate>
        <label class="f"><span>Guardar a foto da CNH por (dias)</span><input class="input" name="dias" type="number" min="1" max="365" value="${esc(parseInt(c.retencao_cnh_dias, 10) || 45)}">
          <div class="hint">Depois desse prazo a foto é apagada automaticamente. O termo assinado continua guardado.</div></label>
        <label class="check"><input type="checkbox" name="obrig" ${c.cnh_obrigatoria !== false ? 'checked' : ''}> Exigir a foto da CNH em todo test ride</label>
        <label class="check"><input type="checkbox" name="ia" ${c.leitura_ia === true ? 'checked' : ''}> Ler a CNH com IA (exige a função “ler-cnh” e uma chave no servidor)</label>
        <label class="f"><span>Mensagem do WhatsApp</span><textarea class="input" name="msg" style="min-height:220px" maxlength="1500">${esc(typeof c.mensagem_whatsapp === 'string' ? c.mensagem_whatsapp : '')}</textarea>
          <div class="hint">Use <b>{nome}</b> (primeiro nome do cliente), <b>{loja}</b> e <b>{link}</b> (link do termo — obrigatório).</div></label>
        <div class="actions" style="justify-content:flex-end"><button class="btn primary" type="submit">Salvar</button></div>
      </form></div>`;
    const f = $('#f-cfg');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = f.msg.value.trim();
      if (!msg.includes('{link}')) return toast('A mensagem precisa conter {link}.', true);
      const solta = travar($('button[type=submit]', f), 'Salvando…');
      const agora = new Date().toISOString();
      const { error } = await sb.from('configuracoes').upsert([
        { chave: 'retencao_cnh_dias', valor: Math.min(365, Math.max(1, parseInt(f.dias.value, 10) || 45)), atualizado_em: agora },
        { chave: 'cnh_obrigatoria', valor: f.obrig.checked, atualizado_em: agora },
        { chave: 'leitura_ia', valor: f.ia.checked, atualizado_em: agora },
        { chave: 'mensagem_whatsapp', valor: msg, atualizado_em: agora },
      ]);
      solta();
      if (error) return toast(erroAmigavel(error), true);
      await carregarCadastros(); toast('Configurações salvas.');
    });
  }

  // ------------------------------------------------------------------ auditoria
  async function telaAuditoria(params) {
    if (!isMaster()) return semAcesso();
    carregando();
    const tab = params.get('t') || '';
    let q = sb.from('auditoria').select('*').order('criado_em', { ascending: false }).limit(300);
    if (tab) q = q.eq('tabela', tab);
    const { data } = await q;
    const ls = data || [];
    const NOMES = { test_rides: 'Test rides', motos: 'Motos', lojas: 'Lojas', perfis: 'Usuários', configuracoes: 'Configurações' };
    const ACAO = { INSERT: ['Criou', 'ok'], UPDATE: ['Alterou', 'info'], DELETE: ['Excluiu', 'bad'] };
    const rotulo = (a) => { const d = a.dados?.depois || a.dados || {}; return d.numero || d.nome || d.modelo || d.chave || ''; };
    view().innerHTML = `<div class="page" style="max-width:900px"><div class="page-head"><div><h1>Auditoria</h1><small>Registro permanente de alterações (últimos 300)</small></div>
      <select class="input" id="ft" style="max-width:220px" aria-label="Filtrar"><option value="">Tudo</option>${Object.entries(NOMES).map(([k, l]) => `<option value="${k}" ${tab === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="card">${ls.length ? ls.map((a, i) => `<a class="list-row" href="#" data-a="${i}" style="color:inherit"><div class="grow">
        <span class="chip ${ACAO[a.acao]?.[1] || ''}">${ACAO[a.acao]?.[0] || esc(a.acao)}</span> <b>${esc(NOMES[a.tabela] || a.tabela)}</b>${rotulo(a) ? ' · ' + esc(rotulo(a)) : ''}
        <br><small>${fmtDH(a.criado_em)} · ${esc(a.usuario_nome || 'Sistema')}</small></div>›</a>`).join('') : '<div class="empty"><b>Nenhum registro</b></div>'}</div></div>`;
    $('#ft').addEventListener('change', (e) => { location.hash = '#/auditoria' + (e.target.value ? '?t=' + e.target.value : ''); });
    on(view(), '[data-a]', 'click', (e) => {
      e.preventDefault();
      const a = ls[+e.currentTarget.dataset.a];
      let corpo;
      if (a.acao === 'UPDATE' && a.dados?.antes) {
        const mud = Object.keys(a.dados.depois || {}).filter((k) => JSON.stringify(a.dados.antes[k]) !== JSON.stringify(a.dados.depois[k]));
        corpo = mud.length ? `<table style="width:100%;font-size:13px;border-collapse:collapse">${mud.map((k) => `<tr><td style="padding:6px 4px;border-bottom:1px solid var(--line);font-weight:600;vertical-align:top">${esc(k)}</td>
          <td style="padding:6px 4px;border-bottom:1px solid var(--line);color:var(--bad);word-break:break-word">${esc(JSON.stringify(a.dados.antes[k]))}</td>
          <td style="padding:6px 4px;border-bottom:1px solid var(--line);color:var(--ok);word-break:break-word">${esc(JSON.stringify(a.dados.depois[k]))}</td></tr>`).join('')}</table>` : '<p class="muted">Sem diferenças relevantes.</p>';
      } else corpo = `<pre class="json">${esc(JSON.stringify(a.dados, null, 2))}</pre>`;
      modal(`<h2>${esc(ACAO[a.acao]?.[0] || a.acao)} · ${esc(NOMES[a.tabela] || a.tabela)}</h2><p class="muted" style="margin-top:0">${fmtDH(a.criado_em)} · ${esc(a.usuario_nome || 'Sistema')}</p>${corpo}
        <div class="actions"><button class="btn primary" data-fechar>Fechar</button></div>`, { wide: true });
    });
  }

  iniciar();
})();
