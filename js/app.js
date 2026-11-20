(() => {
  "use strict";

  // ordem dos nichos na home e na página de trabalhos
  const NICHOS = [
    ["vsl", "VSL"],
    ["canal", "Canais dark"],
    ["motion", "Motion graphics"],
    ["youtube", "YouTube"],
    ["gameplay", "Gameplay"],
  ];
  const ROTULO = Object.fromEntries(NICHOS);
  const pagina = document.body.dataset.pagina || "home";
  const preenchido = (v) => typeof v === "string" && v.trim() !== "" && !/^PREENCHER/i.test(v.trim());
  const semHover = window.matchMedia("(hover: none)").matches;
  const reduzirMov = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (id) => document.getElementById(id);

  $("ano").textContent = new Date().getFullYear();

  /* ---------- Fundo aurora em tela cheia, atrás de tudo (js/fundos.js) ---------- */
  if (window.FundoSite) window.FundoSite.montar();

  /* ---------- Foto (só se existir assets/eu/foto.webp) ---------- */

  /* ---------- Contato ---------- */
  fetch("dados/contato.json", { cache: "no-cache" })
    .then((r) => r.json())
    .then((c) => {
      const numero = String(c.whatsapp || "").replace(/\D/g, "");
      const okWhats = preenchido(c.whatsapp) && numero.length >= 10;
      const msg = encodeURIComponent(c.mensagem_whatsapp || "Olá George, vi seu portfólio e...");
      document.querySelectorAll(".js-whatsapp").forEach((a) => {
        if (okWhats) a.href = `https://wa.me/${numero}?text=${msg}`;
        else { a.removeAttribute("target"); a.title = "WhatsApp ainda não configurado (dados/contato.json)"; }
      });
      document.querySelectorAll(".js-email").forEach((a) => {
        if (preenchido(c.email)) a.href = `mailto:${c.email}?subject=${encodeURIComponent("Contato pelo portfólio")}`;
        else a.title = "E-mail ainda não configurado (dados/contato.json)";
      });
      // redes: só aparecem as preenchidas; sem nenhuma, a área some
      const ul = $("redes");
      if (ul) {
        const redes = (c.redes || []).filter((r) => preenchido(r.url) && /^https:\/\//.test(r.url));
        redes.forEach((r) => {
          const li = document.createElement("li");
          const a = document.createElement("a");
          a.href = r.url; a.target = "_blank"; a.rel = "noopener"; a.textContent = r.nome;
          li.append(a); ul.append(li);
        });
        ul.hidden = redes.length === 0;
      }
    })
    .catch(() => {});

  /* ---------- Cards com prévia ---------- */
  const carregarPrevia = (video) => {
    if (video.dataset.carregado) return;
    video.dataset.carregado = "1";
    const { webm, mp4 } = video.dataset;
    if (webm) { const s = document.createElement("source"); s.src = webm; s.type = "video/webm"; video.append(s); }
    if (mp4) { const s = document.createElement("source"); s.src = mp4; s.type = "video/mp4"; video.append(s); }
    // se o webm falhar na decodificação (ex.: decodificador de hardware), cai para o mp4
    video.addEventListener("error", () => {
      if (mp4 && !video.dataset.usandoMp4) {
        video.dataset.usandoMp4 = "1";
        video.querySelectorAll("source").forEach((s) => s.remove());
        video.src = mp4;
        const card = video.closest(".card");
        if (card && card.classList.contains("tocando")) video.play().catch(() => {});
      }
    });
    video.load();
  };
  // a prévia é ação do visitante (hover/toque): toca mesmo com movimento reduzido
  const tocar = (card) => {
    if (card.closest("[hidden]")) return;
    const v = card.querySelector("video");
    if (!v) return;
    carregarPrevia(v);
    const p = v.play();
    if (p) p.then(() => card.classList.add("tocando")).catch(() => {});
    else card.classList.add("tocando");
  };
  const parar = (card) => {
    const v = card.querySelector("video");
    card.classList.remove("tocando");
    delete card.dataset.armado;
    if (v) v.pause();
  };

  // celular: toca quando o card aparece na tela — exceto com movimento reduzido
  // (aí a prévia toca no 1º toque e o 2º toque abre o modal)
  const toqueDuplo = semHover && reduzirMov;
  const observador = semHover && !reduzirMov && "IntersectionObserver" in window
    ? new IntersectionObserver((entradas) => {
        entradas.forEach((e) => (e.isIntersecting ? tocar(e.target) : parar(e.target)));
      }, { threshold: 0.6 })
    : null;

  const criarCard = (t, i, { rotuloNicho = true } = {}) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "card" + (t.vertical === false ? " horizontal" : "");
    card.dataset.nicho = t.nicho;
    card.setAttribute("aria-label", `Assistir: ${t.titulo}`);

    const midia = document.createElement("div");
    midia.className = "card-midia";
    const img = document.createElement("img");
    img.src = t.thumb; img.alt = ""; img.decoding = "async";
    img.loading = i < 5 ? "eager" : "lazy";
    midia.append(img);
    if (t.previa && (t.previa.mp4 || t.previa.webm)) {
      const v = document.createElement("video");
      v.muted = true; v.loop = true; v.playsInline = true; v.preload = "none";
      v.setAttribute("muted", ""); v.setAttribute("playsinline", ""); v.setAttribute("aria-hidden", "true");
      if (t.previa.webm) v.dataset.webm = t.previa.webm;
      if (t.previa.mp4) v.dataset.mp4 = t.previa.mp4;
      midia.append(v);
    }
    card.append(midia);

    const play = document.createElement("span");
    play.className = "card-play";
    play.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-play"/></svg>';
    card.append(play);

    const info = document.createElement("div");
    info.className = "card-info";
    if (rotuloNicho) {
      const cat = document.createElement("div");
      cat.className = "card-cat"; cat.textContent = ROTULO[t.nicho] || t.nicho;
      info.append(cat);
    }
    const tit = document.createElement("div");
    tit.className = "card-titulo"; tit.textContent = t.titulo;
    info.append(tit);
    card.append(info);

    if (!semHover) {
      card.addEventListener("mouseenter", () => tocar(card));
      card.addEventListener("mouseleave", () => parar(card));
      card.addEventListener("focus", () => tocar(card));
      card.addEventListener("blur", () => parar(card));
    }
    card.addEventListener("click", () => {
      if (toqueDuplo && !card.dataset.armado && t.previa) {
        document.querySelectorAll(".card[data-armado]").forEach(parar);
        card.dataset.armado = "1";
        tocar(card);
        return;
      }
      abrirModal(t);
    });
    if (observador) observador.observe(card);
    return card;
  };

  /* ---------- Dados ---------- */
  const porOrdem = (a, b) => (a.ordem ?? 999) - (b.ordem ?? 999);
  const carregarTrabalhos = () =>
    fetch("dados/trabalhos.json", { cache: "no-cache" })
      .then((r) => r.json())
      .then((d) => (d.trabalhos || []).filter((t) => t.ativo !== false && ROTULO[t.nicho]));

  // HOME: um card por nicho (o marcado destaque_home; se nenhum, o primeiro). Nicho vazio não aparece.
  if (pagina === "home") {
    const grade = $("grade-home");
    carregarTrabalhos().then((lista) => {
      let i = 0;
      NICHOS.forEach(([n]) => {
        const doNicho = lista.filter((t) => t.nicho === n).sort(porOrdem);
        const escolhido = doNicho.find((t) => t.destaque_home) || doNicho[0];
        if (escolhido) grade.append(criarCard(escolhido, i++));
      });
    }).catch(() => { grade.textContent = "Não foi possível carregar os trabalhos."; });
  }

  // TRABALHOS: todos, agrupados por nicho, com filtro
  if (pagina === "trabalhos") {
    const area = $("nichos");
    const filtros = $("filtros-nicho");
    carregarTrabalhos().then((lista) => {
      const presentes = NICHOS.filter(([n]) => lista.some((t) => t.nicho === n));
      const botao = (valor, texto) => {
        const b = document.createElement("button");
        b.className = "filtro"; b.dataset.filtro = valor; b.textContent = texto;
        b.setAttribute("aria-pressed", "false");
        b.addEventListener("click", () => filtrar(valor, true));
        filtros.append(b);
      };
      botao("todos", "Todos");
      let i = 0;
      presentes.forEach(([n, rotulo]) => {
        const doNicho = lista.filter((t) => t.nicho === n)
          .sort((a, b) => (b.destaque_home === true) - (a.destaque_home === true) || porOrdem(a, b));
        botao(n, rotulo);
        const sec = document.createElement("section");
        sec.className = "nicho"; sec.id = n; sec.dataset.nicho = n;
        const h = document.createElement("h2");
        h.textContent = rotulo;
        const qtd = document.createElement("small");
        qtd.textContent = doNicho.length === 1 ? "1 trabalho" : `${doNicho.length} trabalhos`;
        h.append(qtd);
        const g = document.createElement("div");
        g.className = "grade";
        doNicho.forEach((t) => g.append(criarCard(t, i++, { rotuloNicho: false })));
        sec.append(h, g);
        area.append(sec);
      });
      const inicial = location.hash.slice(1);
      filtrar(presentes.some(([n]) => n === inicial) ? inicial : "todos", false);
    }).catch(() => { area.textContent = "Não foi possível carregar os trabalhos."; });

    function filtrar(valor, rolar) {
      filtros.querySelectorAll(".filtro").forEach((b) => {
        const ativo = b.dataset.filtro === valor;
        b.classList.toggle("ativo", ativo);
        b.setAttribute("aria-pressed", ativo ? "true" : "false");
      });
      area.querySelectorAll(".nicho").forEach((s) => {
        s.hidden = valor !== "todos" && s.dataset.nicho !== valor;
        if (s.hidden) s.querySelectorAll(".card.tocando").forEach(parar);
      });
      history.replaceState(null, "", valor === "todos" ? location.pathname + location.search : "#" + valor);
      if (rolar) $("filtros-nicho").scrollIntoView({ behavior: reduzirMov ? "auto" : "smooth", block: "start" });
    }
  }

  /* ---------- Modal ---------- */
  const modal = $("modal");
  const caixaVideo = $("modal-video");

  // ID de um arquivo do Google Drive (…/file/d/<ID>/view ou ?id=<ID>)
  const idDrive = (link) => {
    if (!preenchido(link) || !/drive\.google\.com/.test(link)) return null;
    return (link.match(/\/file\/d\/([\w-]{20,})/) || link.match(/[?&]id=([\w-]{20,})/) || [])[1] || null;
  };

  const urlEmbed = (link) => {
    if (!preenchido(link)) return null;
    let u;
    try { u = new URL(link); } catch { return null; }
    const host = u.hostname.replace(/^www\.|^m\./, "");
    const drive = idDrive(link);
    if (drive) return `https://drive.google.com/file/d/${drive}/preview`;
    if (host === "youtu.be") return `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}?autoplay=1&rel=0`;
    if (host.endsWith("youtube.com")) {
      const id = u.searchParams.get("v") || (u.pathname.match(/\/(?:embed|shorts|live)\/([\w-]+)/) || [])[1];
      return id ? `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0` : null;
    }
    if (host === "vimeo.com" || host === "player.vimeo.com") {
      const m = u.pathname.match(/(?:video\/)?(\d+)(?:\/([\w]+))?/);
      if (!m) return null;
      const h = m[2] || u.searchParams.get("h");
      return `https://player.vimeo.com/video/${m[1]}?autoplay=1${h ? `&h=${h}` : ""}`;
    }
    return null;
  };

  function abrirModal(t) {
    document.querySelectorAll(".card.tocando").forEach(parar);
    caixaVideo.innerHTML = "";
    modal.querySelectorAll(".modal-alt").forEach((e) => e.remove());
    const drive = t.plataforma === "drive" || (!t.plataforma && idDrive(t.link)) ? idDrive(t.link) : null;
    // Drive: sempre 16:9 (o player do Drive tem barras próprias)
    modal.classList.toggle("vertical", !drive && t.vertical !== false);
    const embed = urlEmbed(t.link);
    if (embed && drive) {
      // Google Drive: iframe /preview + plano B (botão para abrir no Drive) se não carregar
      const f = document.createElement("iframe");
      f.src = embed; f.title = t.titulo;
      f.allow = "autoplay; fullscreen";
      f.allowFullscreen = true;
      const planoB = document.createElement("div");
      planoB.className = "modal-planob"; planoB.hidden = true;
      const p = document.createElement("p");
      p.textContent = "O player do Google Drive não carregou aqui.";
      const a = document.createElement("a");
      a.className = "botao botao-primario"; a.target = "_blank"; a.rel = "noopener";
      a.href = `https://drive.google.com/file/d/${drive}/view`;
      a.textContent = "Assistir no Google Drive";
      planoB.append(p, a);
      const mostrarPlanoB = () => { if (f.isConnected) { planoB.hidden = false; f.remove(); alt.remove(); } };
      // o iframe dispara "load" até com página de erro, então a checagem é por uma sonda:
      // a miniatura do arquivo só vem como imagem se o Drive responder e o arquivo for público
      let ok = false;
      const sonda = new Image();
      sonda.referrerPolicy = "no-referrer";
      sonda.onload = () => { ok = sonda.naturalWidth > 0; if (!ok) mostrarPlanoB(); };
      sonda.onerror = mostrarPlanoB;
      sonda.src = `https://drive.google.com/thumbnail?id=${drive}&sz=w64`;
      setTimeout(() => { if (!ok) mostrarPlanoB(); }, 10000);
      // link discreto, sempre visível, para quem não conseguir tocar dentro do site
      const alt = document.createElement("a");
      alt.className = "modal-alt"; alt.target = "_blank"; alt.rel = "noopener";
      alt.href = a.href; alt.textContent = "Não tocou? Assistir no Google Drive ↗";
      caixaVideo.append(f, planoB);
      modal.querySelector(".modal-info").append(alt);
    } else if (embed) {
      const f = document.createElement("iframe");
      f.src = embed; f.title = t.titulo;
      f.allow = "autoplay; fullscreen; picture-in-picture; encrypted-media";
      f.allowFullscreen = true;
      caixaVideo.append(f);
    } else {
      // sem link ainda: mostra a prévia em loop
      const v = document.createElement("video");
      v.muted = true; v.loop = true; v.autoplay = true; v.playsInline = true; v.poster = t.thumb;
      v.setAttribute("playsinline", "");
      if (t.previa?.webm) { const s = document.createElement("source"); s.src = t.previa.webm; s.type = "video/webm"; v.append(s); }
      if (t.previa?.mp4) { const s = document.createElement("source"); s.src = t.previa.mp4; s.type = "video/mp4"; v.append(s); }
      const aviso = document.createElement("p");
      aviso.className = "modal-aviso"; aviso.textContent = "Prévia — vídeo completo em breve.";
      caixaVideo.append(v, aviso);
    }
    $("modal-cat").textContent = ROTULO[t.nicho] || t.nicho;
    $("modal-titulo").textContent = t.titulo;
    $("modal-desc").textContent = preenchido(t.descricao) ? t.descricao : "";
    modal.showModal();
  }
  modal.addEventListener("close", () => { caixaVideo.innerHTML = ""; modal.querySelectorAll(".modal-alt").forEach((e) => e.remove()); });
  $("modal-fechar").addEventListener("click", () => modal.close());
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.close(); });

  /* ---------- Link ativo na navegação (home) ---------- */
  if (pagina === "home" && "IntersectionObserver" in window) {
    const links = [...document.querySelectorAll(".nav-links a")];
    const obsSecoes = new IntersectionObserver((ents) => {
      ents.forEach((e) => {
        if (e.isIntersecting) links.forEach((l) => l.classList.toggle("ativo", l.getAttribute("href") === `#${e.target.id}`));
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    document.querySelectorAll("main section[id]").forEach((s) => obsSecoes.observe(s));
  }
})();
