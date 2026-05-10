# Downloads 파일 정리

`C:\Users\<현재사용자>\Downloads` 폴더를 아래 순서로 정리해라.
경로의 사용자명은 `$env:USERNAME` 으로 자동 처리한다.

## 1단계: SHA256 중복 파일 제거

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

루트 파일만 분류 (하위 폴더 파일 이동 금지):

- **설치파일**: .exe, .msi 확장자 전부
- **IR Report**: 파일명에 "IR Deck" 포함된 것만
- **투자심사보고서**: CDD, IM, Termsheet, 제안서, 검토보고서, 검토의 건, 투자심사, 비상장 딜, Pre IPO, 구주 인수, EB, CB, CPS (IR Deck 제외한 투자 관련 전부)
- **Research**: 리서치/분석 보고서, 시장 데이터 엑셀, 부동산 개발 분석, 신탁상품설명서
- **기타서류**: 이력서, 부동산 서류, 공고문, 영수증, 사업계획서, 보안메일, 압축파일, 나머지 전부

이동 시 .NET 메서드 사용 (한글/특수문자 파일명 대응):
```powershell
[System.IO.File]::Copy($f.FullName, "$dst\$($f.Name)", $true)
[System.IO.File]::Delete($f.FullName)
```

## 3단계: 완료 보고

- 삭제된 중복 파일 수, 각 폴더별 파일 수, 루트 잔여 파일 수
- `Start-Process explorer.exe "C:\Users\$env:USERNAME\Downloads"` 로 탐색기 열기
