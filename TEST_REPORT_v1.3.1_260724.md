# v1.3.1 검증 기록

검증일: 2026-07-24

## 자동 검증

- `components/research-checklist.js` JavaScript 문법 검사 통과
- `app.js` JavaScript 문법 검사 통과
- `sw.js` JavaScript 문법 검사 통과
- 구조화 체크리스트 96종 로드 확인
- PDF 생성 함수 브라우저 스모크 테스트 통과
  - 모의 캔버스 1200 × 4200px 입력
  - PDF Blob 5KB 이상 생성 확인
  - 3페이지 분할 확인
  - 생성 후 임시 렌더링 호스트와 진행 화면 제거 확인
- 모바일 사용자 에이전트별 A4 경계 계산 확인
  - Android: X 7mm, Y 4mm, 폭 196mm
  - iPhone: X 7mm, Y 6mm, 폭 196mm
  - 모든 테스트 페이지가 A4 210 × 297mm 내부에 배치됨
- 기존 `window.print()` 및 iOS 네이티브 인쇄 분기 제거 확인
- 서비스워커 PDF 가상 다운로드 경로와 캐시 버전 갱신 확인

## 남은 실기기 확인

이 실행 환경에서는 실제 Android 제조사별 다운로드 UI와 iOS 공유창을 직접 완료할 수 없었습니다. 배포 후 Android 1대와 iPhone 또는 iPad 1대에서 다음 항목을 최종 확인해야 합니다.

- Android PDF 좌우·하단 잘림 여부
- iOS `기기에 저장 → 파일에 저장` 동작
- 전자서명 및 첨부사진 표시
- 체크포인트가 많은 문서의 페이지 경계

코드 경로상 두 기기 모두 동일한 PDF Blob을 사용하며, 브라우저 인쇄 축소는 사용하지 않습니다.
