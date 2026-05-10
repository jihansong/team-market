# team-market

팀 공유 Claude Code 플러그인 마켓플레이스.

## 포함 플러그인

| 플러그인 | 설명 | 커맨드 |
|---------|------|--------|
| `seren-tools` | Pinterest 무드보드 수집 + Downloads 파일 정리 | `/moodboard`, `/sort-files`, `/정리` |

---

## 팀원 설치 방법

### 1. 레포 클론

Claude Code 마켓플레이스 폴더에 직접 클론한다:

**Windows**
```powershell
git clone <레포_URL> "$env:USERPROFILE\.claude\plugins\marketplaces\team-market"
```

**macOS / Linux**
```bash
git clone <레포_URL> ~/.claude/plugins/marketplaces/team-market
```

### 2. settings.json에 등록

`~/.claude/settings.json` 의 `enabledPlugins` 에 추가:

```json
{
  "enabledPlugins": {
    "seren-tools@team-market": true
  }
}
```

### 3. Claude Code 재시작

완전히 종료 후 재시작하면 플러그인이 활성화된다.

### 4. 확인

```
/moodboard 테스트 키워드
```

---

## 플러그인 추가 방법

### 내부 플러그인 (직접 개발)

`plugins/` 폴더 아래에 생성:

```
plugins/
└── my-plugin/
    ├── .claude-plugin/
    │   └── plugin.json        # 필수: 이름·설명·버전
    ├── .mcp.json              # 선택: MCP 서버 포함 시
    ├── skills/
    │   └── my-skill/
    │       └── SKILL.md       # 자동 트리거 스킬
    ├── commands/
    │   └── my-command.md      # 슬래시 커맨드
    └── README.md
```

**plugin.json 형식:**
```json
{
  "name": "my-plugin",
  "description": "플러그인 설명",
  "version": "1.0.0",
  "author": { "name": "작성자" }
}
```

**SKILL.md 형식 (frontmatter 필수):**
```markdown
---
name: my-skill
description: 언제 이 스킬을 쓰는지 구체적으로 설명. 트리거 키워드 포함.
tools: Read, Bash
---

# 스킬 내용
...
```

**marketplace.json 에도 등록:**

`.claude-plugin/marketplace.json` 의 `plugins` 배열에 추가:
```json
{
  "name": "my-plugin",
  "description": "플러그인 설명",
  "author": { "name": "작성자" },
  "source": "./plugins/my-plugin",
  "category": "productivity"
}
```

### 외부 MCP 플러그인 (서드파티)

`external_plugins/` 폴더 아래에 생성 (구조 동일, `.mcp.json` 필수).

---

## 구조

```
team-market/
├── .claude-plugin/
│   └── marketplace.json       # 마켓플레이스 정의
├── plugins/                   # 내부 플러그인
│   └── seren-tools/
│       ├── .claude-plugin/plugin.json
│       ├── .mcp.json          # Playwright MCP
│       ├── skills/
│       │   ├── moodboard/SKILL.md
│       │   └── sort-files/SKILL.md
│       └── commands/
│           ├── moodboard.md
│           └── sort-files.md
├── external_plugins/          # 외부 MCP 플러그인
├── .gitignore
└── README.md
```

---

## 업데이트

팀원은 아래 명령어로 최신 플러그인을 받는다:

```powershell
# Windows
cd "$env:USERPROFILE\.claude\plugins\marketplaces\team-market"
git pull
```

```bash
# macOS / Linux
cd ~/.claude/plugins/marketplaces/team-market && git pull
```
