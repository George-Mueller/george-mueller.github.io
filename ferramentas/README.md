# Ferramentas do site

Scripts em Python 3 (sem dependências além do **ffmpeg/ffprobe**, achados no PATH, nas variáveis
`FFMPEG`/`FFPROBE` ou na instalação do winget). Rodar da raiz do repositório.

| Script | Para quê |
|---|---|
| `adicionar_trabalho.py` | Adiciona/atualiza um trabalho em `dados/trabalhos.json` (prévia + thumb) |
| `remover_trabalho.py` | Lista, desativa, ativa, destaca ou apaga trabalhos |
| `atualizar_apresentacao.py` | Troca o vídeo de apresentação do hero (`assets/apresentacao/`) |
| `versionar_assets.py` | Põe `?v=<hash>` nos CSS/JS e nas mídias do hero dos HTML |
| `og.html` | Molde da imagem Open Graph (1200×630), capturado com o Chrome headless |

## Trabalhos

```
python ferramentas/adicionar_trabalho.py VIDEO --titulo "Título" --nicho vsl|canal|motion|youtube|gameplay \
    --link "https://youtu.be/..." [--descricao "..."] [--inicio 12.5] [--duracao 7] [--destaque]
python ferramentas/adicionar_trabalho.py --link "https://youtu.be/..."        # sem vídeo local: sem prévia
python ferramentas/adicionar_trabalho.py VIDEO --id ID --substituir [--manter-thumb]
python ferramentas/remover_trabalho.py --listar
python ferramentas/remover_trabalho.py ID [--ativar | --destacar | --apagar]
```

Prévias: 6–8 s, mp4 (H.264) + webm (VP9), sem áudio, BT.709 faixa limitada, sem metadados, < 3 MB.

## Vídeo de apresentação do hero

```
python ferramentas/atualizar_apresentacao.py MASTER_16x9.mp4 MASTER_9x16.mp4 \
    [--poster-16x9 POSTER_16x9.webp] [--poster-9x16 POSTER_9x16.webp] [--sem-versionar]
```

Recebe os dois masters (com áudio) e gera em `assets/apresentacao/`, sempre com os mesmos nomes
(o `js/apresentacao.js` não muda):

| Arquivo | Conteúdo |
|---|---|
| `apresentacao_16x9.webm` / `_9x16.webm` | VP9, CRF 34 (`-b:v 0`, `-deadline good -cpu-used 4 -row-mt 1`), sem áudio — principal |
| `apresentacao_16x9.mp4` / `_9x16.mp4` | H.264 High, CRF 24, preset `slow`, sem áudio, `faststart` — para quem não toca webm |
| `apresentacao_16x9_som.mp4` / `_9x16_som.mp4` | o mesmo H.264 + AAC 128k 48 kHz estéreo — só carrega ao clicar no alto-falante |
| `apresentacao_16x9.webp` / `_9x16.webp` | pôster |

- Tamanhos: 16:9 = 1280×720, 9:16 = 720×1280; 30 fps; keyframe a cada 2 s (GOP 60).
- Cor: BT.709, faixa limitada (`tv`). Sem metadados: sem tags do original, sem capítulos, sem a SEI do x264.
- Pôster: sem `--poster-*`, sai do quadro 0 do master. Um `.webp` já no tamanho certo e sem EXIF/XMP/ICC é
  copiado como está; outro formato/tamanho é convertido para `.webp` no tamanho do vídeo.
- Os arquivos do site só são substituídos depois que os 8 foram gerados sem erro. Avisa se algum passar de 6 MB.
- No fim roda o `versionar_assets.py` (use `--sem-versionar` para pular).
- **Os masters nunca entram no repositório** (ele é público): só os arquivos gerados.

Depois: testar local (`python -m http.server 8000`): pôster antes do play, vídeo mudo em loop, botão de som,
desktop (≥ 900 px, 16:9) e celular (9:16). O servidor local não manda `Accept-Ranges`, então a versão com som
recomeça do 0 no teste local; no GitHub Pages ela continua do mesmo ponto.

## Versões dos arquivos (cache)

```
python ferramentas/versionar_assets.py            # atualiza os HTML
python ferramentas/versionar_assets.py --checar   # só confere (código 1 se algo estiver desatualizado)
```

Roda sozinho no hook `.githooks/pre-commit` (ativar uma vez por clone: `git config core.hooksPath .githooks`).
