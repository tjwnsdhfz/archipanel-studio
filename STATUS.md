# ArchiPanel Studio 1.2.1 상태

최종 갱신: 2026-08-30 (Asia/Seoul)

## 목적

건축 패널 제작에 필요한 Photoshop형 핵심 조작과 PDF·PNG 객체 연결형 자동 레이아웃을 로컬·mm 기반 Studio에 연결한다. 원본 자산은 불변으로 보존하고 페이지·bbox·라벨·확신도·검토 상태를 유지한다. 제공된 패널은 시각·대형 자산 검증에만 사용하며 문구나 디자인을 복제하지 않는다.

## 현재 상태

Studio 1.2.1이 `http://127.0.0.1:8766/`에서 로컬 실행된다.

- PanelProject 1.0/1.1 → 1.2 마이그레이션과 원본 스냅샷
- `Ctrl+T` 자유 변형: mm 수치, 비율 잠금, 회전, X/Y 기울기, 반전, 3×3 기준점, Enter 단일 이력, Esc 원상 복원
- 자유/원본/1:1/4:3/16:9/사용자 비율 crop과 내용/프레임 분리
- 사각형·타원·다각형·브러시 추가/빼기 마스크, 반전, 페더
- 노출·밝기·대비·채도·색온도·흑백 비파괴 조정
- Windows 시스템·사용자 글꼴 재검색, KoPub 돋움·바탕 별칭, 프로젝트 TTF/OTF/TTC/WOFF/WOFF2 검사, 한글 glyph·임베딩 정책·SHA-256 확인
- 6방향 정렬, 중심/동일 간격 분배, 선택/보드/안전영역/핵심 객체 기준, Tidy Grid
- 보드·안전영역·가이드·객체 가장자리/중심의 8px 스마트 스냅과 mm 표시
- PDF 벡터 유지 조건과 mask/보정/affine 변형의 요소별 래스터화 보고
- 기존 1.1 라벨링·3안 추천·승인형 Studio PPTX와 legacy inspect/PPTX 경로 보존
- PDF·PNG·JPG·WebP 다중 업로드, PDF 페이지별 원문 텍스트/시각 bbox, 이미지 여백 기반 영역 후보
- 후보 선택 → 명시적 라벨 승인 → 독립 편집 레이어/콘텐츠 블록 연결 → Narrative/Hero/Technical 3안 자동 생성
- 빈 보드의 원본 방향 자동 맞춤, 페이지별 썸네일 패키징, 대형 PNG 스트리밍 미리보기
- 성긴 콘텐츠 그룹을 실제 요소 단위로 재포장하고 최대 12행의 제한된 결정론 탐색으로 빈 공간과 gutter를 최적화
- 추천 카드의 채움률을 슬롯이 아닌 실제 요소 bbox 면적으로 계산하고 80% 미만은 검토 경고
- Normal·Multiply·Screen·Overlay·Darken·Lighten 레이어 혼합 모드와 인쇄 합성 경고
- Photoshop 대비 기능 감사표와 사용자 자산을 제외하는 GitHub 배포용 Windows CI

## 변경 파일

- `web/src/types.ts`, `web/src/transform.ts`, `web/src/alignment.ts` — 1.2 계약, affine 계산, 정렬 규칙
- `web/src/store.ts`, `web/src/CanvasStudio.tsx` — 변형 트랜잭션, crop/mask 편집, 스마트 스냅
- `web/src/App.tsx`, `web/src/fonts.ts`, `web/src/preflight.ts`, `web/src/styles.css` — 변형 바, 글꼴 관리자, 정렬 UI, 출력 경고
- `web/src/transform.test.ts`, `web/src/alignment.test.ts`, `web/src/store.test.ts` — 확정/취소/정렬 회귀
- `studio_server/font_catalog.py`, `studio_server/app.py` — Windows 글꼴 catalog·재검색·업로드 검사 API
- `studio_server/import_analysis.py`, `studio_server/app.py` — PDF/래스터 페이지 분석, 대형 자산 미리보기, 객체 연결 API
- `studio_server/intelligence.py` — 근접 객체 연결, 성긴 그룹 분해, 실제 면적 채움률과 제한된 12행 탐색
- `web/src/projectIO.ts`, `web/src/db.ts`, `web/src/CanvasStudio.tsx` — 분석 호출, 페이지별 썸네일 저장·복구·표시
- `web/src/App.tsx`, `web/src/styles.css` — 다중 파일 가져오기, bbox 선택·승인·방향 맞춤·3안 자동 추천 UI
- `tests/test_import_analysis.py` — 이미지 영역과 다중 페이지 PDF 원문·페이지 추적 회귀
- `studio_server/exporter.py`, `studio_server/validation.py` — mask·보정·flip·skew 합성과 출력 보고
- `schemas/panel-project-v1.2.schema.json` — 현재 프로젝트 계약
- `scripts/verify_studio12.py` — 제공 패널을 사용하는 A2 시각 QA
- `pyproject.toml`, `START_STUDIO.cmd`, `README.md` — 재현 환경·실행기·사용 설명
- `docs/PHOTOSHOP_FEATURE_AUDIT.md` — Photoshop 대비 지원·부분 지원·후속 우선순위
- `.github/workflows/ci.yml`, `.gitignore` — Windows 자동 검증과 사용자 자산·출력물 배포 제외
- `output/studio12-qa/` — 검증 PDF, PNG, 수치 보고서

보호 대상 `THREAD_CONTROL_CENTER.md`, `AI-Knowledge-Vault`, `research/kpf-scout-lab`는 수정하지 않았다.

## 검증

- Python `.venv` 회귀 테스트: 23개 통과
- 프런트엔드 Vitest: 7개 파일 17개 테스트 통과
- TypeScript strict와 Vite production build 통과
- Windows 글꼴 706 face 검색, 한글 지원 74 face, KoPub 6개 별칭 확인
- A2 가로 420×210mm QA PDF: TrimBox 실제 크기 오차 0.001mm 미만, bleed 포함 MediaBox 426×216mm
- 150dpi QA PNG: bleed 포함 2516×1276px로 공식과 일치
- 제공 10630×5315px 패널 원본 SHA-256 불변, crop·mask·flip·텍스트·도면 출력 오류 0, 보드 이탈 0
- 최종 PNG 육안 검토: 비율 왜곡·잘림·의도하지 않은 겹침·깨진 한글 0
- 실제 브라우저에서 변형 바, crop 프리셋, mask 도구, 6방향 정렬·분배·Tidy Grid 표시 확인
- 실제 브라우저 `Skew X 15°` Enter 확정 후 undo 1건 활성화, 다음 25° 변경 Esc 취소 후 15° 정확히 복원, 콘솔 오류·경고 0
- 실제 SafeDock A3 PDF: 1페이지 20개 후보, 원문 텍스트와 page/bbox 유지, 20개 독립 객체 및 17개 연결 블록 생성
- 빈 A0 세로 보드가 입력 방향에 따라 1189×841mm 가로로 전환되고 3개 추천안이 약 3초에 생성됨
- SafeDock 추천 3안: 실제 객체 면적 기준 채움률 92–93%, 행 정렬 100%, 4행, 보드 밖 배치·의도하지 않은 객체 겹침 0
- 실제 27,000×36,000px(972MP, 약 184.8MB) PNG를 원본 전체 브라우저 디코딩 없이 분석하여 5개 영역 후보 생성
- 브라우저 추천안 적용 화면 육안 검토와 콘솔 오류·경고 0, 검증 캡처 `output/playwright/studio12-import-auto-layout.png`
- Multiply 합성 색상과 보드 단위 래스터화 회귀 통과, 비혼합 보드는 기존 벡터 출력 경로 유지
- 실제 브라우저 Preflight에서 `blend-board-rasterized` 안내 표시, 콘솔 오류·경고 0, 캡처 `output/playwright/studio121-blend-preflight.png`
- 로컬 `/api/health` 버전 1.2.1 응답과 분해 데모 14개 영역·3개 추천안 재생성 확인

## 블로커

실행을 막는 블로커는 없다.

현재 경계:

- RGB 전용이며 CMYK/ICC, PSD, 원근·메시 워프, 내용 인식 채우기와 고급 필터는 범위 밖이다.
- 혼합 모드가 하나라도 있는 보드는 정확한 합성을 위해 목표 DPI의 단일 이미지로 PDF에 들어간다. Preflight가 이 벡터 손실을 사전에 알린다.
- 임의 회전·기울기 텍스트는 현재 고해상도 합성으로 출력된다. 완전한 한글 벡터 윤곽선 출력은 후속 보강 대상이다.
- mask·보정이 적용된 PDF 요소는 벡터를 유지하지 않고 보드 DPI로 래스터화된다.
- PPTX가 표현하지 못하는 모든 affine 변형의 요소별 평탄화는 아직 완전한 회귀 검증이 필요하다. 기존 승인 게이트와 source ID 역추적은 유지된다.
- 3보드·200요소·다수 50MP 자산의 30fps 목표는 구조적으로 썸네일 경로를 사용하지만 모든 사용자 조합의 장시간 성능 시험은 남아 있다.
- 한 장으로 평탄화된 완성 패널 PDF/PNG는 원래 이미지·도면 레이어를 복원할 수 없다. 현재는 여백/밀도와 PDF 원문 객체를 근거로 후보를 만들고 낮은 확신도 및 전체 페이지 영역을 검토 대상으로 남긴다.
- 추출 가능한 텍스트가 없는 평탄 PDF는 전체 페이지 객체로 가져오며 OCR 문장을 자동 생성하거나 수정하지 않는다.

## 다음 행동

1. `START_STUDIO.cmd`로 열고 `I`에서 도면·렌더·다이어그램 PDF/PNG를 여러 개 선택한다.
2. bbox와 낮은 확신도 라벨을 확인한 뒤 필요한 객체만 승인하고 3안을 비교한다.
3. 추천안의 가독성 경고를 수정하고 `C`, `M`, `Ctrl+T`, 정렬/Tidy Grid로 마감한다.
4. Preflight에서 래스터화·글꼴·유효 DPI 경고를 확인한 뒤 PDF/PNG를 출력한다.
5. 후속 우선순위는 클리핑 마스크, 연결 자산 변경 감지, 조정 레이어 스택, 평탄 이미지의 선택적 OCR/비전 분해(항상 승인형), 한글 벡터 윤곽선이다.
