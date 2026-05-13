#!/usr/bin/env python3
"""CLI: read JSON properties, run underwrite(), rank by DSCR, write results.

Input JSON schema (list of objects):
  {
    "property": { ...PropertyEconomics fields... },
    "loan":     { ...LoanTerms fields... },         # optional, falls back to defaults
    "ctx":      { ...InvestorContext fields... }    # optional, falls back to defaults
  }
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import fields
from pathlib import Path
from typing import Any

from financial_model import (
    InvestorContext,
    LoanTerms,
    PropertyEconomics,
    underwrite,
)


def _filter_kwargs(cls, data: dict) -> dict:
    allowed = {f.name for f in fields(cls)}
    return {k: v for k, v in data.items() if k in allowed}


def _build(entry: dict, default_loan: LoanTerms, default_ctx: InvestorContext):
    prop = PropertyEconomics(**_filter_kwargs(PropertyEconomics, entry["property"]))
    loan_data = entry.get("loan", {})
    ctx_data = entry.get("ctx", {})
    loan = LoanTerms(**{**_filter_kwargs(LoanTerms, default_loan.__dict__), **_filter_kwargs(LoanTerms, loan_data)})
    ctx = InvestorContext(**{**_filter_kwargs(InvestorContext, default_ctx.__dict__), **_filter_kwargs(InvestorContext, ctx_data)})
    return prop, loan, ctx


def _fmt_jpy(n: int) -> str:
    return f"¥{n:,}"


def _fmt_krw(n: int) -> str:
    return f"₩{n:,}"


def print_summary_kr(results: list[dict]) -> None:
    print()
    print("=" * 110)
    print("도쿄 1LDK+ 언더라이팅 결과 (DSCR 내림차순 정렬)")
    print("=" * 110)
    header = (
        f"{'#':>2} {'평면':<6} {'면적㎡':>6} {'가격(万円)':>11} "
        f"{'월세(¥)':>10} {'DSCR':>6} {'CapR':>6} {'CoC':>7} "
        f"{'필요자본(₩)':>16} {'여유(₩)':>14} {'판정':>4}"
    )
    print(header)
    print("-" * 110)
    for i, r in enumerate(results, 1):
        verdict = "PASS" if r["pass_all"] else "FAIL"
        print(
            f"{i:>2} {r['layout']:<6} {r['area_m2']:>6.1f} {r['price_jpy_man']:>11,.0f} "
            f"{r['monthly_rent_jpy']:>10,} {r['dscr']:>6.2f} "
            f"{r['cap_rate']*100:>5.2f}% {r['cash_on_cash']*100:>6.2f}% "
            f"{r['equity_required_krw']:>16,} {r['headroom_krw']:>14,} {verdict:>4}"
        )
    print("=" * 110)
    n_pass = sum(1 for r in results if r["pass_all"])
    print(f"총 {len(results)}건 검토 / 통과 {n_pass}건 / 탈락 {len(results) - n_pass}건")
    print()


def run(input_path: Path, output_path: Path, dscr_min: float) -> list[dict]:
    entries = json.loads(input_path.read_text(encoding="utf-8"))
    if not isinstance(entries, list):
        raise SystemExit("Input JSON must be a list of {property,loan,ctx} entries.")

    default_loan = LoanTerms(ltv=0.70)
    default_ctx = InvestorContext()

    results: list[dict] = []
    for entry in entries:
        prop, loan, ctx = _build(entry, default_loan, default_ctx)
        r = underwrite(prop, loan, ctx)
        r["source_id"] = entry.get("id")
        results.append(r)

    results.sort(key=lambda r: r["dscr"], reverse=True)

    # Filter: keep only ones passing minimum DSCR in the written file but
    # report the full ranking to stdout.
    output_path.parent.mkdir(parents=True, exist_ok=True)
    passing = [r for r in results if r["dscr"] >= dscr_min and r["headroom_krw"] >= 0]
    output_path.write_text(
        json.dumps({"all": results, "passing": passing}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print_summary_kr(results)
    return results


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Tokyo condo underwriter")
    p.add_argument("--input", required=True, type=Path, help="JSON list of properties")
    p.add_argument(
        "--output",
        type=Path,
        default=Path("/home/user/osaka-research/data/underwriting_results.json"),
    )
    p.add_argument("--dscr-min", type=float, default=1.0)
    args = p.parse_args(argv)
    run(args.input, args.output, args.dscr_min)
    return 0


if __name__ == "__main__":
    sys.exit(main())
