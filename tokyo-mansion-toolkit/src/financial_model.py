"""Tokyo 1LDK+ condo underwriting model.

All monetary amounts are integer JPY internally; KRW conversion happens only
at the report boundary in underwrite()/CLI. Inputs use ¥万円 (man-yen) where
the Japanese market quotes that way (price_jpy_man) and raw JPY elsewhere.
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Optional


# ---------- Inputs ----------

@dataclass
class PropertyEconomics:
    price_jpy_man: float                  # asking price in 万円 (1 man = 10,000 JPY)
    area_m2: float
    layout: str                           # "1LDK", "2LDK", etc.
    monthly_rent_jpy: int                 # expected gross market rent
    mgmt_fee_jpy: int = 0                 # 管理費 paid BY OWNER monthly
    repair_reserve_jpy: int = 0           # 修繕積立金 paid BY OWNER monthly
    parking_jpy: int = 0                  # parking fee; pass-through to tenant when rented
    property_tax_annual_jpy: Optional[int] = None   # 固定資産税+都市計画税
    insurance_annual_jpy: int = 30_000    # 火災保険 conservative annual estimate
    vacancy_rate: float = 0.05            # core-Tokyo conservative vacancy
    opex_other_ratio: float = 0.05        # leasing/PM/misc; % of EGI (not GPR)

    @property
    def price_jpy(self) -> int:
        return int(round(self.price_jpy_man * 10_000))

    def effective_property_tax(self) -> int:
        # When not provided, fall back to ~0.17% of price (1.4% 固都税 on a
        # land+building taxable basis that's typically ~10-15% of price for
        # condos). Conservative-ish for core Tokyo; overridable by caller.
        if self.property_tax_annual_jpy is not None:
            return int(self.property_tax_annual_jpy)
        return int(round(self.price_jpy * 0.0017))


@dataclass
class LoanTerms:
    ltv: float                            # 0.60 - 0.75 for the target band
    rate_apr: float = 0.025               # 2.5% nominal annual
    term_years: int = 30
    amortization: bool = True             # False -> interest-only


@dataclass
class InvestorContext:
    equity_krw: int = 450_000_000         # KRW headroom
    fx_jpy_to_krw: float = 9.5            # 1 JPY = 9.5 KRW (override at runtime)
    acquisition_cost_ratio: float = 0.08  # 登録免許税+不動産取得税+仲介手数料+印紙税+司法書士

    def krw_to_jpy(self, krw: float) -> int:
        return int(round(krw / self.fx_jpy_to_krw))

    def jpy_to_krw(self, jpy: float) -> int:
        return int(round(jpy * self.fx_jpy_to_krw))


# ---------- Core math ----------

def monthly_debt_service(
    loan_amount: float,
    rate_apr: float,
    term_years: int,
    amortization: bool = True,
) -> float:
    """Standard annuity (元利均等) payment. Interest-only when amortization=False."""
    if loan_amount <= 0:
        return 0.0
    r = rate_apr / 12.0
    n = term_years * 12
    if not amortization:
        return loan_amount * r
    if r == 0:
        return loan_amount / n
    # P = L * r(1+r)^n / ((1+r)^n - 1)
    factor = (1 + r) ** n
    return loan_amount * r * factor / (factor - 1)


def gross_potential_rent(prop: PropertyEconomics) -> int:
    """Annual GPR. Parking only collects when unit is rented, so we lump it
    into rent and apply vacancy uniformly below."""
    return int(round((prop.monthly_rent_jpy + prop.parking_jpy) * 12))


def noi_annual(prop: PropertyEconomics) -> int:
    """Annual NOI in JPY.

    Owner-borne expenses: mgmt_fee, repair_reserve, property_tax, insurance,
    plus opex_other_ratio applied to EGI (not GPR) because leasing/PM scales
    with collected rent, not theoretical rent.
    Parking is treated as pass-through revenue (already in GPR, lost to vacancy).
    """
    gpr = gross_potential_rent(prop)
    egi = gpr * (1 - prop.vacancy_rate)
    owner_monthly = prop.mgmt_fee_jpy + prop.repair_reserve_jpy
    owner_annual_fixed = owner_monthly * 12 + prop.effective_property_tax() + prop.insurance_annual_jpy
    opex_other = egi * prop.opex_other_ratio
    return int(round(egi - owner_annual_fixed - opex_other))


def dscr(prop: PropertyEconomics, loan: LoanTerms) -> float:
    """NOI / annual debt service. Loan sized at LTV * price."""
    loan_amount = loan.ltv * prop.price_jpy
    ads = monthly_debt_service(loan_amount, loan.rate_apr, loan.term_years, loan.amortization) * 12
    if ads <= 0:
        return float("inf")
    return noi_annual(prop) / ads


def cap_rate(prop: PropertyEconomics) -> float:
    if prop.price_jpy <= 0:
        return 0.0
    return noi_annual(prop) / prop.price_jpy


def equity_required(price_jpy: float, loan: LoanTerms, ctx: InvestorContext) -> int:
    """Downpayment + acquisition costs (closing). Acquisition cost is on price."""
    downpayment = price_jpy * (1 - loan.ltv)
    closing = price_jpy * ctx.acquisition_cost_ratio
    return int(round(downpayment + closing))


def cash_on_cash(prop: PropertyEconomics, loan: LoanTerms, ctx: InvestorContext) -> float:
    loan_amount = loan.ltv * prop.price_jpy
    ads = monthly_debt_service(loan_amount, loan.rate_apr, loan.term_years, loan.amortization) * 12
    cf = noi_annual(prop) - ads
    eq = equity_required(prop.price_jpy, loan, ctx)
    if eq <= 0:
        return 0.0
    return cf / eq


def max_price_for_dscr(
    target_dscr: float,
    prop: PropertyEconomics,
    loan: LoanTerms,
) -> int:
    """Largest price (JPY) keeping DSCR >= target, holding rent/opex fixed.

    Solved by bisection because property_tax depends linearly on price (via
    the 0.0017 default), making NOI also linear in price; closed-form is
    possible but bisection is robust to user-supplied non-linear opex rules.
    """
    lo, hi = 1_000_000, 1_000_000_000_000   # 100 man - 1 trillion yen
    # If even the floor fails, return 0.
    def dscr_at(price_jpy: int) -> float:
        test = PropertyEconomics(
            price_jpy_man=price_jpy / 10_000,
            area_m2=prop.area_m2,
            layout=prop.layout,
            monthly_rent_jpy=prop.monthly_rent_jpy,
            mgmt_fee_jpy=prop.mgmt_fee_jpy,
            repair_reserve_jpy=prop.repair_reserve_jpy,
            parking_jpy=prop.parking_jpy,
            property_tax_annual_jpy=prop.property_tax_annual_jpy,
            insurance_annual_jpy=prop.insurance_annual_jpy,
            vacancy_rate=prop.vacancy_rate,
            opex_other_ratio=prop.opex_other_ratio,
        )
        return dscr(test, loan)

    if dscr_at(lo) < target_dscr:
        return 0
    if dscr_at(hi) >= target_dscr:
        return hi
    for _ in range(60):
        mid = (lo + hi) // 2
        if dscr_at(mid) >= target_dscr:
            lo = mid
        else:
            hi = mid
    return int(lo)


def affordable_price_range(ctx: InvestorContext, loan: LoanTerms) -> tuple[int, int]:
    """Price range affordable given equity_krw at the given LTV.

    equity_required = price * ((1 - ltv) + acq_cost_ratio)
    => price_max     = equity_jpy / ((1 - ltv) + acq_cost_ratio)
    We return (min_price_at_lower_ltv_assumption, max_price_at_given_ltv).
    The lower bound corresponds to a stricter LTV (60%) and upper to looser (75%)
    if caller wants the band; here we return the band that uses a 60-75% sweep.
    """
    equity_jpy = ctx.krw_to_jpy(ctx.equity_krw)
    # band: stricter LTV = lower price headroom; looser LTV = higher
    lo_ltv, hi_ltv = 0.60, 0.75
    price_at_lo_ltv = equity_jpy / ((1 - lo_ltv) + ctx.acquisition_cost_ratio)
    price_at_hi_ltv = equity_jpy / ((1 - hi_ltv) + ctx.acquisition_cost_ratio)
    return int(round(price_at_lo_ltv)), int(round(price_at_hi_ltv))


# ---------- Reporting ----------

def underwrite(
    prop: PropertyEconomics,
    loan: LoanTerms,
    ctx: InvestorContext,
) -> dict:
    loan_amount = loan.ltv * prop.price_jpy
    mds = monthly_debt_service(loan_amount, loan.rate_apr, loan.term_years, loan.amortization)
    ads = mds * 12
    noi = noi_annual(prop)
    d = dscr(prop, loan)
    eq_jpy = equity_required(prop.price_jpy, loan, ctx)
    eq_krw = ctx.jpy_to_krw(eq_jpy)
    headroom_krw = ctx.equity_krw - eq_krw
    cap = cap_rate(prop)
    coc = cash_on_cash(prop, loan, ctx)
    return {
        "layout": prop.layout,
        "area_m2": prop.area_m2,
        "price_jpy": prop.price_jpy,
        "price_jpy_man": prop.price_jpy_man,
        "loan_amount_jpy": int(round(loan_amount)),
        "ltv_effective": loan.ltv,
        "rate_apr": loan.rate_apr,
        "term_years": loan.term_years,
        "monthly_debt_service_jpy": int(round(mds)),
        "annual_debt_service_jpy": int(round(ads)),
        "monthly_rent_jpy": prop.monthly_rent_jpy,
        "noi_annual_jpy": noi,
        "dscr": round(d, 3),
        "cap_rate": round(cap, 4),
        "cash_on_cash": round(coc, 4),
        "equity_required_jpy": eq_jpy,
        "equity_required_krw": eq_krw,
        "headroom_krw": headroom_krw,
        "pass_dscr": d >= 1.0,
        "pass_equity": headroom_krw >= 0,
        "pass_all": (d >= 1.0) and (headroom_krw >= 0),
    }


def screen(
    prop: PropertyEconomics,
    loan: LoanTerms,
    ctx: InvestorContext,
    dscr_min: float = 1.0,
) -> tuple[bool, str]:
    r = underwrite(prop, loan, ctx)
    if r["dscr"] < dscr_min:
        return False, f"DSCR {r['dscr']:.2f} < {dscr_min:.2f}"
    if r["headroom_krw"] < 0:
        return False, f"Equity short by KRW {-r['headroom_krw']:,}"
    return True, "OK"
