---
name: moodboard
description: Pinterest에서 키워드로 무드보드 이미지 30장을 수집해 폴더에 저장한다. "/moodboard 키워드", "무드보드 만들어줘", "Pinterest에서 이미지 수집", "~~ 사진 30장 모아줘" 같은 요청에 사용.
tools: Read, Bash
---

# Moodboard 수집기

Pinterest에서 키워드로 이미지 30장을 수집해 `C:\Users\<USER>\Downloads\moodboard_<키워드>\` 에 저장한다.
저장 경로의 `<USER>` 는 현재 Windows 사용자명으로 치환한다 (`$env:USERNAME`).

## 실행 순서

### 1단계 — Pinterest 접속

`mcp__plugin_seren-tools_playwright__browser_navigate` 로 접속.
키워드를 encodeURIComponent 방식으로 URL 인코딩:

```
https://www.pinterest.com/search/pins/?q=<URL인코딩된_키워드>&rs=typed
```

### 2단계 — 이미지 URL 수집 (30개 이상 확보)

`mcp__plugin_seren-tools_playwright__browser_evaluate` 로 JS 실행. 수집 전 2500ms 대기.

스크롤 → 대기 → URL 추출 반복 (30개 확보 시 종료, 최대 10회):

```js
// 스크롤
() => { window.scrollBy(0, 2500); return window.scrollY; }

// 대기
() => new Promise(r => setTimeout(r, 2500))

// URL 추출 (736x 고화질)
() => {
  const imgs = document.querySelectorAll('img[src*="pinimg.com"]');
  const urls = [...imgs].map(img =>
    img.src
      .replace('/236x/', '/736x/')
      .replace('/474x/', '/736x/')
      .replace('/564x/', '/736x/')
  ).filter(src => src.includes('pinimg.com'));
  return [...new Set(urls)];
}
```

URL 배열을 `C:\Users\<USER>\Downloads\<키워드>_urls.json` 에 저장.
30개 미만이면 스크롤 추가. 여러 배치 합산 후 중복 제거해 30개 선택.

### 3단계 — 다운로드

PowerShell 실행. User-Agent 필수 (없으면 403):

```powershell
$keyword = "<키워드>"
$slug    = $keyword -replace ' ','_'
$user    = $env:USERNAME
$saveDir = "C:\Users\$user\Downloads\moodboard_$slug"
if (!(Test-Path $saveDir)) { New-Item -ItemType Directory -Path $saveDir | Out-Null }

$urlFile = "C:\Users\$user\Downloads\${slug}_urls.json"
$urls = (Get-Content $urlFile | ConvertFrom-Json) | Select-Object -Unique | Select-Object -First 30

$count = 0
foreach ($url in $urls) {
    $count++
    $filename = "$saveDir\${slug}_$($count.ToString().PadLeft(2,'0')).jpg"
    try {
        Invoke-WebRequest -Uri $url -OutFile $filename `
          -UserAgent 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36' `
          -ErrorAction Stop
        Write-Host "[$count/30] 저장: ${slug}_$($count.ToString().PadLeft(2,'0')).jpg"
    } catch {
        Write-Host "[$count/30] 실패: $url"
    }
}
$total = (Get-ChildItem $saveDir -Filter '*.jpg').Count
Write-Host "`n완료! 총 $total 개 → $saveDir"
Start-Process explorer.exe $saveDir
```

### 4단계 — 보고

```
✅ 무드보드 수집 완료
키워드 : <키워드>
저장   : C:\Users\<USER>\Downloads\moodboard_<키워드>\
파일 수: 30장 (736x 고화질)
탐색기 : 자동 오픈됨
```

## 주의사항
- Pinterest는 로그인 없이 이미지 URL 접근 가능 (토큰 만료 없음)
- 페이지 가상화로 스크롤 전후 이미지가 달라짐 → 여러 번 수집 후 합산
- 30개 부족 시 스크롤 반복. 30개 확보되면 즉시 다운로드
