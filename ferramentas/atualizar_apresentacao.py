#!/usr/bin/env python3
"""Atualiza o vídeo de apresentação do hero (assets/apresentacao/) a partir dos masters 16:9 e 9:16.

Gera, para cada formato (16x9 = 1280x720, 9x16 = 720x1280):
  apresentacao_<f>.webm      VP9  CRF 34 (-b:v 0, deadline good, cpu-used 4, row-mt), sem áudio  -> principal
  apresentacao_<f>.mp4       H.264 High CRF 24 preset slow, sem áudio, faststart                  -> fallback
  apresentacao_<f>_som.mp4   mesmo vídeo do .mp4 + AAC 128k 48 kHz estéreo                          -> botão de som
  apresentacao_<f>.webp      pôster (quadro 0 do vídeo ou o arquivo passado), no tamanho do vídeo
Tudo a 30 fps, keyframe a cada 2 s (GOP 60), BT.709 faixa limitada ("tv"), sem metadados
(sem tags do original, sem capítulos e sem a assinatura SEI do x264). No fim roda o versionar_assets.py
(?v=<hash> no index.html). O apresentacao.js não muda: os nomes dos arquivos são sempre os mesmos.

    python ferramentas/atualizar_apresentacao.py MASTER_16x9.mp4 MASTER_9x16.mp4 \
        [--poster-16x9 POSTER_16x9.webp] [--poster-9x16 POSTER_9x16.webp] [--sem-versionar]

Sem --poster-*, o pôster sai do quadro 0 do master. Pôster .webp já no tamanho certo e sem blocos de
metadados (EXIF/XMP/ICC) é copiado como está; qualquer outro (png, jpg, webp com metadados ou de outro
tamanho) é convertido para .webp no tamanho do vídeo.
Os masters (vídeos completos em alta) NUNCA vão para o repositório: só os arquivos gerados aqui.
"""
from __future__ import annotations

import argparse
import glob
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DESTINO = RAIZ / "assets" / "apresentacao"
FORMATOS = {"16x9": (1280, 720), "9x16": (720, 1280)}
LIMITE_BYTES = 6 * 1024 * 1024  # 6 MB por arquivo

FPS, GOP = 30, 60  # keyframe a cada 2 s
SEM_METADADOS = ["-map_metadata", "-1", "-map_chapters", "-1", "-fflags", "+bitexact"]
COR_WEB = ["-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709"]
H264 = ["-c:v", "libx264", "-crf", "24", "-preset", "slow", "-profile:v", "high", "-pix_fmt", "yuv420p",
        *COR_WEB, "-g", str(GOP), "-bsf:v", "filter_units=remove_types=6"]  # remove_types=6: tira a SEI do x264
VP9 = ["-c:v", "libvpx-vp9", "-crf", "34", "-b:v", "0", "-deadline", "good", "-cpu-used", "4", "-row-mt", "1",
       "-g", str(GOP), "-pix_fmt", "yuv420p", *COR_WEB]
AAC = ["-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2"]


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
        achados = glob.glob(os.path.join(local, "Microsoft", "WinGet", "Packages", "*FFmpeg*", "**", "bin", f"{nome}.exe"),
                            recursive=True)
        if achados:
            return achados[0]
    sys.exit(f"Erro: '{nome}' não encontrado. Instale o ffmpeg (ex.: winget install Gyan.FFmpeg).")


FFMPEG = achar_bin("ffmpeg")
FFPROBE = achar_bin("ffprobe")


def rodar(cmd: list[str]) -> str:
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        sys.stderr.write(r.stderr[-3000:])
        sys.exit(f"Erro ao rodar {Path(cmd[0]).name} (código {r.returncode}).")
    return r.stdout


def tem_audio(video: Path) -> bool:
    return "audio" in rodar([FFPROBE, "-v", "error", "-show_entries", "stream=codec_type", "-of", "csv=p=0", str(video)])


def dimensoes(arquivo: Path) -> tuple[int, int]:
    s = rodar([FFPROBE, "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
               "-of", "csv=p=0", str(arquivo)]).strip().split(",")
    return int(s[0]), int(s[1])


def webp_limpo(arquivo: Path) -> bool:
    """WebP sem blocos de metadados (EXIF, XMP, ICC)."""
    d = arquivo.read_bytes()
    return d[:4] == b"RIFF" and d[8:12] == b"WEBP" and not any(c in d for c in (b"EXIF", b"XMP ", b"ICCP"))


def gerar(fmt: str, master: Path, poster: Path | None, tmp: Path) -> list[Path]:
    w, h = FORMATOS[fmt]
    vf = ["-vf", f"scale={w}:{h}:flags=lanczos,fps={FPS}"]
    base = f"apresentacao_{fmt}"
    saidas = []

    print(f"[{fmt}] webm (VP9 CRF 34)…")
    rodar([FFMPEG, "-v", "error", "-y", "-i", str(master), *SEM_METADADOS, "-an", *vf, *VP9, str(tmp / f"{base}.webm")])
    print(f"[{fmt}] mp4 (H.264 CRF 24 slow)…")
    rodar([FFMPEG, "-v", "error", "-y", "-i", str(master), *SEM_METADADOS, "-an", *vf, *H264,
           "-movflags", "+faststart", str(tmp / f"{base}.mp4")])
    print(f"[{fmt}] mp4 com som (AAC 128k)…")
    rodar([FFMPEG, "-v", "error", "-y", "-i", str(master), *SEM_METADADOS, *vf, *H264, *AAC,
           "-movflags", "+faststart", str(tmp / f"{base}_som.mp4")])
    saidas += [tmp / f"{base}.webm", tmp / f"{base}.mp4", tmp / f"{base}_som.mp4"]

    destino_poster = tmp / f"{base}.webp"
    if poster and poster.suffix.lower() == ".webp" and webp_limpo(poster) and dimensoes(poster) == (w, h):
        shutil.copyfile(poster, destino_poster)
        print(f"[{fmt}] pôster: copiado ({poster.name}, já {w}x{h} e sem metadados)")
    else:
        origem = poster or master
        rodar([FFMPEG, "-v", "error", "-y", "-i", str(origem), "-frames:v", "1", *SEM_METADADOS,
               "-vf", f"scale={w}:{h}:flags=lanczos", "-c:v", "libwebp", "-quality", "82", str(destino_poster)])
        print(f"[{fmt}] pôster: {'convertido de ' + origem.name if poster else 'quadro 0 do master'}")
    saidas.append(destino_poster)
    return saidas


def main() -> None:
    ap = argparse.ArgumentParser(description="Gera os vídeos e pôsteres do hero em assets/apresentacao/.")
    ap.add_argument("master_16x9", type=Path, help="master 16:9 (com áudio)")
    ap.add_argument("master_9x16", type=Path, help="master 9:16 (com áudio)")
    ap.add_argument("--poster-16x9", type=Path, help="pôster 16:9 (padrão: quadro 0 do master)")
    ap.add_argument("--poster-9x16", type=Path, help="pôster 9:16 (padrão: quadro 0 do master)")
    ap.add_argument("--sem-versionar", action="store_true", help="não roda o versionar_assets.py no fim")
    a = ap.parse_args()

    entradas = {"16x9": (a.master_16x9, a.poster_16x9), "9x16": (a.master_9x16, a.poster_9x16)}
    for fmt, (m, p) in entradas.items():
        for arq in (m, p):
            if arq and not arq.is_file():
                sys.exit(f"Erro: arquivo não encontrado: {arq}")
        if not tem_audio(m):
            sys.exit(f"Erro: o master {fmt} não tem áudio (a versão _som precisa dele).")

    DESTINO.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="apresentacao_") as t:
        tmp = Path(t)
        prontos = []
        for fmt, (m, p) in entradas.items():
            prontos += gerar(fmt, m, p, tmp)
        # só substitui os arquivos do site depois que tudo foi gerado sem erro
        for arq in prontos:
            shutil.move(str(arq), DESTINO / arq.name)

    grandes = []
    for arq in sorted(DESTINO.glob("apresentacao_*")):
        tam = arq.stat().st_size
        print(f"  {arq.name}: {tam / 1024 / 1024:.2f} MB")
        if tam > LIMITE_BYTES:
            grandes.append(arq.name)
    if grandes:
        print(f"Aviso: acima de 6 MB: {', '.join(grandes)}")

    if not a.sem_versionar:
        subprocess.run([sys.executable, str(RAIZ / "ferramentas" / "versionar_assets.py")], check=True)


if __name__ == "__main__":
    main()
