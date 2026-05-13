#!/usr/bin/env python3
"""Render STARTS listing cards + analysis executive PDFs from a properties.json file.

Usage:
    python3 render.py --mode listing|analysis|both \
                      --input ../data/properties.sample.json \
                      --output ../output/

Generates:
    output/cards/<id>_<slug>.pdf        per-property STARTS card
    output/<slug>_analysis.pdf          combined exec analysis
    output/<slug>_all.pdf               analysis + all cards (if pypdf available)
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

from jinja2 import ChainableUndefined, Environment, FileSystemLoader, select_autoescape
from weasyprint import HTML, CSS  # type: ignore

THIS = Path(__file__).resolve().parent
TEMPLATES = THIS / "templates"
ASSETS = THIS.parent / "assets"


def slugify(s: str) -> str:
    s = re.sub(r"\s+", "-", (s or "").strip().lower())
    s = re.sub(r"[^a-z0-9가-힣\-_]", "", s)
    return s or "untitled"


def make_image_resolver(input_path: Path):
    """Resolve image references in property data to file:// URLs that WeasyPrint can read.

    Order of attempts: absolute path -> relative to input file -> relative to assets dir
    -> fallback placeholder.png.
    """
    input_dir = input_path.resolve().parent
    fallback = ASSETS / "placeholder.png"

    def resolve(ref: str | None) -> str:
        if not ref:
            return fallback.as_uri()
        if ref.startswith(("http://", "https://", "data:", "file://")):
            return ref
        for cand in [Path(ref), input_dir / ref, ASSETS / ref]:
            p = cand.expanduser().resolve()
            if p.exists():
                return p.as_uri()
        return fallback.as_uri()

    return resolve


def build_env(resolver) -> Environment:
    # ChainableUndefined lets missing dict keys/attrs evaluate to empty
    # in chained expressions (e.g. r.cover_headline or 'fallback'),
    # which matches how the sample data omits optional fields.
    env = Environment(
        loader=FileSystemLoader(str(TEMPLATES)),
        autoescape=select_autoescape(["html"]),
        undefined=ChainableUndefined,
        trim_blocks=False,
        lstrip_blocks=False,
    )
    env.globals["resolve_image"] = resolver
    env.globals["stylesheet_url"] = (TEMPLATES / "styles.css").resolve().as_uri()
    return env


def render_listing(env: Environment, data: dict, p: dict, out_dir: Path) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    tpl = env.get_template("listing_card.html.j2")
    html_str = tpl.render(p=p, r=data.get("report", {}))
    pid = p.get("id") or "X"
    name = slugify(p.get("building_name") or pid)
    pdf_path = out_dir / f"{pid}_{name}.pdf"
    HTML(string=html_str, base_url=str(TEMPLATES)).write_pdf(target=str(pdf_path))
    return pdf_path


def render_analysis(env: Environment, data: dict, out_dir: Path) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    tpl = env.get_template("analysis_executive.html.j2")
    props = data.get("properties", [])
    props_by_id = {p["id"]: p for p in props if "id" in p}
    analysis = data.get("analysis", {})
    ranking_score = {row["id"]: row.get("score") for row in (analysis.get("ranking") or []) if "id" in row}
    html_str = tpl.render(
        r=data.get("report", {}),
        a=analysis,
        properties=props,
        props_by_id=props_by_id,
        ranking_score=ranking_score,
    )
    title = slugify(data.get("report", {}).get("title", "analysis"))
    pdf_path = out_dir / f"{title}_analysis.pdf"
    HTML(string=html_str, base_url=str(TEMPLATES)).write_pdf(target=str(pdf_path))
    return pdf_path


def merge_pdfs(paths: list[Path], target: Path) -> Path | None:
    try:
        from pypdf import PdfReader, PdfWriter
    except ImportError:
        return None
    w = PdfWriter()
    for p in paths:
        for page in PdfReader(str(p)).pages:
            w.add_page(page)
    target.parent.mkdir(parents=True, exist_ok=True)
    with open(target, "wb") as fh:
        w.write(fh)
    return target


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", choices=["listing", "analysis", "both"], default="both")
    ap.add_argument("--input", required=True, type=Path)
    ap.add_argument("--output", required=True, type=Path)
    args = ap.parse_args(argv)

    data = json.loads(args.input.read_text(encoding="utf-8"))
    args.output.mkdir(parents=True, exist_ok=True)

    resolver = make_image_resolver(args.input)
    env = build_env(resolver)

    card_paths: list[Path] = []
    analysis_path: Path | None = None

    if args.mode in ("listing", "both"):
        cards_dir = args.output / "cards"
        for p in data.get("properties", []):
            out = render_listing(env, data, p, cards_dir)
            card_paths.append(out)
            print(f"[listing] {out}")

    if args.mode in ("analysis", "both"):
        analysis_path = render_analysis(env, data, args.output)
        print(f"[analysis] {analysis_path}")

    if args.mode == "both" and analysis_path and card_paths:
        title = slugify(data.get("report", {}).get("title", "report"))
        combined = args.output / f"{title}_all.pdf"
        merged = merge_pdfs([analysis_path] + card_paths, combined)
        if merged:
            print(f"[combined] {merged}")
        else:
            print("[combined] skipped (pypdf not installed)")

    return 0


if __name__ == "__main__":
    sys.exit(main())
