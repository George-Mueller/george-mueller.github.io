#!/usr/bin/env python3
"""Adiciona (ou atualiza) um trabalho do portfólio.

1) Com vídeo local: gera uma prévia curta (mp4 H.264 + webm VP9, sem áudio, 720p, alvo < 3 MB,
   sem metadados do original) e uma thumb .webp, e grava a entrada em dados/trabalhos.json.

  python ferramentas/adicionar_trabalho.py VIDEO --titulo "Título" --nicho canal \
      --link "https://youtu.be/XXXX" [--descricao "Meu papel: ..."] [--inicio 12.5] \
      [--duracao 7] [--destaque] [--id slug] [--substituir] [--inativo]

2) Só com o link do YouTube (sem vídeo local): título e formato (Short = vertical) vêm do
   oEmbed, a thumb é baixada do YouTube e o card fica sem prévia.

  python ferramentas/adicionar_trabalho.py --link "https://youtu.be/XXXX" [--nicho vsl] [--titulo "..."]

3) Gerar depois a prévia de um trabalho que já existe (mantém título, link etc.):

  python ferramentas/adicionar_trabalho.py VIDEO --id vsl-memoria --substituir [--manter-thumb]

Nichos: vsl | canal | motion | youtube | gameplay (sem --nicho, tenta deduzir do título/canal).
--destaque  vira o card daquele nicho na home (tira o destaque dos outros do mesmo nicho).
Links do YouTube são limpos (sem ?si= e outros parâmetros de rastreamento).

Sem --inicio, o trecho é escolhido automaticamente: a janela de maior movimento
(soma das diferenças entre quadros), ignorando o comecinho e o final do vídeo.

O vídeo de origem NUNCA é copiado para o site — só a prévia gerada.
Para tirar um trabalho do ar: ferramentas/remover_trabalho.py.
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import re
import shutil
import subprocess
import sys
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path
from datetime import datetime

RAIZ = Path(__file__).resolve().parent.parent
ARQ_TRABALHOS = RAIZ / "dados" / "trabalhos.json"
DIR_PREVIAS = RAIZ / "assets" / "previas"
DIR_THUMBS = RAIZ / "assets" / "thumbs"

NICHOS = {
    "vsl": "vsl",
    "canal": "canal", "animacao": "canal", "animação": "canal", "cartoon": "canal",
    "motion": "motion", "motion graphics": "motion", "motion-graphics": "motion",
    "youtube": "youtube", "yt": "youtube",
    "gameplay": "gameplay", "game": "gameplay", "games": "gameplay",
}
LIMITE_BYTES = 3 * 1024 * 1024  # 3 MB
# versão no caminho (?v=) para o navegador não usar a prévia/thumb antiga do cache
VERSAO = datetime.now().strftime("%Y%m%d%H%M")
AMOSTRAS_POR_SEG = 4  # resolução da análise de movimento


def achar_bin(nome: str) -> str:
    """ffmpeg/ffprobe: variável de ambiente, PATH ou instalação do winget."""
    env = os.environ.get(nome.upper())
    if env and Path(env).exists():
        return env
    no_path = shutil.which(nome)
    if no_path:
        return no_path
    local = os.environ.get("LOCALAPPDATA")
    if local:
        achados = glob.glob(
            os.path.join(local, "Microsoft", "WinGet", "Packages", "*FFmpeg*", "**", "bin", f"{nome}.exe"),
            recursive=True,
        )
        if achados:
            return achados[0]
    sys.exit(f"Erro: '{nome}' não encontrado. Instale o ffmpeg (ex.: winget install Gyan.FFmpeg).")


FFMPEG = achar_bin("ffmpeg")
FFPROBE = achar_bin("ffprobe")
# sem metadados do original (título, ferramenta, datas...) nos arquivos publicados
SEM_METADADOS = ["-map_metadata", "-1", "-map_chapters", "-1", "-fflags", "+bitexact"]
# cor padrão de vídeo web: BT.709, faixa limitada ("tv"). Fontes "full range" (ex.: Remotion, yuvj420p)
# geram prévias que não atualizam a imagem na decodificação por hardware de alguns navegadores.
COR_WEB = ["-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709"]


def rodar(cmd: list[str]) -> subprocess.CompletedProcess:
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        sys.stderr.write(r.stderr[-3000:])
        sys.exit(f"Erro ao rodar {Path(cmd[0]).name} (código {r.returncode}).")
    return r


def sondar(video: Path) -> tuple[float, int, int]:
    r = rodar([
        FFPROBE, "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=width,height:format=duration",
        "-of", "json", str(video),
    ])
    info = json.loads(r.stdout)
    st = info["streams"][0]
    return float(info["format"]["duration"]), int(st["width"]), int(st["height"])


def slug(texto: str) -> str:
    t = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    t = re.sub(r"[^a-zA-Z0-9]+", "-", t).strip("-").lower()
    return t or "trabalho"


def trecho_mais_movimento(video: Path, duracao_total: float, janela: float) -> float:
    """Retorna o início (s) da janela com mais movimento."""
    print("Analisando movimento (pode levar um pouco em vídeos longos)...")
    filtro = (
        f"fps={AMOSTRAS_POR_SEG},scale=160:-2,"
        "select='gte(scene,0)',metadata=print:key=lavfi.scene_score:file=-"
    )
    r = rodar([FFMPEG, "-hide_banner", "-nostats", "-i", str(video), "-an", "-vf", filtro, "-f", "null", "-"])
    tempos, notas = [], []
    t_atual = None
    for linha in r.stdout.splitlines():
        m = re.search(r"pts_time:([\d.]+)", linha)
        if m:
            t_atual = float(m.group(1))
            continue
        m = re.search(r"lavfi\.scene_score=([\d.]+)", linha)
        if m and t_atual is not None:
            tempos.append(t_atual)
            # limita cortes secos para não dominarem: queremos movimento contínuo
            notas.append(min(float(m.group(1)), 0.25))
    if not tempos:
        return max(0.0, (duracao_total - janela) / 2)

    margem = min(3.0, duracao_total * 0.05)  # evita capa/abertura e créditos finais
    ini_min, ini_max = margem, max(margem, duracao_total - janela - margem)
    if ini_max <= ini_min:
        return max(0.0, (duracao_total - janela) / 2)

    melhor_ini, melhor_soma = ini_min, -1.0
    j = 0
    soma = 0.0
    n = len(tempos)
    for i in range(n):  # janela deslizante sobre as amostras
        ini = tempos[i]
        if ini < ini_min:
            continue
        if ini > ini_max:
            break
        if j < i:
            j, soma = i, 0.0
        while j < n and tempos[j] < ini + janela:
            soma += notas[j]
            j += 1
        if soma > melhor_soma:
            melhor_soma, melhor_ini = soma, ini
        soma -= notas[i]
    return round(melhor_ini, 2)


def filtro_escala(w: int, h: int) -> str:
    """Lado menor = 720 (sem ampliar), dimensões pares."""
    curto = min(w, h)
    alvo = min(720, curto - curto % 2)
    if w >= h:
        return f"scale=-2:{alvo}:flags=lanczos:out_color_matrix=bt709:out_range=tv"
    return f"scale={alvo}:-2:flags=lanczos:out_color_matrix=bt709:out_range=tv"


def gerar_mp4(video: Path, ini: float, dur: float, escala: str, saida: Path) -> None:
    for crf in (28, 30, 32, 34, 36):
        rodar([
            FFMPEG, "-hide_banner", "-y", "-ss", f"{ini}", "-t", f"{dur}", "-i", str(video),
            *SEM_METADADOS, "-an", "-vf", f"{escala},fps=30", "-c:v", "libx264", "-crf", str(crf),
            "-preset", "veryfast", "-profile:v", "high", "-pix_fmt", "yuv420p", *COR_WEB,
            "-movflags", "+faststart", str(saida),
        ])
        if saida.stat().st_size < LIMITE_BYTES:
            print(f"  mp4  CRF {crf}: {saida.stat().st_size / 1024:.0f} KB")
            return
        print(f"  mp4  CRF {crf}: {saida.stat().st_size / 1024:.0f} KB (acima de 3 MB, comprimindo mais)")
    print("  Aviso: mp4 ficou acima de 3 MB mesmo no CRF 36.")


def gerar_webm(video: Path, ini: float, dur: float, escala: str, saida: Path) -> None:
    for crf in (38, 42, 46, 50):
        rodar([
            FFMPEG, "-hide_banner", "-y", "-ss", f"{ini}", "-t", f"{dur}", "-i", str(video),
            *SEM_METADADOS, "-an", "-vf", f"{escala},fps=30", "-c:v", "libvpx-vp9", "-crf", str(crf),
            "-b:v", "0", "-deadline", "good", "-cpu-used", "4", "-row-mt", "1", "-pix_fmt", "yuv420p", *COR_WEB,
            str(saida),
        ])
        if saida.stat().st_size < LIMITE_BYTES:
            print(f"  webm CRF {crf}: {saida.stat().st_size / 1024:.0f} KB")
            return
        print(f"  webm CRF {crf}: {saida.stat().st_size / 1024:.0f} KB (acima de 3 MB, comprimindo mais)")
    print("  Aviso: webm ficou acima de 3 MB mesmo no CRF 50.")


def gerar_thumb(video: Path, ini: float, dur: float, w: int, h: int, saida: Path) -> None:
    """Testa 5 quadros do trecho e fica com o de mais detalhe (maior .webp),
    para não sair uma thumb preta ou de transição."""
    escala = "scale=960:-2:flags=lanczos" if w >= h else "scale=-2:960:flags=lanczos"
    melhor: Path | None = None
    melhor_tam = -1
    for k in range(5):
        t = ini + dur * (k + 0.5) / 5
        tmp = saida.with_name(f"{saida.stem}.tmp{k}.webp")
        rodar([
            FFMPEG, "-hide_banner", "-y", "-ss", f"{t:.2f}", "-i", str(video), "-frames:v", "1",
            *SEM_METADADOS, "-vf", escala, "-c:v", "libwebp", "-quality", "78", str(tmp),
        ])
        tam = tmp.stat().st_size
        if tam > melhor_tam:
            if melhor:
                melhor.unlink()
            melhor, melhor_tam = tmp, tam
        else:
            tmp.unlink()
    melhor.replace(saida)
    print(f"  thumb: {saida.stat().st_size / 1024:.0f} KB")


def limpar_link(link: str) -> str:
    """Normaliza links do YouTube/Vimeo e tira parâmetros de rastreamento (?si=, &feature=...)."""
    link = link.strip()
    try:
        u = urllib.parse.urlparse(link)
    except ValueError:
        return link
    host = u.netloc.lower().removeprefix("www.").removeprefix("m.")
    q = urllib.parse.parse_qs(u.query)
    if host == "youtu.be":
        return f"https://youtu.be/{u.path.strip('/').split('/')[0]}"
    if host.endswith("youtube.com"):
        m = re.match(r"/(shorts|embed|live)/([\w-]+)", u.path)
        if m and m.group(1) == "shorts":
            return f"https://youtube.com/shorts/{m.group(2)}"
        vid = (q.get("v") or [None])[0] or (m.group(2) if m else None)
        return f"https://youtu.be/{vid}" if vid else link
    if host.endswith("vimeo.com"):
        h = (q.get("h") or [None])[0]
        return f"https://vimeo.com{u.path}" + (f"?h={h}" if h else "")
    return link


def id_youtube(link: str) -> str | None:
    m = re.search(r"(?:youtu\.be/|/shorts/|[?&]v=|/embed/)([\w-]{11})", link)
    return m.group(1) if m else None


def oembed(link: str) -> dict | None:
    url = "https://www.youtube.com/oembed?format=json&url=" + urllib.parse.quote(link, safe="")
    try:
        with urllib.request.urlopen(url, timeout=15) as r:
            return json.loads(r.read().decode("utf-8"))
    except Exception as e:
        print(f"  Aviso: oEmbed não respondeu para {link} ({e}). Vídeo privado, apagado ou ID errado?")
        return None


def thumb_do_youtube(vid: str, vertical: bool, saida: Path) -> bool:
    """Baixa a melhor thumb disponível e recorta para 16:9 ou 9:16 (tira as faixas pretas)."""
    for nome in ("maxresdefault", "sddefault", "hqdefault"):
        try:
            with urllib.request.urlopen(f"https://i.ytimg.com/vi/{vid}/{nome}.jpg", timeout=15) as r:
                dados = r.read()
        except Exception:
            continue
        tmp = saida.with_suffix(".tmp.jpg")
        tmp.write_bytes(dados)
        a = "9/16" if vertical else "16/9"
        recorte = f"crop='min(iw,ih*{a})':'min(ih,iw/({a}))'"
        escala = "scale=-2:960:flags=lanczos" if vertical else "scale=960:-2:flags=lanczos"
        rodar([FFMPEG, "-hide_banner", "-y", "-i", str(tmp), *SEM_METADADOS,
               "-vf", f"{recorte},{escala}", "-c:v", "libwebp", "-quality", "80", str(saida)])
        tmp.unlink()
        print(f"  thumb do YouTube ({nome}): {saida.stat().st_size / 1024:.0f} KB")
        return True
    print("  Aviso: nenhuma thumb do YouTube disponível.")
    return False


def deduzir_nicho(titulo: str, autor: str) -> str | None:
    t = f"{titulo} {autor}".lower()
    if re.search(r"\bvsl\b", t):
        return "vsl"
    if "jorginho" in t:
        return "canal"
    if "gameplay" in t:
        return "gameplay"
    if "motion" in t:
        return "motion"
    return None


def main() -> None:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    ap = argparse.ArgumentParser(description="Adiciona ou atualiza um trabalho do portfólio.")
    ap.add_argument("video", type=Path, nargs="?", help="vídeo local para gerar a prévia (não é copiado)")
    ap.add_argument("--titulo")
    ap.add_argument("--nicho", help="vsl | canal | motion | youtube | gameplay")
    ap.add_argument("--link", help="YouTube (não listado) ou Vimeo")
    ap.add_argument("--descricao")
    ap.add_argument("--inicio", type=float, help="início do trecho em segundos (padrão: trecho de mais movimento)")
    ap.add_argument("--duracao", type=float, default=7.0, help="duração da prévia, 6 a 8 s (padrão 7)")
    ap.add_argument("--destaque", action="store_true", help="vira o card deste nicho na home")
    ap.add_argument("--inativo", action="store_true", help="grava já escondido (ativo: false)")
    ap.add_argument("--id", help="identificador/nome dos arquivos (padrão: gerado do título)")
    ap.add_argument("--substituir", action="store_true", help="atualiza uma entrada existente com o mesmo id")
    ap.add_argument("--manter-thumb", action="store_true", help="ao gerar a prévia, não troca a thumb atual")
    a = ap.parse_args()

    if not 6 <= a.duracao <= 8:
        sys.exit("Erro: --duracao deve ficar entre 6 e 8 segundos.")
    link = limpar_link(a.link) if a.link else None

    dados = json.loads(ARQ_TRABALHOS.read_text(encoding="utf-8")) if ARQ_TRABALHOS.exists() else {"trabalhos": []}
    lista = dados.setdefault("trabalhos", [])

    # informações do YouTube (título, formato) quando houver link
    info = oembed(link) if link and id_youtube(link) else None
    titulo = a.titulo or (info or {}).get("title")
    if not (a.id or titulo):
        sys.exit("Erro: informe --titulo ou --id (ou um --link do YouTube público para pegar o título).")
    ident = slug(a.id or titulo)
    existente = next((t for t in lista if t.get("id") == ident), None)
    if existente and not a.substituir:
        sys.exit(f"Erro: já existe um trabalho com id '{ident}'. Use --id outro-nome ou --substituir.")
    if a.substituir and not existente:
        sys.exit(f"Erro: --substituir, mas não existe trabalho com id '{ident}'.")
    base = dict(existente or {})
    titulo = a.titulo or base.get("titulo") or titulo
    if not titulo:
        sys.exit("Erro: informe --titulo.")

    nicho = NICHOS.get(a.nicho.strip().lower()) if a.nicho else None
    if a.nicho and not nicho:
        sys.exit("Erro: --nicho deve ser vsl, canal, motion, youtube ou gameplay.")
    nicho = nicho or base.get("nicho") or deduzir_nicho(titulo, (info or {}).get("author_name", ""))
    if not nicho:
        sys.exit("Erro: não deu para deduzir o nicho; informe --nicho.")

    link = link or base.get("link")
    if not link:
        sys.exit("Erro: informe --link.")

    vertical = base.get("vertical")
    if info:
        vertical = int(info.get("height", 0)) > int(info.get("width", 1)) or "/shorts/" in link
    thumb_rel = base.get("thumb")
    previa = base.get("previa")
    DIR_THUMBS.mkdir(parents=True, exist_ok=True)
    thumb = DIR_THUMBS / f"{ident}.webp"

    if a.video:
        video = a.video.resolve()
        if not video.is_file():
            sys.exit(f"Erro: vídeo não encontrado: {a.video}")
        duracao_total, w, h = sondar(video)
        if vertical is None:
            vertical = h > w
        dur = min(a.duracao, duracao_total)
        if a.inicio is not None:
            ini = max(0.0, min(a.inicio, duracao_total - dur))
        else:
            ini = trecho_mais_movimento(video, duracao_total, dur)
        print(f"Trecho: {ini:.2f}s a {ini + dur:.2f}s (vídeo com {duracao_total:.1f}s, {w}x{h})")
        DIR_PREVIAS.mkdir(parents=True, exist_ok=True)
        mp4 = DIR_PREVIAS / f"{ident}.mp4"
        webm = DIR_PREVIAS / f"{ident}.webm"
        escala = filtro_escala(w, h)
        gerar_mp4(video, ini, dur, escala, mp4)
        gerar_webm(video, ini, dur, escala, webm)
        if not (a.manter_thumb and thumb_rel):
            gerar_thumb(video, ini, dur, w, h, thumb)
            thumb_rel = f"assets/thumbs/{thumb.name}?v={VERSAO}"
        previa = {"mp4": f"assets/previas/{mp4.name}?v={VERSAO}", "webm": f"assets/previas/{webm.name}?v={VERSAO}"}
    elif not thumb_rel:
        vid = id_youtube(link)
        if not vid:
            sys.exit("Erro: sem vídeo local, o link precisa ser do YouTube (para baixar a thumb).")
        if thumb_do_youtube(vid, bool(vertical), thumb):
            thumb_rel = f"assets/thumbs/{thumb.name}?v={VERSAO}"

    destaque = a.destaque or bool(base.get("destaque_home"))
    if a.destaque:  # só um destaque por nicho
        for t in lista:
            if t.get("nicho") == nicho and t.get("id") != ident:
                t["destaque_home"] = False

    entrada = {
        "id": ident,
        "titulo": titulo,
        "nicho": nicho,
        "thumb": thumb_rel,
        "previa": previa,
        "link": link,
        "descricao": a.descricao if a.descricao is not None else base.get("descricao", ""),
        "ordem": base.get("ordem") or max((t.get("ordem", 0) for t in lista), default=0) + 1,
        "destaque_home": destaque,
        "ativo": False if a.inativo else base.get("ativo", True),
        "vertical": bool(vertical),
    }
    if existente:
        lista[lista.index(existente)] = entrada
    else:
        lista.append(entrada)
    ARQ_TRABALHOS.write_text(json.dumps(dados, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"OK: '{titulo}' em dados/trabalhos.json (id {ident}, nicho {nicho}, "
          f"{'vertical' if vertical else 'horizontal'}, {'com' if previa else 'sem'} prévia"
          f"{', destaque na home' if destaque else ''}).")


if __name__ == "__main__":
    main()
