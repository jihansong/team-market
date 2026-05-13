"""Unit tests for financial_model.

Run: python3 src/test_financial_model.py
"""

from __future__ import annotations

import math
import unittest

from financial_model import (
    InvestorContext,
    LoanTerms,
    PropertyEconomics,
    affordable_price_range,
    dscr,
    equity_required,
    max_price_for_dscr,
    monthly_debt_service,
    noi_annual,
    underwrite,
)


def _base_prop(price_man: float = 6000, rent: int = 200_000) -> PropertyEconomics:
    return PropertyEconomics(
        price_jpy_man=price_man,
        area_m2=35.0,
        layout="1LDK",
        monthly_rent_jpy=rent,
        mgmt_fee_jpy=12_000,
        repair_reserve_jpy=8_000,
        parking_jpy=0,
        property_tax_annual_jpy=None,
        insurance_annual_jpy=30_000,
        vacancy_rate=0.05,
        opex_other_ratio=0.05,
    )


class TestDebtService(unittest.TestCase):
    def test_annuity_matches_formula(self):
        # 100,000,000 JPY @ 2.5% over 30 years -> ~395,123 JPY/month
        # P = L*r*(1+r)^n / ((1+r)^n - 1)
        L = 100_000_000
        r = 0.025 / 12
        n = 360
        expected = L * r * (1 + r) ** n / ((1 + r) ** n - 1)
        got = monthly_debt_service(L, 0.025, 30, amortization=True)
        self.assertAlmostEqual(got, expected, places=2)
        # Sanity: known answer band
        self.assertTrue(394_000 < got < 396_000, f"got {got}")

    def test_interest_only(self):
        L = 100_000_000
        got = monthly_debt_service(L, 0.025, 30, amortization=False)
        # Interest-only = L * r/12
        self.assertAlmostEqual(got, L * 0.025 / 12, places=4)

    def test_zero_loan(self):
        self.assertEqual(monthly_debt_service(0, 0.025, 30), 0.0)


class TestDSCR(unittest.TestCase):
    def test_dscr_basic(self):
        prop = _base_prop(price_man=6000, rent=200_000)
        loan = LoanTerms(ltv=0.70, rate_apr=0.025, term_years=30)
        d = dscr(prop, loan)
        # Manually recompute to lock the contract
        loan_amount = 0.70 * prop.price_jpy
        ads = monthly_debt_service(loan_amount, 0.025, 30) * 12
        expected = noi_annual(prop) / ads
        self.assertAlmostEqual(d, expected, places=4)
        self.assertGreater(d, 0)


class TestMaxPriceMonotone(unittest.TestCase):
    def test_max_price_monotone_in_rent(self):
        loan = LoanTerms(ltv=0.70, rate_apr=0.025, term_years=30)
        prices = []
        for rent in (150_000, 200_000, 250_000, 300_000):
            p = _base_prop(rent=rent)
            mp = max_price_for_dscr(1.0, p, loan)
            prices.append(mp)
        # higher rent should permit (weakly) higher max price
        for a, b in zip(prices, prices[1:]):
            self.assertLessEqual(a, b, f"non-monotone: {prices}")
        # And strict increase between far-apart rents
        self.assertLess(prices[0], prices[-1])


class TestAffordableScales(unittest.TestCase):
    def test_affordable_scales_linearly_with_equity(self):
        loan = LoanTerms(ltv=0.70)
        ctx1 = InvestorContext(equity_krw=450_000_000, fx_jpy_to_krw=9.5)
        ctx2 = InvestorContext(equity_krw=900_000_000, fx_jpy_to_krw=9.5)
        lo1, hi1 = affordable_price_range(ctx1, loan)
        lo2, hi2 = affordable_price_range(ctx2, loan)
        self.assertAlmostEqual(lo2 / lo1, 2.0, places=3)
        self.assertAlmostEqual(hi2 / hi1, 2.0, places=3)


class TestParkingPassthrough(unittest.TestCase):
    def test_parking_increases_noi(self):
        loan = LoanTerms(ltv=0.70)
        no_park = _base_prop()
        with_park = _base_prop()
        with_park.parking_jpy = 20_000
        n1 = noi_annual(no_park)
        n2 = noi_annual(with_park)
        # Difference should be parking * 12 * (1 - vacancy) (no opex_other deducted twice — but yes it's in EGI*ratio)
        gpr_delta = 20_000 * 12
        egi_delta = gpr_delta * (1 - 0.05)
        expected_delta = egi_delta * (1 - 0.05)  # also taxed by opex_other_ratio
        self.assertAlmostEqual(n2 - n1, expected_delta, delta=2)


class TestEdgeCases(unittest.TestCase):
    def test_zero_vacancy(self):
        prop = _base_prop()
        prop.vacancy_rate = 0.0
        noi_v0 = noi_annual(prop)
        prop.vacancy_rate = 0.05
        noi_v5 = noi_annual(prop)
        self.assertGreater(noi_v0, noi_v5)

    def test_interest_only_lowers_debt_service(self):
        prop = _base_prop()
        loan_amort = LoanTerms(ltv=0.70, rate_apr=0.025, term_years=30, amortization=True)
        loan_io = LoanTerms(ltv=0.70, rate_apr=0.025, term_years=30, amortization=False)
        d_amort = dscr(prop, loan_amort)
        d_io = dscr(prop, loan_io)
        # interest-only -> lower debt service -> higher DSCR
        self.assertGreater(d_io, d_amort)

    def test_equity_required_components(self):
        loan = LoanTerms(ltv=0.70)
        ctx = InvestorContext()
        price = 60_000_000
        eq = equity_required(price, loan, ctx)
        expected = price * (1 - 0.70) + price * 0.08
        self.assertEqual(eq, int(round(expected)))

    def test_underwrite_report_keys(self):
        prop = _base_prop()
        loan = LoanTerms(ltv=0.70)
        ctx = InvestorContext()
        r = underwrite(prop, loan, ctx)
        for key in (
            "price_jpy", "ltv_effective", "monthly_debt_service_jpy",
            "noi_annual_jpy", "dscr", "cap_rate", "cash_on_cash",
            "equity_required_jpy", "equity_required_krw", "headroom_krw",
            "pass_dscr", "pass_equity", "pass_all",
        ):
            self.assertIn(key, r)


if __name__ == "__main__":
    unittest.main(verbosity=2)
