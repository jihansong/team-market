---
name: sort-files
description: Downloads 폴더 파일을 SHA256 중복 제거 후 5개 카테고리로 분류 정리. "/sort-files", "/정리", "파일 정리해줘", "다운로드 폴더 정리", "중복 파일 삭제" 요청 시 사용.
tools: Read, Bash
---

# Downloads 파일 정리

`C:\Users\<USER>\Downloads` 폴더를 아래 순서로 정리한다.
`<USER>` 는 `$env:USERNAME` 으로 치환한다.

## 1단계: SHA256 중복 파일 제거

내용이 동일한 파일을 찾아 가장 오래된 것만 남기고 나머지 삭제.
한글/대괄호 파일명은 반드시 .NET 메서드 사용:

```powershell
$base = "C:\Users\$env:USERNAME\Downloads"
$allFiles = Get-ChildItem $base -File -Recurse
$hashGroups = $allFiles | Group-Object {
    (Get-FileHash $_.FullName -Algorithm SHA256).Hash
} | Where-Object { $_.Count -gt 1 }

foreach ($group in $hashGroups) {
    $sorted = $group.Group | Sort-Object LastWriteTime
    $toDelete = $sorted | Select-Object -Skip 1
    foreach ($f in $toDelete) {
        [System.IO.File]::Delete($f.FullName)
        Write-Host "중복 삭제: $($f.Name)"
    }
}
```

## 2단계: 파일 분류 및 이동

루트에 있는 파일만 분류 (하위 폴더 파일 이동 금지):

| 폴더 | 기준 |
|------|------|
| **설치파일** | .exe, .msi 확장자 전부 |
| **IR Report** | 파일명에 "IR Deck" 포함된 것만 |
| **투자심사보고서** | CDD, IM, Termsheet, 제안서, 검토보고서, 검토의 건, 투자심사, 비상장 딜, Pre IPO, 구주 인수, EB, CB, CPS (IR Deck 제외 투자 관련 전부) |
| **Research** | 리서치/분석 보고서, 시장 데이터 엑셀, 부동산 개발 분석, 신탁상품설명서 |
| **기타서류** | 이력서, 부동산 서류, 공고문, 영수증, 사업계획서, 보안메일, 압축파일, 나머지 전부 |

이동 시 반드시 .NET 메서드 사용:
```powershell
[System.IO.File]::Copy($f.FullName, "$dst\$($f.Name)", $true)
[System.IO.File]::Delete($f.FullName)
```

## 3단계: 완료 보고

- 삭제된 중복 파일 수
- 각 폴더별 이동 파일 수
- 루트 잔여 파일 수
- `Start-Process explorer.exe "C:\Users\$env:USERNAME\Downloads"` 로 탐색기 열기
