/* Fundo animado do hero: shader WebGL próprio (aurora/fumaça), sem dependências.
   Uso: FundoHero.montar(elementoDoHero) -> controle { destruir(), estado }
   - pausa quando a aba fica oculta ou o hero sai da tela;
   - resolução reduzida (1/2 no desktop, 1/3 no celular) e no máximo ~30 fps;
   - prefers-reduced-motion: desenha um quadro parado;
   - se o WebGL falhar, fica o degradê estático do CSS (.hero sem a classe .com-fundo).
   ?movimento=1 na URL ignora o "reduzir movimento" do sistema (só para conferir localmente). */
(() => {
  "use strict";

  const forcar = /[?&]movimento=1\b/.test(location.search);
  const reduzMov = !forcar && matchMedia("(prefers-reduced-motion: reduce)").matches;
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
void main(){
  float lado = max(uRes.x, uRes.y);
  vec2 p = gl_FragCoord.xy / lado;
  vec2 canto = uRes / lado;                       // canto superior direito
  float t = uT * .035;
  vec2 q = vec2(fbm(p * 2.2 + vec2(0., t)), fbm(p * 2.2 + vec2(5.2, -t * .8)));
  float n = fbm(p * 1.8 + 1.9 * q + vec2(t * .5, -t * .35));
  float d = length((p - canto) * vec2(.8, 1.));
  float luz = smoothstep(1.15, .0, d);            // some antes da borda oposta
  float fumaca = smoothstep(.28, .9, n);
  vec3 c = uFundo;
  c = mix(c, uFundo2, luz * .9);
  c = mix(c, uMeio, fumaca * luz * .62);
  c += uLuz * pow(fumaca * luz, 3.) * .22;
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
    const t0 = performance.now() - 40000; // começa "no meio" da animação
    let ultimo = 0, tParado = null;
    const desenhar = (agora) => {
      gl.uniform1f(U.uT, ((tParado ?? agora) - t0) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const ro = new ResizeObserver(() => { medir(); desenhar(performance.now()); });
    ro.observe(el);
    cv.addEventListener("webglcontextlost", (e) => e.preventDefault());
    return {
      quadro(agora) {               // limita a ~30 fps
        if (agora - ultimo < 33) return;
        ultimo = agora; desenhar(agora);
      },
      parado() { tParado = t0 + 40000; desenhar(0); },
      destruir() { ro.disconnect(); gl.getExtension("WEBGL_lose_context")?.loseContext(); cv.remove(); },
    };
  }

  function montar(hero) {
    const el = document.createElement("div");
    el.className = "hero-fundo";
    el.setAttribute("aria-hidden", "true");
    hero.prepend(el);

    const ctl = { estado: "carregando", destruir() {} };
    let fx = null, visivelTela = true, raf = 0;
    const loop = (agora) => { fx.quadro(agora); raf = requestAnimationFrame(loop); };
    const atualizar = () => {
      if (!fx) return;
      if (visivelTela && !document.hidden) {
        if (!raf) raf = requestAnimationFrame(loop);
        ctl.estado = "rodando";
      } else {
        cancelAnimationFrame(raf); raf = 0;
        ctl.estado = "pausado";
      }
    };
    const io = new IntersectionObserver(([e]) => { visivelTela = e.isIntersecting; atualizar(); });

    try {
      fx = criarAurora(el);
    } catch (err) {
      console.warn("[fundo] usando degradê estático:", err.message || err);
      el.remove();
      ctl.estado = "fallback estático";
      return ctl;
    }
    hero.classList.add("com-fundo");
    requestAnimationFrame(() => el.classList.add("visivel"));
    if (reduzMov) {
      fx.parado();
      ctl.estado = "parado (movimento reduzido)";
    } else {
      io.observe(hero);
      document.addEventListener("visibilitychange", atualizar);
    }
    ctl.destruir = () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", atualizar);
      cancelAnimationFrame(raf);
      fx.destruir();
      el.remove();
      hero.classList.remove("com-fundo");
    };
    return ctl;
  }

  window.FundoHero = { montar };
})();
