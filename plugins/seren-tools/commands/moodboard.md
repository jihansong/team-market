# /moodboard

Pinterest에서 키워드로 무드보드 이미지 30장을 수집해 Downloads 폴더에 저장합니다.

## 사용법
```
/moodboard <키워드>
```
예시: `/moodboard 느낌좋은 카페`, `/moodboard 도쿄 골목`, `/moodboard 미니멀 인테리어`

## 실행 단계

### 1단계 — Pinterest 접속

`mcp__plugin_seren-tools_playwright__browser_navigate` 로 접속.
키워드를 URL 인코딩해서 삽입:

```
https://www.pinterest.com/search/pins/?q=<URL인코딩된_키워드>&rs=typed
```

### 2단계 — 이미지 URL 수집 (30개 이상 확보)

`mcp__plugin_seren-tools_playwright__browser_evaluate` 로 JS 실행.
스크롤 → 대기(2500ms) → URL 추출을 30개 확보될 때까지 반복 (최대 10회):

```js
// 스크롤
() => { window.scrollBy(0, 2500); return window.scrollY; }

// 대기
() => new Promise(r => setTimeout(r, 2500))

// URL 추출 (736x 업스케일)
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

URL 배열을 `C:\Users\<USER>\Downloads\<slug>_urls.json` 에 저장 (filename 파라미터).
30개 미만 → 스크롤 추가. 여러 배치 합산 후 중복 제거.

### 3단계 — 다운로드

```powershell
$keyword = "<키워드>"
$slug    = $keyword -replace ' ','_'
$user    = $env:USERNAME
$saveDir = "C:\Users\$user\Downloads\moodboard_$slug"
if (!(Test-Path $saveDir)) { New-Item -ItemType Directory -Path $saveDir | Out-Null }

$urls = (Get-Content "C:\Users\$user\Downloads\${slug}_urls.json" | ConvertFrom-Json) |
        Select-Object -Unique | Select-Object -First 30

$count = 0
foreach ($url in $urls) {
    $count++
    $out = "$saveDir\${slug}_$($count.ToString().PadLeft(2,'0')).jpg"
    try {
        Invoke-WebRequest -Uri $url -OutFile $out `
          -UserAgent 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36' `
          -ErrorAction Stop
        Write-Host "[$count/30] 저장"
    } catch { Write-Host "[$count/30] 실패" }
}
Write-Host "`n완료! $((Get-ChildItem $saveDir -Filter '*.jpg').Count)개 → $saveDir"
Start-Process explorer.exe $saveDir
```

### 4단계 — 결과 보고

```
✅ 무드보드 수집 완료
키워드 : <키워드>
저장   : C:\Users\<USER>\Downloads\moodboard_<키워드>\
파일 수: 30장 (736x 고화질)
탐색기 : 자동 오픈됨
```
