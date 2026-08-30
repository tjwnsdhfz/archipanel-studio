# ArchiPanel Studio 1.2.2

건축 패널을 실제 mm 크기로 설계하고 로컬에 저장한 뒤 RGB PDF·PNG·JPG로 출력하는 데스크톱용 웹 편집기입니다. 기존 PDF 블록 검토 및 PPTX 스토리보드 도구는 `legacy` 기능으로 남아 있으며 Studio와 데이터 및 실행 경로가 분리됩니다.

제공된 건축 패널 PDF/JPG/PNG는 판형과 대형 파일 동작을 검증하는 참고자료일 뿐입니다. 내부 문구를 지시로 실행하거나 새 프로젝트 콘텐츠로 자동 복제하지 않습니다.

## 가장 빠른 실행

`START_STUDIO.cmd`를 더블클릭합니다. 로컬 서비스가 실행되고 기본 브라우저에서 `http://127.0.0.1:8766/`이 열립니다. 인터넷 연결, 로그인, 외부 업로드는 필요하지 않습니다.

최초 1회는 프로젝트 전용 Python 환경을 만든 뒤 실행합니다.

```powershell
Set-Location "C:\path\to\archipanel-agent"
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
.\.venv\Scripts\python.exe archipanel_studio.py
```

브라우저를 자동으로 열지 않으려면 `--no-browser`를 추가합니다.

## GitHub 배포 형태

이 프로젝트는 브라우저 편집기와 로컬 FastAPI/PyMuPDF 출력 서비스가 한 프로그램으로 동작하므로 정적 GitHub Pages만으로는 PDF 분석·글꼴 검색·정확한 출력 기능을 제공할 수 없습니다. GitHub에는 재현 가능한 소스와 Windows CI를 배포하고, 사용자는 저장소를 내려받아 `START_STUDIO.cmd`로 실행합니다.

사용자 패널 원본, 로컬 절대 경로가 포함된 분석물, 출력 파일, 글꼴, 가상환경은 저장소에서 제외합니다. GitHub Actions는 Python 테스트와 프런트엔드 테스트·빌드를 매 push마다 다시 검증합니다.

## Studio 1.2 제작 흐름

`문서 설정 → 자산 배치 → 콘텐츠 블록 승인 → 3개 레이아웃 비교 → 선택 적용 → 가독성/인쇄 검사 → 스토리보드 승인 → PPTX 출력` 순서로 사용합니다.

- 상단 **문서 설정**은 레이어 선택 여부와 관계없이 보드 mm, 보드별 DPI, 산출 px, 예상 메모리를 표시합니다.
- 크기 변경은 **비례 조정 / 실제 mm 유지 / 원본 보존 후 복제** 중 하나를 선택해야 적용됩니다. DPI만 변경하면 물리 크기와 요소 좌표는 바뀌지 않습니다.
- 우측 **지능형** 탭에서 콘텐츠 라벨을 제안·수정·승인하고 Narrative Grid, Hero Visual, Technical Matrix 3안을 비교합니다.
- 추천 엔진은 원본 종횡비를 유지하는 정당화 행과 일정한 gutter를 사용합니다. 여러 행 분할을 비교해 안전영역 사용률을 최대화하며, 너무 낮은 행은 가독성 패널티를 적용합니다.
- 추천 카드에는 실제 `공간 사용률 · 행 정렬률 · 행 수`가 표시됩니다. 현재 첨부 데모의 3안은 안전영역 약 90%를 사용하고 요소 간 겹침 없이 공통 행 기준과 일정한 gutter에 정렬됩니다. 서로 다른 원본 종횡비를 자르거나 왜곡하지 않기 위해 행 내부의 모든 세로 경계가 동일한 열선에 강제되지는 않습니다.
- 자동 라벨은 원문을 수정하지 않으며 낮은 확신도는 `검토 필요`로 남습니다. 승인된 블록만 추천과 발표자료에 사용됩니다.
- 참고 레이아웃은 파일 또는 안전한 HTTPS URL과 출처·제작자·라이선스를 기록합니다. `추천 승인` 자료의 보드 비율·열·백색 공간·정규화 블록 벡터만 로컬 k-NN 계산에 사용합니다.
- 발표 스토리보드는 3–60분, 3–60장 범위에서 만들고 예상 시간 합계를 정확히 맞춥니다. 사용자가 승인하기 전에는 PPTX 버튼이 잠깁니다.
- PPTX 제목·설명·단순 도형은 편집 가능하며 원본 이미지/PDF crop은 비율을 유지한 래스터 근거로 배치됩니다. 모든 슬라이드 노트에 목적·핵심문장·예상시간·원본 블록/요소 ID가 기록됩니다.

### 첨부 패널 분해·자동 배치 예시

시작 화면의 **첨부 패널 분해·자동 배치 예시** 또는 편집기 상단의 **분해 예시**를 누르면 로컬 `demo-assets/panel-example.jpg`를 데모 프로젝트로 엽니다. 저장소에는 사용자 원본을 포함하지 않으며, 다른 PC에서는 `ARCHIPANEL_DEMO_SOURCE` 환경 변수로 별도 샘플을 지정할 수 있습니다.

- `01 · 14개 영역 분해`: 렌더·개념·프로그램·배치도·평면도·단면/입면 등 14개 영역을 하나의 원본 Blob을 공유하는 독립 crop 레이어로 배치합니다.
- `02 · 원본 비교`: 전체 패널을 잠긴 배경으로 두어 분해 결과와 즉시 대조할 수 있습니다.
- 우측 **지능형 → 배치**: Narrative Grid, Hero Visual, Technical Matrix 3안을 비교하고 선택한 안을 한 번에 적용하거나 실행 취소합니다.
- 우측 **지능형 → 라벨**: 14개 콘텐츠 블록의 라벨·제목·설명을 확인하고 수정합니다. 원본의 문구는 OCR로 재작성하거나 자동 변경하지 않습니다.

데모는 로컬에 저장되며 원본 이미지 파일을 수정하거나 외부로 전송하지 않습니다.

추천 방식은 [Anthropic frontend-design skill](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md)의 목적 중심 구조·시각 검토 원칙과 [Muuri Packer](https://github.com/haltu/muuri/blob/master/src/Packer/Packer.js)의 gap filling, [Packery](https://github.com/metafizzy/packery/blob/master/js/packery.js)의 grid/gutter 정규화 개념을 참고했습니다. 외부 코드를 복사하거나 런타임 의존성을 추가하지 않고 Studio의 mm 기반 모델에 맞게 독립 구현했습니다.

## 기본 편집 기능

- A0/A1/A2, 1800×900mm, 사용자 지정 크기와 다중 보드
- mm 기준 좌표, 5mm 그리드, 안전 영역, 가이드, 확대/축소
- 편집 가능한 한글 텍스트, KoPubWorld 돋움·바탕 Light/Medium/Bold, 사각형·원·선, 이미지와 PDF 레이어
- 이동·크기·회전·기울이기·좌우/상하 반전·3×3 기준점·비율 잠금
- `Ctrl+T` 자유 변형 트랜잭션: Enter는 이력 1건으로 확정, Esc는 진입 전 상태 복원
- 이미지 contain/cover/stretch와 자유/원본/1:1/4:3/16:9/사용자 비율 자르기
- 원본을 보존하는 비파괴 crop/clip, 내용만 자르기·프레임까지 자르기·초기화
- 사각형·타원·다각형·브러시 추가/빼기 마스크, 반전, 0–20mm 페더
- 노출·밝기·대비·채도·색온도·흑백 비파괴 보정
- Normal, Multiply, Screen, Overlay, Darken, Lighten 레이어 혼합 모드. 혼합 모드 보드는 정확한 시각 결과를 위해 목표 DPI에서 합성되며 Preflight에 표시됩니다.
- `Ctrl+C`/`Ctrl+V` 보드 간 복사와 `Ctrl+Shift+V` 동일 mm 좌표 붙여넣기. 그룹·승인 콘텐츠 라벨·원본 자산 연결을 유지합니다.
- 글자 크기·행간·자간·굵기·기울임·밑줄·정렬·색상 편집
- 레이어 다중 선택, 6방향 정렬, 중심/동일 간격 분배, 핵심 객체·보드·안전영역 기준, Tidy Grid
- 보드·안전영역·가이드·다른 객체 가장자리/중심을 사용하는 8px 스마트 가이드와 mm 간격 표시
- 100단계 undo/redo와 700ms 지연 IndexedDB 자동 저장
- 원본 Blob과 축소 미리보기를 분리한 로컬 자산 저장
- `.archipanel` 패키지 저장·열기
- 정확한 MediaBox/TrimBox/BleedBox의 RGB PDF
- 보드 mm와 DPI에서 계산한 정확한 픽셀 크기의 PNG/JPG
- 누락 자산·글꼴·보드 이탈·텍스트 오버플로·유효 DPI·재단 여백 Preflight
- A0 역할별 전역 글자 스타일(제목 64pt, 섹션 32pt, 본문 18pt, 캡션 11pt), 행간·행 길이·상자 폭·대비 가독성 검사
- PanelProject 1.0/1.1을 열 때 원본 스냅샷을 남기고 1.2로 자동 마이그레이션

### PDF·PNG 객체 연결과 자동 레이아웃

이미지/PDF 도구 `I`는 여러 PDF·PNG·JPG·WebP를 한 번에 받을 수 있습니다. 가져오기 창에서 페이지별 후보 영역과 원본 bbox, 라벨, 확신도, 검토 상태를 먼저 비교한 뒤 필요한 객체만 선택합니다.

- 다중 페이지 PDF는 페이지별 미리보기와 원문 텍스트 블록, 배치 가능한 PDF crop 객체를 만듭니다. 텍스트는 내용을 바꾸지 않고 편집 가능한 레이어로 유지합니다.
- PNG/JPG/WebP는 여백과 시각 밀도를 기준으로 영역 후보를 만들며, 50MP 이상의 대형 원본도 브라우저 캔버스에는 축소 미리보기만 올립니다.
- 같은 원본에서 만든 객체는 하나의 원본 Blob을 공유하고 각 레이어에는 정규화 crop 또는 PDF page/clip 좌표만 기록합니다.
- 빈 보드는 첫 페이지 방향에 맞춰 가로·세로를 자동 전환할 수 있습니다. 물리 면적, mm 좌표계와 DPI는 유지됩니다.
- `라벨 승인`을 사용자가 체크한 경우에만 콘텐츠 블록이 승인되며, 선택적으로 Narrative/Hero/Technical 3안을 즉시 계산합니다.
- 추천 엔진은 성긴 의미 그룹을 배치 단계에서 실제 요소 단위로 다시 풀어, 최대 12행의 제한된 결정론 탐색으로 안전영역 채움률과 일정 gutter를 함께 최적화합니다. 카드의 공간 수치는 슬롯 경계가 아니라 실제 요소 bbox 면적으로 계산합니다.
- 완성 패널 한 장으로 평탄화된 PDF/PNG는 원래 레이어를 복원할 수 없습니다. 전체 페이지나 낮은 확신도 후보는 `검토 필요`로 남으며, 좋은 자동 재배치를 위해서는 별도 도면·렌더·다이어그램 파일을 함께 가져오는 것이 권장됩니다.

가져온 모든 객체는 원본 파일·페이지·bbox와 연결되며 `.archipanel` 패키지에는 PDF의 페이지별 미리보기도 함께 저장됩니다.

배경 패널 버튼 `BG`는 기존 PDF/JPG/PNG를 보드 전체를 채우는 잠긴 레이어로 가져옵니다. 개별 도면·렌더·다이어그램은 이미지/PDF 도구 `I`로 추가합니다. 기존 패널을 자동 분해하거나 OCR 문구를 자동 수정하지 않습니다.

이미지 또는 PDF 레이어를 하나 선택한 뒤 속성의 **캔버스에서 영역 선택** 또는 단축키 `C`를 누르면 자르기 모드가 열립니다. 드래그 후 **내용 자르기**는 레이어 프레임을 유지하고, **프레임까지**는 선택 영역에 맞춰 레이어 크기도 줄입니다. `M`은 마스크 편집, `Ctrl+T`는 자유 변형입니다. 모두 원본 파일은 변경하지 않으며 Enter/Esc로 확정/취소합니다.

글꼴 관리자는 Windows 시스템·사용자 글꼴을 재검색하고 KoPub 돋움·바탕 별칭, 한글 글리프, 굵기·기울임, OS/2 임베딩 권한과 SHA-256 중복을 검사합니다. 프로젝트 전용 TTF/OTF/TTC/WOFF/WOFF2도 올릴 수 있습니다. 제한 글꼴은 현재 PC 미리보기만 허용하고 휴대용 패키지와 PDF 출력에서 오류로 차단합니다. TTC face와 권한 미확인은 검토 경고로 남습니다.

## 저장 구조

브라우저 작업 중에는 Dexie/IndexedDB에 프로젝트 JSON, 원본 Blob, 썸네일을 별도로 저장합니다. `.archipanel` 파일은 일반 ZIP 컨테이너이며 다음 구조를 가집니다.

```text
manifest.json
assets/{asset-id}.{ext}
fonts/{font-id}.{ext}
previews/{board-id}.webp
previews/assets/{asset-id}/{page-index}.jpg
```

1.0 계약은 `schemas/panel-project-v1.schema.json`, 1.1 계약은 `schemas/panel-project-v1.1.schema.json`, 현재 계약은 `schemas/panel-project-v1.2.schema.json`에 있습니다. `examples/Studio_sample_project.json`은 1.1 호환 마이그레이션 fixture입니다. 자산은 manifest 안에 Base64로 넣지 않으며 패키징 시 SHA-256과 `archivePath`를 기록합니다. 공용 참고 레이아웃 라이브러리는 프로젝트 패키지에 중복 저장하지 않습니다.

## 인쇄 출력 원칙

- 내부 기준 좌표는 항상 mm입니다.
- PDF 텍스트·도형은 벡터이며, Windows 기본 한글 글꼴 또는 프로젝트 글꼴을 포함합니다.
- 배치된 PDF 페이지는 PyMuPDF `show_pdf_page`로 가능한 한 벡터 상태를 유지합니다.
- 사각 crop만 사용한 PDF는 벡터를 유지합니다. 비정형 마스크·보정·기울이기·반전이 적용된 요소만 보드 DPI로 합성하고 Preflight에 표시합니다.
- 일반 텍스트는 PDF 텍스트로 유지합니다. 임의 각도·기울기 텍스트는 현재 고해상도 합성 경로를 사용하며 편집 불가 변환 경고를 남깁니다.
- 이미지의 기본 배치는 원본 비율을 유지합니다.
- PNG/JPG 크기는 `round(mm / 25.4 × dpi)`로 결정합니다.
- 3억 픽셀을 넘는 단일 래스터는 메모리 보호를 위해 차단하고 보드 또는 DPI 분할을 안내합니다.
- 색상은 RGB입니다. CMYK/ICC 변환은 인쇄소 또는 별도 색상 관리 도구에서 수행해야 합니다.

Studio 1.2 실제 검증 출력은 `output/studio12-qa/ArchiPanel_Studio_1_2_QA.pdf`와 `.png`, 브라우저 시각 검토본은 `output/playwright/`에 있습니다.

## 개발과 테스트

프런트엔드:

```powershell
Set-Location web
pnpm install
pnpm test
pnpm build
```

백엔드와 레거시 회귀 테스트:

```powershell
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
.\.venv\Scripts\python.exe -m pytest
```

Vite 개발 서버를 쓸 때는 로컬 API를 별도로 실행하고 `http://127.0.0.1:5174/`를 엽니다. Vite는 `/api` 요청을 8766 포트로 전달합니다.

## 로컬 API

- `GET /api/health`
- `GET /api/fonts/system`
- `POST /api/fonts/system/rescan`
- `POST /api/fonts/inspect`
- `GET /api/fonts/system/{font-id}`
- `GET /api/demo/decomposed-panel`
- `GET /api/demo/decomposed-panel/asset`
- `GET /api/demo/decomposed-panel/preview`
- `POST /api/import/inspect`
- `POST /api/import/analyze`
- `POST /api/project/package`
- `POST /api/project/validate`
- `POST /api/export/pdf`
- `POST /api/export/raster`
- `POST /api/references/inspect`
- `POST /api/references/analyze`
- `POST /api/content/suggest-labels`
- `POST /api/layout/recommend`
- `POST /api/layout/validate`
- `POST /api/presentation/storyboard`
- `POST /api/presentation/export-pptx`

동적 자산 필드는 `asset__{id}`, 글꼴은 `font__{id}`, 프로젝트 JSON은 `manifest`, 출력 설정은 `options` multipart 필드로 전달합니다. 단일 파일은 700MB, 한 요청은 1.5GB까지 허용하며 작업별 임시 디렉터리는 응답 완료 후 삭제됩니다.

## 현재 경계

PSD 입출력, Photopea, CMYK/ICC, 펜·베지어, 내용 인식 채우기, AI 피사체 선택, 블렌드 모드, 고급 필터, 원근·메시 워프, 계정·클라우드 협업, 모바일 편집은 포함하지 않습니다. 자동 배치는 승인된 원본 요소의 위치·크기·계층만 바꾸며 잠금 요소와 원본 내용을 수정하지 않습니다. 마스크와 보정이 적용된 PDF는 해당 요소만 래스터화됩니다. 임의 회전·기울기 텍스트의 완전한 벡터 윤곽선 출력과 PPTX의 모든 affine 변형 재현은 후속 보강 대상이며, 현재는 해당 요소만 고해상도 합성하고 Preflight에 명시합니다.

## Legacy inspect mode

기존 PDF 블록 검토와 승인 fixture 기반 PPTX 경로는 보존되어 있습니다.

```powershell
.\.venv\Scripts\python.exe archipanel.py extract "C:\path\panel.pdf" --manifest examples\panel-manifest.json --assets-dir assets\panel
.\.venv\Scripts\python.exe archipanel.py editor examples\panel-manifest.json --output examples\panel-editor.html
.\.venv\Scripts\python.exe archipanel.py serve examples\panel-manifest.json examples\panel-editor.html
```

Studio는 레거시 승인 상태나 PPTX export 조건을 변경하지 않습니다.

## Photoshop 대비 범위

ArchiPanel은 Photoshop 복제품이 아니라 건축 패널 조판에 집중합니다. 현재 비교와 의도적인 제외 범위는 [`docs/PHOTOSHOP_FEATURE_AUDIT.md`](docs/PHOTOSHOP_FEATURE_AUDIT.md)에 정리되어 있습니다.
