"""Põe ?v=<hash> nos <script src> e <link rel="stylesheet"> locais do index.html e da trabalhos.html.

O hash (8 primeiros caracteres do SHA-1 do conteúdo) só muda quando o arquivo muda, então o navegador
pega a versão nova logo após o deploy e mantém o cache enquanto nada mudar.

    python ferramentas/versionar_assets.py            # atualiza os HTML e lista o que mudou
    python ferramentas/versionar_assets.py --checar   # só confere; sai com código 1 se algum estiver desatualizado

O hook .githooks/pre-commit roda isso a cada commit (ativar uma vez por clone:
git config core.hooksPath .githooks).
"""
import hashlib
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
PAGINAS = ["index.html", "trabalhos.html"]

TAG = re.compile(r"<(script|link)\b[^>]*>", re.I)
ATRIB = {"script": re.compile(r'(\bsrc=")([^"?#]+)(?:\?v=[^"#]*)?(")', re.I),
         "link": re.compile(r'(\bhref=")([^"?#]+)(?:\?v=[^"#]*)?(")', re.I)}
ESTILO = re.compile(r'\brel="stylesheet"', re.I)


def hash_de(caminho):
    # CRLF→LF: o mesmo arquivo dá o mesmo hash no PC e no notebook, seja qual for o autocrlf
    return hashlib.sha1(caminho.read_bytes().replace(b"\r\n", b"\n")).hexdigest()[:8]


def versionar(html, mudancas, faltando):
    def tag(m):
        t, tipo = m.group(0), m.group(1).lower()
        if tipo == "link" and not ESTILO.search(t):
            return t

        def atrib(a):
            url = a.group(2)
            if re.match(r"^([a-z]+:)?//", url, re.I) or url.startswith("data:"):
                return a.group(0)  # externo: não mexe
            arq = RAIZ / url.lstrip("/")
            if not arq.is_file():
                faltando.append(url)
                return a.group(0)
            novo = f"{a.group(1)}{url}?v={hash_de(arq)}{a.group(3)}"
            if novo != a.group(0):
                mudancas.append(url)
            return novo

        return ATRIB[tipo].sub(atrib, t, count=1)

    return TAG.sub(tag, html)


def main():
    checar = "--checar" in sys.argv
    desatualizadas, faltando = [], []
    for nome in PAGINAS:
        p = RAIZ / nome
        texto = p.read_text(encoding="utf-8")
        mudancas = []
        novo = versionar(texto, mudancas, faltando)
        if novo != texto:
            desatualizadas.append(nome)
            print(f"{nome}: {', '.join(mudancas)}")
            if not checar:
                p.write_bytes(novo.encode("utf-8"))  # write_bytes: mantém as quebras de linha do arquivo
    for url in sorted(set(faltando)):
        print(f"aviso: arquivo não encontrado: {url}", file=sys.stderr)
    if checar and desatualizadas:
        print("versões desatualizadas; rode python ferramentas/versionar_assets.py", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
