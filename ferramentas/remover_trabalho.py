#!/usr/bin/env python3
"""Tira (ou volta) trabalhos do portfólio.

Uso:
  python ferramentas/remover_trabalho.py --listar
  python ferramentas/remover_trabalho.py ID                 # desativa (some do site, continua no JSON)
  python ferramentas/remover_trabalho.py ID --ativar        # volta a aparecer
  python ferramentas/remover_trabalho.py ID --destacar      # vira o card do nicho na home
  python ferramentas/remover_trabalho.py ID --apagar        # remove do JSON e apaga prévia/thumb

Obs.: --apagar tira os arquivos da pasta, mas eles continuam no HISTÓRICO do git
(o repositório é público). Para sumir do histórico é preciso reescrevê-lo.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
ARQ = RAIZ / "dados" / "trabalhos.json"


def main() -> None:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    ap = argparse.ArgumentParser(description="Desativa, reativa, destaca ou apaga um trabalho.")
    ap.add_argument("id", nargs="?", help="id do trabalho (veja --listar)")
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--listar", action="store_true", help="lista os trabalhos")
    g.add_argument("--ativar", action="store_true", help="volta a mostrar no site")
    g.add_argument("--destacar", action="store_true", help="vira o card do nicho na home")
    g.add_argument("--apagar", action="store_true", help="remove do JSON e apaga prévia e thumb")
    a = ap.parse_args()

    dados = json.loads(ARQ.read_text(encoding="utf-8"))
    lista = dados.get("trabalhos", [])

    if a.listar or not a.id:
        for t in sorted(lista, key=lambda t: (t.get("nicho", ""), t.get("ordem", 0))):
            marcas = ("ATIVO  " if t.get("ativo", True) else "inativo") + (" ★ home" if t.get("destaque_home") else "")
            print(f"{t.get('nicho', '?'):9s} {marcas:15s} {t['id']:24s} {t.get('titulo', '')}")
        if not a.id and not a.listar:
            print("\nInforme o id do trabalho (ex.: remover_trabalho.py linhameta).")
        return

    t = next((x for x in lista if x.get("id") == a.id), None)
    if not t:
        sys.exit(f"Erro: id '{a.id}' não encontrado. Use --listar.")

    if a.apagar:
        caminhos = [t.get("thumb"), *(t.get("previa") or {}).values()]
        for c in filter(None, caminhos):
            p = (RAIZ / c.split("?")[0]).resolve()  # ignora o ?v= de versão
            if RAIZ in p.parents and p.exists():
                p.unlink()
                print(f"  apagado: {c}")
        lista.remove(t)
        msg = "removido do JSON"
    elif a.ativar:
        t["ativo"] = True
        msg = "ativado"
    elif a.destacar:
        for x in lista:
            if x.get("nicho") == t.get("nicho"):
                x["destaque_home"] = x is t
        t["ativo"] = True
        msg = f"agora é o destaque de '{t.get('nicho')}' na home"
    else:
        t["ativo"] = False
        msg = "desativado (não aparece no site; use --ativar para voltar)"

    ARQ.write_text(json.dumps(dados, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"OK: '{a.id}' {msg}.")


if __name__ == "__main__":
    main()
