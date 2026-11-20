/* Vídeo de apresentação do hero.
   - Pôster (.webp) aparece na hora; o vídeo mudo em loop só carrega depois do resto da página (load + ocioso).
   - 16:9 no desktop (≥ 900 px), 9:16 no celular; troca de versão mantém o ponto do vídeo.
   - Economia de dados (Save-Data) ou conexão lenta (2G): fica só o pôster com um botão de play.
   - Botão de som: troca para a versão com áudio (AAC) no mesmo ponto; clicar de novo silencia.
   - Pausa quando sai da tela ou a aba fica oculta. */
(() => {
  "use strict";
  const fig = document.getElementById("hero-video");
  if (!fig) return;
  const video = fig.querySelector("video");
  const btPlay = fig.querySelector(".hero-video-play");
  const btSom = fig.querySelector(".hero-video-som");
  const mq = window.matchMedia("(min-width: 900px)");
  const conexao = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const economia = !!(conexao && (conexao.saveData || /(^|-)2g$/.test(conexao.effectiveType || "")));
  const temWebm = video.canPlayType('video/webm; codecs="vp9"') !== "";

  let carregado = false;   // já recebeu src
  let comSom = false;      // usando a versão com áudio (e sem mudo)
  let naTela = true;
  let pausadoPeloUsuario = false;

  const formato = () => (mq.matches ? "16x9" : "9x16");
  // data-mp4-16x9, data-webm-9x16, data-som-16x9… (lidos por getAttribute: "-1" não vira camelCase no dataset)
  const fonte = () => fig.getAttribute(`data-${comSom ? "som" : (temWebm ? "webm" : "mp4")}-${formato()}`);

  function tocar() {
    if (!carregado || !naTela || document.hidden || pausadoPeloUsuario) return;
    const p = video.play();
    if (p && p.catch) p.catch(() => { /* autoplay bloqueado: fica o pôster com o play */ mostrarPlay(true); });
  }
  function mostrarPlay(sim) { btPlay.hidden = !sim; fig.classList.toggle("parado", sim); }

  // troca de arquivo mantendo o ponto do vídeo
  function trocarFonte() {
    const t = carregado ? video.currentTime : 0;
    const tocando = carregado && !video.paused;
    video.src = fonte();
    carregado = true;
    if (t > 0) {
      // volta ao mesmo ponto assim que o trecho estiver "buscável" (metadados ou o primeiro progresso do download)
      const pular = () => {
        const s = video.seekable;
        if (s.length && s.end(s.length - 1) >= t) {
          try { video.currentTime = t; } catch (e) { /* ignora */ }
          ["loadedmetadata", "progress", "canplay"].forEach((ev) => video.removeEventListener(ev, pular));
        }
      };
      ["loadedmetadata", "progress", "canplay"].forEach((ev) => video.addEventListener(ev, pular));
    }
    if (tocando || !pausadoPeloUsuario) tocar();
  }

  function carregar() {
    if (carregado) return;
    video.preload = "auto";
    trocarFonte();
    btSom.hidden = false;
  }

  video.addEventListener("playing", () => { fig.classList.add("tocando"); mostrarPlay(false); });

  btPlay.addEventListener("click", () => {
    pausadoPeloUsuario = false;
    if (!carregado) carregar(); else tocar();
  });

  btSom.addEventListener("click", () => {
    comSom = !comSom;
    btSom.setAttribute("aria-pressed", String(comSom));
    btSom.setAttribute("aria-label", comSom ? "Desativar som" : "Ativar som");
    fig.classList.toggle("com-som", comSom);
    if (comSom) {
      trocarFonte();          // versão com áudio, no mesmo ponto
      video.muted = false;
      pausadoPeloUsuario = false;
      tocar();
    } else {
      video.muted = true;     // continua a versão com áudio, só silenciada (sem recarregar)
    }
  });

  // breakpoint mudou (girou o celular, redimensionou a janela): troca 16:9 <-> 9:16 no mesmo ponto
  mq.addEventListener("change", () => { if (carregado) trocarFonte(); });

  // pausa fora da tela / aba oculta
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([e]) => {
      naTela = e.isIntersecting;
      if (!carregado) return;
      if (naTela) tocar(); else video.pause();
    }, { threshold: 0.15 }).observe(fig);
  }
  document.addEventListener("visibilitychange", () => {
    if (!carregado) return;
    if (document.hidden) video.pause(); else tocar();
  });

  if (economia) { mostrarPlay(true); return; }   // só o pôster + play

  // carrega depois do conteúdo principal
  const depois = () => ("requestIdleCallback" in window ? requestIdleCallback(carregar, { timeout: 2500 }) : setTimeout(carregar, 600));
  if (document.readyState === "complete") depois();
  else window.addEventListener("load", depois, { once: true });
})();
