# Photoshop 대비 건축 패널 기능 점검

점검일: 2026-08-30

ArchiPanel Studio는 Photoshop 전체를 재현하지 않고, 건축 패널의 `mm 문서 설정 → 자산 배치 → 조판 → 인쇄 검사 → 발표자료` 흐름을 우선한다. 비교 기준은 Adobe 공식 문서의 비파괴 Smart Object, 레이어 마스크, 선택 도구, 가이드·그리드·스마트 가이드, Artboard 작업 방식이다.

## 현재 대응 상태

| Photoshop 작업 | ArchiPanel Studio | 상태 |
|---|---|---|
| 문서 크기·해상도 | 보드별 mm, bleed, 안전 여백, 72–1200dpi, 산출 px | 구현 |
| Artboard | 다중 보드, 복제, 이름·순서·크기 변경 | 구현 |
| Place/Smart Object | 원본 Blob 보존, PDF page/clip, 이미지 crop, 자산 교체 기반 구조 | 구현 |
| Free Transform | Ctrl+T, 이동·크기·회전·기울이기·반전·기준점 | 구현 |
| Crop | 원본을 삭제하지 않는 frame/content crop | 구현 |
| Layer Mask | 사각·타원·다각형·브러시 add/subtract, invert, feather | 구현 |
| Image Adjustments | 노출·밝기·대비·채도·색온도·흑백 | 구현 |
| Align/Distribute | 6방향 정렬, 동일 간격, 핵심 객체, Tidy Grid | 구현 |
| Guides/Grid/Smart Guides | mm 가이드, 안전영역, 8px 스냅, 거리 표시 | 구현 |
| Typography | Windows·프로젝트 글꼴, KoPub, 한글 glyph·임베딩 검사 | 구현 |
| Blend Modes | Normal, Multiply, Screen, Overlay, Darken, Lighten | 1.2.1 구현 |
| Layer Groups | 그룹·해제와 다중 변형 | 구현 |
| Selection tools | 객체 다중 선택과 mask polygon/brush | 부분 구현 |
| Linked Smart Object | 동일 Blob 공유·SHA 중복 검사는 지원, 외부 파일 변경 자동 갱신은 미지원 | 부분 구현 |
| Adjustment Layer/Smart Filter stack | 요소별 비파괴 보정은 지원, 순서 변경 가능한 필터 스택은 미지원 | 부분 구현 |
| Clipping Mask | crop/mask로 대체, 상하 레이어 기반 clipping chain은 미지원 | 미지원 |
| Channels/alpha selection | 프로젝트 mask로 저장하지만 독립 Channels 패널은 미지원 | 미지원 |
| Pen/Bezier/path text | 없음 | 범위 밖 |
| Content-aware/Generative Fill | 없음 | 범위 밖 |
| PSD/PSB·CMYK/ICC | 없음 | 범위 밖 |
| Perspective/Mesh Warp | 없음 | 범위 밖 |

## 1.2.1에서 추가한 혼합 모드

- `Multiply`: 흰 배경의 선도·스캔 도면을 재질이나 배경 위에 겹칠 때 사용한다.
- `Screen`: 검은 배경의 빛·선·다이어그램을 밝게 합성한다.
- `Overlay`: 재질과 명암을 강조한다.
- `Darken/Lighten`: 두 레이어에서 더 어둡거나 밝은 픽셀을 선택한다.
- 브라우저 미리보기는 Fabric/Canvas 합성 모드를 사용한다.
- PDF는 혼합 모드가 있는 보드만 목표 DPI의 RGB 이미지로 합성한다. 해당 보드의 텍스트와 PDF 벡터가 평탄화된다는 사실을 Preflight에서 표시한다.
- 혼합 모드가 없는 보드는 기존처럼 텍스트·도형·PDF를 가능한 한 벡터로 유지한다.

## 다음 우선순위

1. 레이어 기반 Clipping Mask와 mask 링크/해제
2. 자산 재연결 및 파일 변경 감지형 Linked Asset
3. 조정 효과의 순서를 바꾸는 비파괴 filter stack
4. 선택 영역 저장·불러오기와 mask 썸네일
5. 패널 컴포넌트와 Layer Comp 형태의 버전 비교

## GitHub 유사 프로젝트 비교 · 2026-08-30

건축 패널 제작에만 집중한 성숙한 오픈소스 편집기는 검색 결과에서 확인하지 못했다. 대신 범용 디자인 편집기의 반복되는 작업 패턴을 비교했다.

- [YFT Design](https://github.com/dromara/yft-design) — Fabric.js 기반 포스터 편집, PDF/PSD 분석, 눈금자와 가이드 구조
- [Vue Fabric Editor](https://github.com/ikuaitu/vue-fabric-editor) — 사용자 글꼴·자산·템플릿·단축키를 플러그인형으로 제공
- [Suika](https://github.com/F-star/suika) — 여러 캔버스 사이 복사·붙여넣기, 정렬, 레이어, 그룹, 눈금자와 JSON/SVG 입출력
- [Excalidraw](https://github.com/excalidraw/excalidraw) — 공개 JSON 형식, 이미지·클립보드 출력, Undo/Redo

Studio는 mm/DPI 인쇄 계약, PDF 원본 벡터 유지, 승인 콘텐츠 라벨과 PPTX 역추적에서 건축 패널에 특화되어 있다. 반면 다중 보드 사이 재사용 동선이 약했다. 이에 1.2.2에서 내부 보드 클립보드를 추가했다. 복사한 요소는 새 ID를 받고 원본 자산 참조, crop/mask/변형, 완전 선택된 그룹, 승인된 콘텐츠 블록 관계를 유지한다. `Ctrl+V`는 5mm 간격으로 붙이고 `Ctrl+Shift+V`는 다른 보드에서도 원래 mm 좌표를 유지한다. 모든 붙여넣기는 하나의 Undo 명령이다.

## 공식 비교 자료

- [Adobe Smart Objects](https://helpx.adobe.com/photoshop/desktop/create-manage-layers/smart-objects/smart-objects-overview-and-benefits.html)
- [Adobe Layer Masks](https://helpx.adobe.com/photoshop/desktop/create-masks/layer-masks/add-layer-masks.html)
- [Adobe Selection Tools](https://helpx.adobe.com/photoshop/desktop/make-selections/get-started-selections/selection-tools-overview.html)
- [Adobe Guides, Grids and Smart Guides](https://helpx.adobe.com/photoshop/desktop/use-grids-measurement-guides/alignment-grids-guides/overview-of-guides-grids-and-smart-guides.html)
- [Adobe Artboards](https://helpx.adobe.com/photoshop/desktop/create-manage-layers/layout-design-tools/get-started-artboards.html)
