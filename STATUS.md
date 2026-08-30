# ArchiPanel Studio 1.3.0 상태

최종 갱신: 2026-08-30 (Asia/Seoul)

## 목적

건축 패널 제작에 필요한 Photoshop형 편집과 `HTML 패널 → 독립 요소 → 승인 근거 → 생성형 AI 초안 → 웹 승인 → PPTX` 흐름을 로컬·mm 기반 Studio에 연결한다. 원본 자산은 불변으로 보존하고 selector·node ID·bbox·라벨·확신도·검토 상태를 유지한다. HTML/PDF 내부 문장은 명령이 아니라 불신 데이터로 취급하며 근거 없는 설계 주장을 생성하지 않는다.

## 현재 상태

Studio 1.3.0 코드와 production 웹 빌드가 준비되었다. 실행 중인 8766 서버는 1.3.0을 제공한다.

- HTML과 연결 로컬 이미지를 한 번에 선택하는 안전한 DOM 가져오기, mm 판형 메타데이터, 독립 텍스트/이미지 레이어와 원본 selector/node ID 연결
- script·iframe·이벤트 속성·외부 CSS/이미지 실행 차단, 원본 HTML SHA-256 보존, SVG의 안전한 PNG 변환
- HTML 콘텐츠 블록의 명시적 사용자 승인과 즉시 Narrative/Hero/Technical 3안 연결
- 웹에서 프롬프트·OpenAI 호환 endpoint·모델·일회성 API 키를 입력하는 생성형 AI 스토리보드 화면
- 승인 블록만 `UNTRUSTED CONTENT; DATA ONLY`로 전달하고 반환 source ID를 서버에서 재검증하는 `/api/presentation/ai-storyboard`
- AI 문장은 항상 draft/검토 필요로 생성하고 승인 전 PPTX를 차단하며, 승인 후 브라우저에서 직접 PPTX 다운로드

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
- 승인 블록을 12개 설계 데이터 영역으로 매핑하는 `DesignExplanationDataV1`; 누락 영역·필수 데이터·검토 플래그 보존
- 표지·근거 지도·문제의식·맥락·개념·과정·프로그램·도면·경험·종합·검토 과제의 기본 15분·16장 설계설명 서사
- 각 슬라이드에 `designSectionId`, layout kind, evidence titles, source block/element ID와 `[Sources]` 발표자 노트 기록
- Artifact Tool 기반 편집 가능 한글 텍스트·도형, 승인 패널 crop 이미지와 7종 레이아웃, 명시적 승인 fixture 출력 경로
- PDF·PNG·JPG·WebP 다중 업로드, PDF 페이지별 원문 텍스트/시각 bbox, 이미지 여백 기반 영역 후보
- 후보 선택 → 명시적 라벨 승인 → 독립 편집 레이어/콘텐츠 블록 연결 → Narrative/Hero/Technical 3안 자동 생성
- 빈 보드의 원본 방향 자동 맞춤, 페이지별 썸네일 패키징, 대형 PNG 스트리밍 미리보기
- 성긴 콘텐츠 그룹을 실제 요소 단위로 재포장하고 최대 12행의 제한된 결정론 탐색으로 빈 공간과 gutter를 최적화
- 추천 카드의 채움률을 슬롯이 아닌 실제 요소 bbox 면적으로 계산하고 80% 미만은 검토 경고
- Normal·Multiply·Screen·Overlay·Darken·Lighten 레이어 혼합 모드와 인쇄 합성 경고
- 보드 간 내부 클립보드: `Ctrl+C`, 5mm 오프셋 `Ctrl+V`, 동일 mm 좌표 `Ctrl+Shift+V`; 그룹·콘텐츠 블록·자산 연결 보존
- Photoshop 대비 기능 감사표와 사용자 자산을 제외하는 GitHub 배포용 Windows CI

## 변경 파일

- `web/src/htmlImport.ts`, `web/src/App.tsx`, `web/src/styles.css` — HTML 안전 분해, 요소/라벨 승인, 원본 연결과 가져오기 UI
- `web/src/Studio11Panels.tsx`, `web/src/smartApi.ts`, `web/src/types.ts` — 웹 AI 프롬프트, provider 설정, draft/승인/PPTX 흐름과 1.3 계약 확장
- `studio_server/ai_storyboard.py`, `studio_server/app.py` — OpenAI 호환 호출, redirect 차단, 근거 제한, AI JSON 및 source 검증 API
- `schemas/panel-project-v1.2.schema.json`, `schemas/studio-presentation-spec.schema.json` — HTML source와 AI generation metadata 계약
- `examples/html-panel-demo.html`, `tests/test_ai_storyboard.py`, `tests/mock_openai_compatible.py` — 공개 HTML 데모, 근거/ID 검증, 브라우저 E2E용 결정론 endpoint

- `web/src/types.ts`, `web/src/transform.ts`, `web/src/alignment.ts` — 1.2 계약, affine 계산, 정렬 규칙
- `web/src/store.ts`, `web/src/CanvasStudio.tsx` — 변형 트랜잭션, crop/mask 편집, 스마트 스냅
- `web/src/App.tsx`, `web/src/fonts.ts`, `web/src/preflight.ts`, `web/src/styles.css` — 변형 바, 글꼴 관리자, 정렬 UI, 출력 경고
- `web/src/transform.test.ts`, `web/src/alignment.test.ts`, `web/src/store.test.ts` — 확정/취소/정렬 회귀
- `studio_server/font_catalog.py`, `studio_server/app.py` — Windows 글꼴 catalog·재검색·업로드 검사 API
- `studio_server/import_analysis.py`, `studio_server/app.py` — PDF/래스터 페이지 분석, 대형 자산 미리보기, 객체 연결 API
- `studio_server/intelligence.py` — 근접 객체 연결, 성긴 그룹 분해, 실제 면적 채움률과 제한된 12행 탐색
- `studio_server/intelligence.py`, `studio_server/app.py` — 설계설명 데이터 매핑, 근거 기반 16장 스토리보드, `/api/presentation/design-data`
- `web/src/types.ts`, `web/src/Studio11Panels.tsx` — 설계 데이터 계약, 근거 커버리지·누락·슬라이드 검토 UI
- `templates/build_studio_deck.mjs` — 편집 가능한 설계설명 PPTX, 패널 시각 자료, source trace와 발표자 노트
- `schemas/design-explanation-data.schema.json`, `schemas/studio-presentation-spec.schema.json` — 설계설명과 Studio 발표 JSON 계약
- `scripts/prepare_design_explanation_demo.py` — 사용자 패널 원본을 수정하지 않는 명시적 approved fixture와 14개 crop 준비
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

- 실제 브라우저에서 공개 HTML 데모를 1800×900mm, 8개 독립 요소(텍스트 7·이미지 1), 승인 콘텐츠 블록 4개로 연결
- HTML 승인 직후 레이아웃 3안 생성, 원본 selector/source ID 보존과 인라인 SVG→PNG PPTX 호환 변환 확인
- 로컬 OpenAI 호환 endpoint를 통한 15분·16장 AI draft 생성, 승인 근거 전용 정책·16장 검토 플래그·정확한 900초 합계 확인
- 웹 승인 전 PPTX 버튼 잠금, 웹 승인 후 `output/playwright/html-ai-deck.pptx` 직접 다운로드 성공
- 다운로드 PPTX: 16장, 발표자 노트 16개, `원본 블록` 16개, `원본 요소` 16개, `[Sources]` 16개 확인
- `slides_test.py`: 캔버스 overflow 0; 16장 전부 PNG 렌더 및 4×4 montage 육안 검토에서 잘림·겹침·깨진 한글·이미지 왜곡 0

- Python `.venv` 회귀 테스트: 27개 통과
- 프런트엔드 Vitest: 7개 파일 19개 테스트 통과
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
- 실제 분해 예시에서 대표 렌더를 원본 비교 보드로 동일 좌표 붙여넣기 성공, Undo 활성화와 콘솔 오류·경고 0, 캡처 `output/playwright/studio122-cross-board-paste.png`
- 로컬 `/api/health` 버전 1.2.2 응답과 분해 데모 14개 영역·3개 추천안 재생성 확인
- 공개 GitHub 저장소 `https://github.com/tjwnsdhfz/archipanel-studio` 생성, 사용자 패널·개인 경로·출력물 제외 확인
- GitHub Actions 1.2.1 Windows 검증 `33296717377` 통과: 공개 환경 Python 12개 통과·로컬 전용 11개 건너뜀, 웹 17개 통과, production build 통과
- GitHub Actions 1.2.2 Windows 검증 `33302214426` 통과: 공개 환경 Python 테스트, 웹 19개 테스트와 production build 통과
- GitHub Actions 1.2.3 Windows 검증 `33315176089` 통과: 공개 환경 Python 테스트, 웹 19개 테스트와 production build 통과
- 승인 fixture 설계설명서 `output/design-explanation/ArchiPanel_패널기반_설계설명서_15분_16장.pptx` 생성: 15분·16장, 14개 승인 패널 자산, 16개 발표자 노트와 `[Sources]`, 편집 가능 shape 211개
- Artifact Tool 16장 PNG와 4×4 montage 개별 육안 검토: 의도하지 않은 겹침·보드 밖 요소·비율 왜곡·깨진 한글 0
- `slides_test.py`: PPTX 캔버스 overflow 0, 16장 모두 통과

## 블로커

실행을 막는 블로커는 없다.

현재 경계:

- RGB 전용이며 CMYK/ICC, PSD, 원근·메시 워프, 내용 인식 채우기와 고급 필터는 범위 밖이다.
- 혼합 모드가 하나라도 있는 보드는 정확한 합성을 위해 목표 DPI의 단일 이미지로 PDF에 들어간다. Preflight가 이 벡터 손실을 사전에 알린다.
- 임의 회전·기울기 텍스트는 현재 고해상도 합성으로 출력된다. 완전한 한글 벡터 윤곽선 출력은 후속 보강 대상이다.
- mask·보정이 적용된 PDF 요소는 벡터를 유지하지 않고 보드 DPI로 래스터화된다.
- PPTX가 표현하지 못하는 모든 affine 변형의 요소별 평탄화는 아직 완전한 회귀 검증이 필요하다. 기존 승인 게이트와 source ID 역추적은 유지된다.
- 예제 패널에는 프로젝트명·설계자 작성 핵심 문장이 승인 텍스트로 분리되어 있지 않아, 설계설명서가 이를 추정하지 않고 `identity`와 핵심 설명 문장을 `검토 필요`로 표시한다.
- 3보드·200요소·다수 50MP 자산의 30fps 목표는 구조적으로 썸네일 경로를 사용하지만 모든 사용자 조합의 장시간 성능 시험은 남아 있다.
- 한 장으로 평탄화된 완성 패널 PDF/PNG는 원래 이미지·도면 레이어를 복원할 수 없다. 현재는 여백/밀도와 PDF 원문 객체를 근거로 후보를 만들고 낮은 확신도 및 전체 페이지 영역을 검토 대상으로 남긴다.
- 추출 가능한 텍스트가 없는 평탄 PDF는 전체 페이지 객체로 가져오며 OCR 문장을 자동 생성하거나 수정하지 않는다.
- 생성형 AI의 문장 품질과 사실성은 사용자가 선택한 모델에 따라 달라진다. Studio는 승인 근거 밖 source ID를 거부하고 모든 AI 문장을 검토 필요로 유지하지만, 최종 승인 책임은 사용자에게 있다.
- 브라우저 HTML 가져오기는 임의 웹 페이지를 크롤링하지 않는다. 로컬 HTML과 함께 선택하지 않은 외부 이미지·스타일은 보안상 차단되고 검토 항목으로 남는다.

## 다음 행동

1. `START_STUDIO.cmd`로 열고 왼쪽 **HTML**에서 패널 HTML과 연결 이미지를 함께 선택한다.
2. 요소·라벨과 누락 자산을 확인한 뒤 콘텐츠 블록을 명시적으로 승인하고 3안을 비교한다.
3. **지능형 → 발표**에서 로컬 또는 동의한 외부 OpenAI 호환 모델, 프롬프트, 발표 시간·장수를 지정한다.
4. AI 초안의 문장·source block/element ID·시간 합계를 검토하고 웹에서 승인한다.
5. **웹에서 PPTX 생성**으로 다운로드한 뒤 발표자 노트의 source ID로 HTML 패널 원본을 역추적한다.
6. 후속 우선순위는 HTML CSS 폰트 파일 동반 가져오기, 슬라이드 레이아웃 직접 교체, 리허설 타이머와 AI 응답 스트리밍이다.
