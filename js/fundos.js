/* Fundo animado do site: shader WebGL próprio (aurora/fumaça), sem dependências.
   Uso: FundoSite.montar() -> controle { destruir(), estado }
   - um canvas fixo em tela cheia, atrás de todo o conteúdo (o conteúdo rola por cima);
   - manchas de luz que passeiam devagar por várias regiões da tela + fumaça fbm;
   - resolução reduzida (1/2 no desktop, 1/3 no celular) e no máximo ~30 fps;
   - mesma velocidade para todos, inclusive com prefers-reduced-motion (movimento lento, de fundo);
   - pausa só quando a aba fica oculta (o fundo está sempre visível);
   - se o WebGL falhar, fica o degradê estático em tela cheia do CSS (.fundo-site.estatico).
   O estado fica em data-estado no .fundo-site e em FundoSite.atual.estado (para diagnóstico). */
(() => {
  "use strict";

  const VEL = 2;   // velocidade da animação (2 = o dobro da original)
  const celular = matchMedia("(max-width: 720px), (pointer: coarse)").matches;

  const corCSS = (nome) => {
    const v = getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
    const m = v.match(/^#?([0-9a-f]{6})$/i);
    if (!m) return [0, 0, 0];
    const n = parseInt(m[1], 16);
    return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  };

  const FRAG = `
precision mediump float;
uniform vec2 uRes; uniform float uT;
uniform vec3 uFundo, uFundo2, uMeio, uLuz;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), u.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0., a = .5; mat2 r = mat2(.8, .6, -.6, .8);
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = r * p * 2. + 3.1; a *= .5; }
  return v;
}
// mancha de luz que passeia devagar (Lissajous) por uma área da tela
float mancha(vec2 p, vec2 tela, vec2 base, vec2 amp, vec2 fr, float fase, float t, float raio){
  vec2 c = tela * (base + amp * vec2(sin(t * fr.x + fase), cos(t * fr.y + fase * 1.7)));
  return smoothstep(raio, 0., length(p - c));
}
void main(){
  float lado = max(uRes.x, uRes.y);
  vec2 p = gl_FragCoord.xy / lado;
  vec2 tela = uRes / lado;                        // tamanho da tela na mesma escala de p
  float t = uT * .035;
  vec2 q = vec2(fbm(p * 2.2 + vec2(0., t)), fbm(p * 2.2 + vec2(5.2, -t * .8)));
  float n = fbm(p * 1.8 + 1.9 * q + vec2(t * .5, -t * .35));
  // três manchas em regiões diferentes, com ritmos diferentes; a fumaça deforma a borda delas
  vec2 pw = p + (q - .5) * .18;
  float luz = mancha(pw, tela, vec2(.78, .80), vec2(.20, .16), vec2(.55, .43), 0.0, t, .62)
            + mancha(pw, tela, vec2(.22, .45), vec2(.18, .24), vec2(.37, .61), 2.1, t, .56)
            + mancha(pw, tela, vec2(.62, .15), vec2(.26, .12), vec2(.47, .33), 4.4, t, .52);
  luz = 1. - exp(-1.25 * luz);                    // soma suave: manchas que se cruzam não estouram
  float fumaca = smoothstep(.28, .9, n);
  vec3 c = uFundo;
  c = mix(c, uFundo2, luz * .85);
  c = mix(c, uMeio, fumaca * luz * .50);
  c += uLuz * pow(fumaca * luz, 3.) * .14;
  c += (hash(gl_FragCoord.xy + fract(uT)) - .5) / 255.;   // dithering contra banding
  gl_FragColor = vec4(c, 1.);
}`;

  function criarAurora(el) {
    const cv = document.createElement("canvas");
    const gl = cv.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
    if (!gl) throw new Error("sem WebGL");
    const sh = (tipo, src) => {
      const s = gl.createShader(tipo); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, "attribute vec2 a; void main(){ gl_Position = vec4(a, 0., 1.); }"));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error("shader não linkou");
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = {};
    ["uRes", "uT", "uFundo", "uFundo2", "uMeio", "uLuz"].forEach((n) => (U[n] = gl.getUniformLocation(prog, n)));

    const escala = celular ? 0.33 : 0.5;   // tudo baixa frequência: renderiza pequeno e o CSS amplia
    el.append(cv);
    gl.uniform3fv(U.uFundo, corCSS("--a1"));
    gl.uniform3fv(U.uFundo2, corCSS("--a3"));
    gl.uniform3fv(U.uMeio, corCSS("--a9"));
    gl.uniform3fv(U.uLuz, corCSS("--a11"));
    const medir = () => {
      const w = Math.max(1, Math.round(el.clientWidth * escala));
      const h = Math.max(1, Math.round(el.clientHeight * escala));
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; gl.viewport(0, 0, w, h); }
      gl.uniform2f(U.uRes, w, h);
    };
    medir();
    // tempo da animação acumulado (começa "no meio"; não conta o tempo em pausa)
    let tAnim = 40, tUlt = performance.now(), ultimo = 0;
    const desenhar = (agora) => {
      if (agora > tUlt) { tAnim += Math.min(agora - tUlt, 1000) / 1000 * VEL; tUlt = agora; }
      gl.uniform1f(U.uT, tAnim);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    // o .fundo-site tem altura 100lvh: a barra do navegador do celular aparecer/sumir não redimensiona
    const ro = new ResizeObserver(() => { medir(); desenhar(performance.now()); });
    ro.observe(el);
    cv.addEventListener("webglcontextlost", (e) => e.preventDefault());
    return {
      quadro(agora) {               // limita a ~30 fps
        if (agora - ultimo < 33) return;
        ultimo = agora; desenhar(agora);
      },
      retomar(agora) { tUlt = agora; },   // depois de pausa, não pula o tempo parado
      destruir() { ro.disconnect(); gl.getExtension("WEBGL_lose_context")?.loseContext(); cv.remove(); },
    };
  }

  function montar() {
    const el = document.createElement("div");
    el.className = "fundo-site";
    el.setAttribute("aria-hidden", "true");
    document.body.prepend(el);
    document.body.classList.add("com-fundo");

    const ctl = { estado: "carregando", destruir() {} };
    let fx = null, raf = 0;
    const loop = (agora) => { fx.quadro(agora); raf = requestAnimationFrame(loop); };
    const marcar = (e) => { ctl.estado = e; el.dataset.estado = e; };
    const atualizar = () => {
      if (!document.hidden) {
        if (!raf) { fx.retomar(performance.now()); raf = requestAnimationFrame(loop); }
        marcar("rodando");
      } else {
        cancelAnimationFrame(raf); raf = 0;
        marcar("pausado");
      }
    };

    try {
      fx = criarAurora(el);
    } catch (err) {
      console.warn("[fundo] usando degradê estático:", err.message || err);
      el.classList.add("estatico", "visivel");
      marcar("fallback estático (sem WebGL)");
      return ctl;
    }
    requestAnimationFrame(() => el.classList.add("visivel"));
    document.addEventListener("visibilitychange", atualizar);
    atualizar();
    ctl.destruir = () => {
      document.removeEventListener("visibilitychange", atualizar);
      cancelAnimationFrame(raf);
      fx.destruir();
      el.remove();
      document.body.classList.remove("com-fundo");
    };
    return ctl;
  }

  window.FundoSite = { montar: () => (window.FundoSite.atual = montar()), atual: null };
})();
