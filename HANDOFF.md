# 세션 핸드오프 — 레퍼런스 사이트 7선 학습 작업

> 이전 세션(Claude Code on the web, 클라우드 VM)에서 시작했지만 네트워크 정책 제약으로 중단된 작업. 로컬 PC의 Claude Code 세션에서 이 문서를 읽고 이어서 진행한다.

## 1. 최종 목표

사용자가 매거진·뉴스·리포트·영상 제작을 요청하면서 "감도 높은 / 느낌 있는 / 섹시한 / 느좋 / 세련된" 같은 키워드를 쓸 때, **hif.community가 추천한 7개 레퍼런스 사이트의 실제 콘텐츠**를 근거로 컨셉·컬러·룩·카피·레이아웃 제안을 만들도록 한다.

7개 사이트:
1. TVCF — https://tvcf.co.kr/
2. snskeyboard — https://snskeyboard.com
3. Pantone Color Finder — https://www.pantone.com/color-finder
4. steep.design — https://steep.design
5. cara — https://cara.app/explore
6. are.na — https://www.are.na/editorial
7. tagwalk — https://www.tag-walk.com/en/

## 2. 이미 끝난 것 (커밋 `29fb598`)

`CLAUDE.md` 작성·푸시 완료. 내용:
- 트리거 어휘 6종
- 응답 5원칙 (출처 명시 / 코드·URL 인용 / 환각 금지 / 다중 사이트 조합 / hif 어투)
- 7개 사이트별 용도·트리거·카테고리 (hif.community 인스타 캐러셀에 적힌 설명 + 스크린샷에 보이는 UI 수준)
- 결합 시나리오 예시

**한계**: 사이트 내부 콘텐츠는 한 번도 직접 확인 못 함. "tvcf 메인에 X 광고가 있다" 같은 인용은 모두 환각이 됨.

## 3. 막힌 이유

Claude Code on the web 세션은 격리된 클라우드 VM에서 돌고, **네트워크 정책이 GitHub 외 모든 외부 호스트를 egress 프록시에서 차단**한다. curl·Playwright·WebFetch 어떤 도구로도 7개 사이트에 닿지 못함 (확인됨: example.com·google.com 포함 전부 403).

Playwright 1.56.1과 Chromium 141은 이 VM에도 미리 설치되어 있지만, 네트워크가 막혀 무용지물.

## 4. 다음 세션이 할 일 (로컬 PC에서)

### 4-1. 환경 확인

```bash
# 로컬 클론으로 이동 (예시 경로, 실제는 본인 환경에 맞게)
cd ~/.claude/plugins/marketplaces/team-market

# 최신 브랜치 가져오기
git fetch origin
git checkout claude/new-session-olpWs
git pull

# seren-tools 플러그인의 Playwright MCP가 enable 되어있는지 확인
# (settings.json 의 enabledPlugins 에 "seren-tools@team-market": true)
```

### 4-2. 사이트별 크롤링 + 노트 작성

각 사이트마다 Playwright MCP로 다음을 수집해 `references/<site>.md`에 저장한다. 7개 파일.

**TVCF (`references/tvcf.md`)**
- `오늘의 크리에이티브` 섹션: 오늘 큐레이션된 광고 10개 (브랜드, 카피 일부, 영상 길이)
- `New Creative` 라벨이 붙은 최신 트렌드 광고 5개
- 국내 CF / 해외 CF / 숏폼 비율 관찰

**snskeyboard (`references/snskeyboard.md`)**
- 카테고리 전체 목록 (데코 폰트 / 팬시 폰트 / 아스키 캘린더 / 도트 아트 / 이모티콘 메이커 / 시끄러운 댓글 등)
- 카테고리별 대표 샘플 5개씩 (실제 문자열 캡처)
- 어떤 무드(키치·미니멀·레트로·귀여움)에 매핑되는지 분류

**Pantone (`references/pantone.md`)**
- 카테고리 7개(COTTON TCX, NYLON BRIGHTS TN, METALLIC SHIMMERS TPM, PAPER TPG, POLYESTER TSX, SKINTONE GUIDE, GRAPHICS 하위)별로 작동 방식 정리
- 자주 쓰이는 컬러 코드 패턴(예: `15-6324 TCX Peapod` 같은 그린 계열) 30개 정도 샘플 수집
- 2024-2026 Color of the Year 라인 확인

**steep.design (`references/steep.md`)**
- 카테고리 트리: Fashion / Beauty / F&B / Typography / Music / 기타 (있는 그대로)
- 각 카테고리별 등록 브랜드 수
- Fashion 대표 브랜드 10개, Typography 대표 브랜드 10개 캡처

**cara (`references/cara.md`)**
- Discover / Following / Latest 탭의 콘텐츠 성격 차이
- 현재 진행 중인 이벤트 챌린지 목록 (#Plantober, #Huevember 등)
- 일러스트 / 3D / 컨셉아트 비율 관찰, 톤 분류 (다크판타지·파스텔·실사·만화 등)

**are.na (`references/arena.md`)**
- Editorial 페이지 메인 채널 목록 (Featured Channels, 사용자 큐레이션 채널 등)
- "styling/art direction" 채널의 블록 30개 샘플
- 인기 큐레이터 5명, 그들이 운영하는 채널 성격

**tagwalk (`references/tagwalk.md`)**
- 검색 가능한 차원: 브랜드(1400+) / 시즌(50+) / 컬러 / 아이템 정확한 셀렉터 옵션
- 최신 시즌(SS26 또는 FW25) 트렌드 키워드 10개
- 컬러별 결과 분포(예: `red shoes` 검색 시 어떤 디자이너들이 자주 등장)

### 4-3. CLAUDE.md 업데이트

각 사이트 섹션 끝에 `→ 상세: references/<site>.md` 링크 추가. 응답 원칙 1번("어디서 참고했는지 명시")에서 이 노트의 구체 줄을 인용하도록 강화.

### 4-4. 커밋 & PR

브랜치 `claude/new-session-olpWs`에 계속 쌓고, 작업 완료되면 사용자에게 main 머지 여부 물어본다.

## 5. 새 세션이 첫 메시지로 받을 입력 (예시)

> 로컬 PC에서 새 세션 열었어. team-market 레포 HANDOFF.md 읽고 4번부터 이어서 해줘. 7개 사이트 다 돌면서 references/ 폴더에 노트 만들고, CLAUDE.md에 링크 박아줘.

## 6. 주의

- **환각 금지**: 사이트에 실제로 접속하지 못했다면 그 사이트 섹션은 비워두고 "접속 실패 — 사용자 확인 필요" 라고 명시한다. 추측으로 채우지 않는다.
- **이미지 다운로드 X**: 노트는 텍스트(브랜드명·카테고리명·컬러 코드·검색 쿼리) 중심. 이미지 캐싱은 별도 작업.
- **각 노트 최대 200줄**: 너무 비대해지면 라우팅 효율이 떨어진다. 핵심 카테고리·대표 샘플만.
- **컨테이너 폐기 위험**: 작업 도중 커밋 자주 (사이트 1개 끝날 때마다 1커밋).
