# Tokyo Mansion Acquisition Toolkit

> 도쿄 핵심지구 1LDK+ 콘도를 매입하기 위한 리서치·재무·스크레이핑·PDF 양식 도구 모음.  
> 자기자본 KRW 4.5억 / LTV 60-75% / 주택담보대출 2.5% / DSCR ≥ 1.0x 조건의 실투자 결정을 돕기 위해 제작.

---

## 왜 이 도구가 필요한가

1. 사용자의 본 작업 환경(Claude Code 샌드박스)에서는 SUUMO/HOMES/at home 모두 **HTTP 403**으로 차단됨 (데이터센터 IP 필터링).
2. 따라서 본 도구는 "사용자가 일본 IP/VPN 환경에서 직접 실행"하는 방식으로 설계됨. 매물 데이터는 **사용자가 자기 환경에서 수집**.
3. 본 샌드박스에서 가능한 작업: 재무 모델, 양식 PDF 생성, 빌딩 후보 리서치(공개 자료 한정), 스크레이퍼 코드 작성.
4. **본 도구는 절대 가짜 매물 데이터를 생성하지 않습니다.** 사용자가 검증한 데이터만 PDF로 렌더링됩니다.

---

## 디렉터리 구조

```
osaka-research/
├── README.md                  ← 이 파일
├── src/                       ← Subagent A: 재무 모델
│   ├── financial_model.py
│   ├── underwrite.py          ← CLI: properties.json → DSCR 평가
│   └── test_financial_model.py
├── scraper/                   ← Subagent B: Playwright 스크레이퍼
│   ├── package.json
│   ├── scrape.mjs             ← Node 스크레이퍼 본체
│   ├── urls.example.txt
│   └── README.md
├── render/                    ← Subagent C: PDF 양식 생성기
│   ├── render.py              ← CLI: properties.json → PDF
│   ├── test_render.py
│   └── templates/
│       ├── listing_card.html.j2       (STARTS 매물카드 양식)
│       ├── analysis_executive.html.j2 (Executive Analysis 양식)
│       └── styles.css
├── research/                  ← Subagent D: 도쿄 빌딩·시세 리서치
│   ├── tokyo_core_buildings.json
│   ├── ward_price_benchmarks.json
│   ├── investment_thesis.md
│   └── verification_checklist.md
├── data/                      ← 입력 데이터 (스키마 + 샘플)
│   ├── properties.schema.json
│   ├── properties.sample.json
│   ├── sample_input.json      (재무 모델 CLI용 샘플)
│   └── underwriting_results.json
├── assets/                    ← placeholder 이미지
└── output/                    ← 렌더 결과 PDF
```

---

## 끝부터-끝까지 워크플로우

### Step 1. 후보 빌딩 검토

`research/tokyo_core_buildings.json` 의 12개 후보 빌딩과 `research/investment_thesis.md` 의 분석을 검토합니다.

**핵심 발견 (thesis §4.3):**
- 사용자 명시 조건(2.5% / 30년 **원리금균등** / DSCR 1.0x)에서 도쿄 도심의 DSCR 통과 구간은 매우 좁음.
- 도쿄 도심 1LDK·콤팩트2LDK 일반 임대료(¥250-350k) 기준 통과 가능 매수가는 **¥80-100m 부근**.
- **이자만 상환** 구조면 가용 가격대가 ¥110-140m까지 확장.
- 차주 자격 + 대출 구조가 결론을 좌우. 일본 거주자 영주권자/배우자/취업비자가 아니면 LTV 50-60% 한도(¥109m)가 현실선.

### Step 2. 일본 IP 환경에서 매물 URL 수집

```bash
cd scraper
npm install
npx playwright install chromium
cp urls.example.txt urls.txt
# urls.txt 에 SUUMO/HOMES 매물 상세 URL을 한 줄에 하나씩 추가
npm run scrape
```

산출: `scraper/out/<slug>/property.json`, `floorplan_*.jpg`, `exterior_*.jpg`, `interior_*.jpg` 자동 다운로드.

> ⚠️ **한국 IP에서는 실패합니다.** 일본 VPN/일본 거주 환경에서 실행하세요. 자세한 내용은 `scraper/README.md`.

### Step 3. 재무 모델로 DSCR 검증

```bash
python3 src/underwrite.py --input data/listings.json
```

산출: `data/underwriting_results.json` (DSCR/Cap Rate/Equity Required/Pass-Fail 평가).

### Step 4. DSCR 통과 매물을 `data/properties.json` 으로 정리

`data/properties.schema.json` 스키마를 따라 입력 JSON을 만듭니다. 샘플은 `data/properties.sample.json`.

### Step 5. 검증 체크리스트 적용

`research/verification_checklist.md` 의 A~K 섹션을 통과한 매물만 최종 10건 풀에 포함.

### Step 6. PDF 양식 생성

```bash
python3 render/render.py --mode both \
    --input data/properties.json \
    --output output/
```

산출:
- `output/cards/<id>_<slug>.pdf` — STARTS 양식 매물카드 (각 매물 한 페이지)
- `output/<title>_analysis.pdf` — Executive Analysis (표지·랭킹·지역·학군·유니버스·비교·클러스터 등 8+페이지)
- `output/<title>_all.pdf` — 위 둘을 합본

---

## 단독 실행 가능한 유틸리티

| 명령 | 설명 |
|---|---|
| `python3 src/test_financial_model.py` | 재무 모델 단위 테스트 11개 |
| `python3 src/underwrite.py --input data/sample_input.json` | 샘플 매물 3건 DSCR 평가 |
| `node --check scraper/scrape.mjs` | 스크레이퍼 문법 검증 |
| `python3 render/test_render.py` | 렌더러 스모크 테스트 4개 |
| `python3 render/render.py --mode both --input data/properties.sample.json --output output/` | 샘플 데이터로 PDF 생성 |

---

## 검증된 사실 vs 검증 필요 항목

### ✅ 검증된 사실

- **재무 모델**: 11개 단위 테스트 통과. annuity 공식·DSCR·equity_required·max_price_for_dscr 모두 수학적 정합성 확인.
- **렌더러**: 스모크 테스트 4개 통과. STARTS 매물카드(1페이지) + Executive Analysis(8페이지) PDF 정상 생성.
- **빌딩 존재**: `tokyo_core_buildings.json` 의 12개 중 7개는 위키피디아·디벨로퍼 공식 페이지 등 다중 출처로 빌딩 존재·완공년·세대수·시공사 검증 완료. 5개는 정확한 단지 식별이 추가 필요(verification_gaps 표기).
- **시세 벤치마크**: LIFULL HOMES 2025-09 ~ 2026-04 광역 통계 인용 + 출처 명시.

### ⚠️ 사용자 검증 필요

- **개별 매물의 현재 매도가·임대료·동호수**: 일본 IP에서 SUUMO/HOMES 접속 후 직접 확인 또는 스크레이퍼 실행.
- **차주 자격**: 사용자의 거주 신분 + 대출 가능 은행 + LTV 한도.
- **단지 内 수선적립금 인상 이력 / 大規模修繕 시점**: 관리실 또는 중개사 통해 장기수선계획서 입수.
- **빌딩 후보 5개의 정확한 단지 식별**: verification_gaps 항목 참고.

---

## 한계 명시

1. 본 도구는 **사용자가 자기 환경에서 수집한 매물 데이터를 처리**하는 도구입니다. 매물을 자동으로 발견하지 않습니다.
2. 매물 발견은 사용자가 직접 SUUMO/HOMES/中介사 채널로 진행해야 합니다.
3. 재무 모델의 운영비·세금 기본값은 보수적입니다. 단지별·매물별 실제 수치는 차이가 있을 수 있습니다.
4. 본 도구는 **투자 권유가 아닙니다**. 실투자 결정 전 일본 거주 세무사·중개사·법무사 자문이 필요합니다.

---

## 라이선스·약관

스크레이퍼는 SUUMO/HOMES의 robots.txt와 이용약관을 준수해야 합니다 (`scraper/README.md` §법적 주의사항). 대량 수집·상업 재배포는 금지됩니다. 본 도구를 사용한 결과로 발생한 사이트 약관 위반·법적 분쟁에 대해 도구 작성자는 책임을 지지 않습니다.
