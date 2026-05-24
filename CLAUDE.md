# CLAUDE.md

이 저장소(`team-market`)는 팀 공유 Claude Code 플러그인 마켓플레이스다. 구조와
설치법은 `README.md` 참고.

---

## 학습 노트: Kimchi 대시보드 (henryquant.shinyapps.io/kimchi)

> 사용자 요청으로 `https://henryquant.shinyapps.io/kimchi/` 를 학습해 메모리에 저장한 결과.
> 마지막 조사: 2026-05-24.

### 확인된 사실

- **작성자**: Henry's Quantopia — GitHub `hyunyulhenry`, 블로그 `henryquant.blogspot.kr`.
  R 기반 퀀트 투자 콘텐츠 제작자(저서/저장소: `quant_cookbook` "R을 이용한 퀀트 투자
  포트폴리오 만들기", `quant_py` 파이썬 버전).
- **앱 성격**: **김치 프리미엄(Kimchi Premium) 대시보드**. 같은 작성자가 운영하는 다른
  Shiny 대시보드로 `GDAA`(Global Dynamic Asset Allocation Dashboard), `kingspi`(만스피
  대시보드)가 있으며, 본 앱은 그 계열의 R Shiny 앱이다.
- **기술 스택**: R Shiny (shinyapps.io 호스팅, websocket 구동 동적 앱).

### 김치 프리미엄 개념 (일반)

- **정의**: 한국 거래소(예: 업비트)의 암호화폐 가격이 해외 거래소(예: 바이낸스) 대비
  얼마나 높은지를 나타내는 지표. 줄여서 "김프".
- **계산**: `김프(%) = (국내가격 / (해외가격 × 원달러환율) - 1) × 100`.
  - 국내가: 업비트 등 KRW 마켓 시세
  - 해외가: 바이낸스 등 USDT/USD 마켓 시세
  - 환율: 실시간 USD/KRW
- **해석**: 양수면 국내가 프리미엄(매수세 과열·자본통제 영향), 음수면 "역프리미엄".
- 이런 대시보드의 일반 구성요소: 코인별 김프 실시간 표/차트, BTC 김프 시계열,
  환율, 주요 알트코인 비교 등.

### 접근 제약 (중요 — 다음 세션에서 재시도 시 참고)

라이브 앱의 **고유 UI(탭·차트·입력 위젯·데이터)는 자동으로 확보하지 못했다.** 이유:

1. **네트워크 허용목록 차단**: 이 원격 실행 환경의 네트워크 정책이 `shinyapps.io`,
   `web.archive.org`, `archive.org`, `google.com` 을 모두 차단(`Host not in
   allowlist`, HTTP 403). 허용된 호스트는 `github.com`, `raw.githubusercontent.com`,
   `api.github.com`, `pypi.org` 등 개발용뿐이다.
2. **동적 앱 특성**: R Shiny 앱은 websocket 구동이라, 접근이 가능해도 정적 스크래핑으로는
   차트/위젯/데이터가 렌더링되지 않는다.
3. **공개 소스 없음**: 작성자 GitHub(`hyunyulhenry`) 공개 저장소 21개 중 `kimchi`
   이름/매칭 저장소가 없다(코드 검색은 로그인 필요).

**앱 내부를 정확히 학습하려면** 다음 중 하나가 필요하다:
- 환경 네트워크 정책에 `*.shinyapps.io` 추가 후 **새 세션** 시작(정책은 컨테이너
  시작 시 적용), 또는
- 앱 **소스코드**(`app.R` / `ui.R`·`server.R`)나 **스크린샷**을 직접 제공.
