# tokyo-condo-scraper

*A Playwright scraper for SUUMO / HOMES 중고 맨션 (中古マンション) detail pages — run from a Japanese IP.*

도쿄 코어 1LDK+ 매물 인수 검토용 데이터 수집 도구입니다. SUUMO / HOMES 의 매물 상세 페이지 URL 리스트를 받아, 카드 표시와 PDF 임원 분석에 필요한 모든 필드를 추출하고 이미지(외관·실내·간취도)를 다운로드합니다.

> Important / 중요  
> SUUMO 와 HOMES 는 비(非)일본 IP, 데이터센터 IP, 일부 클라우드 IP 에서 오는 트래픽을 적극적으로 차단합니다. **샌드박스 / 한국·미국 클라우드에서 실행하면 거의 확실히 HTTP 403 또는 CAPTCHA 화면이 반환됩니다.** 본 스크립트는 사용자가 본인의 일본 가정용 인터넷(또는 합법적으로 사용 가능한 일본 거주 IP) 환경에서 직접 실행할 것을 전제로 작성되었습니다.

---

## 1. 사전 요건 (Prerequisites)

- **Node.js 20+** (`node -v` 확인)
- **Playwright 1.56+** (`package.json` 의 의존성으로 설치됨)
- **Chromium 브라우저** — `npx playwright install chromium` 으로 로컬 설치 필요
- **일본 IP 가 강력히 권장됨**
  - 가정용 광회선 / 모바일 캐리어(SoftBank, NTT, KDDI 등)
  - 또는 합법적으로 계약한 **레지덴셜 VPN/프록시** (데이터센터 VPN 은 대부분 차단됨)
- macOS / Windows / Linux 모두 지원 (헤드리스)

---

## 2. 설치 (Install)

```bash
cd scraper
npm install
npx playwright install chromium
```

---

## 3. 실행 방법 (Run)

### 3.1 URL 리스트 만들기

`urls.example.txt` 를 복사해서 `urls.txt` 로 만들고 실제 매물 상세 URL 을 한 줄에 하나씩 적습니다.

```bash
cp urls.example.txt urls.txt
# 에디터로 urls.txt 를 열어 실제 SUUMO/HOMES 상세 URL 로 교체
```

규칙:
- `#` 로 시작하는 줄과 빈 줄은 무시
- 지원 도메인: `suumo.jp`, `www.homes.co.jp`

### 3.2 스크립트 실행

```bash
npm run scrape                 # ./urls.txt 사용
node scrape.mjs ./urls.txt     # 위와 동일
```

주요 플래그:

| 플래그 | 기본값 | 설명 |
| --- | --- | --- |
| `--concurrency=N` | `1` | 동시 처리 개수 (하드 캡 `2`) |
| `--headful` | off | 브라우저 창을 띄워서 디버깅 |
| `--force` | off | `property.json` 이 이미 있어도 다시 스크레이핑 |
| `--proxy=URL` | 없음 | Chromium 의 launch proxy 로 전달 (예: `http://user:pass@host:port`) |
| `--out=DIR` | `./out` | 출력 디렉토리 |
| `--min-delay=ms` | `1000` | 요청 사이 최소 지터 |
| `--max-delay=ms` | `3000` | 요청 사이 최대 지터 |

예시:

```bash
# 일본 레지덴셜 프록시를 통한 헤드풀 디버깅
node scrape.mjs urls.txt --proxy=http://USER:PASS@jp.residential.example:8000 --headful

# 기존 결과 강제 갱신
node scrape.mjs urls.txt --force
```

### 3.3 일본 레지덴셜 VPN / 프록시 사용 가이드

1. **레지덴셜** 풀을 제공하는 합법적 제공자를 사용 (Bright Data, Oxylabs, NetNut 등) — 일반 데이터센터 VPN(예: 클라우드 리전 기반)은 차단되기 쉽습니다.
2. 일본 출구 (`JP` exit) 를 선택하고, 가능하면 도쿄/오사카 거주용 ISP 풀을 지정합니다.
3. HTTP/HTTPS 프록시 URL 을 받아 `--proxy=` 로 전달합니다. SOCKS5 도 동일한 형식으로 동작합니다 (`socks5://...`).
4. 처음 실행 전에는 `--headful` 로 한 번 띄워 CAPTCHA 가 뜨는지 확인하세요. 떴다면 더 깨끗한 IP로 교체.

---

## 4. 출력 구조 (Output)

```
out/
├── index.json                      # 전체 매물의 요약 인덱스
├── errors.log                      # URL 별 실패 로그
└── <site>-<slug>/
    ├── property.json               # 표준화된 매물 JSON
    ├── exterior_01.jpg             # 외관 사진들
    ├── exterior_02.jpg
    ├── interior_01.jpg             # 실내 사진들 (리빙·키친·방 등)
    ├── interior_02.jpg
    └── floorplan_01.jpg            # 간취도(間取り図)
```

`property.json` 의 주요 필드 (요약):

```jsonc
{
  "source": "suumo",
  "source_url": "...",
  "building_name": "...",
  "address": "東京都港区...",
  "price_jpy_man": 8500,          // 万円 단위
  "area_m2": 55.12,
  "layout": "1LDK",
  "balcony_m2": 7.40,
  "direction": "南東",
  "built_yearmonth": "2003-11",
  "structure": "RC",
  "total_units": 120,
  "total_floors": 34,
  "unit_floor": 11,
  "room_number": null,
  "routes": [{"line": "東京メトロ千代田線", "station": "赤坂", "walk_min": 5}],
  "mgmt_fee_jpy": 18000,
  "repair_reserve_jpy": 12000,
  "parking_jpy": 45000,
  "parking_status": "空有",
  "rent_jpy": null,
  "builder": "...",
  "mgmt_company": "...",
  "developer": "...",
  "status": "空室",
  "handover": "即時",
  "deal_type": "媒介",
  "images": [ ... ],
  "_raw_kv": { /* 원본 키-값 표 전체, QA용 */ }
}
```

`index.json` 은 위 객체들의 요약(매물명·가격·면적·간취·주소·slug)을 배열로 묶은 것입니다.

---

## 5. 법적 / 윤리적 주의사항 (TOS, Etiquette)

스크립트를 실행하는 **모든 책임은 사용자 본인**에게 있습니다. 본 도구는 본인 검토용 매물 자료를 정리할 목적으로만 사용해야 합니다.

- **robots.txt 확인**  
  실행 전 `https://suumo.jp/robots.txt`, `https://www.homes.co.jp/robots.txt` 를 직접 확인하고, 금지된 경로는 스크레이핑하지 마세요.
- **약관(利用規約) 위반 가능성**  
  SUUMO / HOMES 의 이용약관에는 자동화된 수집·재배포·DB화 등을 제한하는 조항이 있을 수 있습니다. 개인적 검토 범위를 넘어선 사용(데이터 판매, 재배포, 광고, 학습 데이터 구축 등)은 **약관 위반 및 법적 분쟁** 으로 이어질 수 있습니다.
- **개인 용도(私的利用) 한정**  
  본 스크립트의 기본 의도는 "본인이 매수 검토 중인 소수의 매물 페이지를 정리"하는 것입니다. URL 리스트는 본인이 확인한 매물 수십 건 단위로 유지하는 것이 안전합니다.
- **요청 속도 (rate limiting)**  
  - `--concurrency` 하드 캡 = **2** (그 이상은 코드에서 거부)
  - URL 사이 1–3 초 지터
  - 분당 ~20 요청 미만 권장. 그 이상은 스스로 페이지 사이에 `sleep` 을 추가하세요.
- **대량 수집 금지**  
  일/주 단위로 수백~수천 페이지를 긁는 행위는 **명백한 약관 위반이며 법적 리스크**가 큽니다. 본 스크립트는 그러한 용도로 작성되지 않았으며, 기본 설정도 그렇게 동작하지 않습니다.
- **재배포 금지**  
  스크레이핑한 사진·문구는 SUUMO/HOMES 및 매물주의 저작물입니다. 외부 공개·블로그 게시·SaaS 형태의 재배포는 하지 마세요.
- **CAPTCHA 가 뜨면 멈춥니다**  
  CAPTCHA / 차단 페이지가 반복적으로 뜬다는 것은 사이트가 명시적으로 "오지 말라" 는 신호입니다. **회피하지 말고 즉시 중단** 하세요.

---

## 6. 한국(또는 비-JP) IP 에서 실행 시

- HTTP **403 / 451 / 어뷰즈 페이지 / CAPTCHA** 가 발생할 가능성이 매우 높습니다.
- 본 스크립트는 일본 IP 가정 하에 동작합니다.
- 우회(레지덴셜 VPN 사용 등)는 **사용자 본인의 책임**이며, 사이트 약관 위반 가능성을 인지한 상태에서만 수행해야 합니다.
- 위 우회 행위로 인한 계정/IP 차단, 법적 책임, 데이터 손실 등에 대해 본 도구의 작성자는 일절 책임지지 않습니다.

---

## 7. 알려진 한계 / TODO

- SUUMO / HOMES 의 DOM 은 자주 변경되므로 셀렉터는 **best-effort** 입니다. `scrape.mjs` 의 `SITES` 배열에 셀렉터가 모여 있으며, 실패할 경우 헤드풀 모드로 띄워 DOM 을 확인 후 패치하세요.
- 일부 필드(`room_number`, `rent_jpy`, `builder`)는 매물에 따라 페이지에 표시되지 않으며 그 경우 `null` 로 남습니다.
- 신축/분양 페이지(`/ms/shinchiku/`) 구조는 약간 다릅니다 — 본 스크립트는 **중고(中古)** 페이지 위주로 튜닝되어 있습니다.
- 단지 정보 페이지(별도 URL)에서 가져와야 하는 필드(`총戸수`, `시공회사` 등)는 매물 페이지에 노출되어 있을 때만 채워집니다.

---

## 8. 빠른 검증 (Smoke check)

브라우저 다운로드 없이 스크립트 자체 문법만 확인:

```bash
node --check scrape.mjs
```

`PARSE OK` 같은 별도 출력 없이 종료 코드 0 이면 정상입니다.
