import { useMemo, useState } from "react";
import {
  ArrowRight, Check, ChevronRight, FileOutput, Grid3X3, Image,
  Layers3, MousePointer2, Play, ScanSearch, Sparkles, WandSparkles,
} from "lucide-react";
import "./competition.css";

type DemoStep = "source" | "blocks" | "layouts" | "deck";
type LayoutKind = "narrative" | "hero" | "technical";

const steps: { id: DemoStep; number: string; label: string; detail: string }[] = [
  { id: "source", number: "01", label: "패널 가져오기", detail: "PDF · PNG · PSD" },
  { id: "blocks", number: "02", label: "콘텐츠 분해", detail: "원본은 그대로" },
  { id: "layouts", number: "03", label: "3안 비교", detail: "격자 자동 배치" },
  { id: "deck", number: "04", label: "설계설명서", detail: "근거 연결 PPTX" },
];

const layoutCopy: Record<LayoutKind, { index: string; title: string; english: string; score: string; note: string }> = {
  narrative: { index: "A", title: "서사 그리드", english: "NARRATIVE GRID", score: "92", note: "맥락 → 개념 → 도면 → 경험" },
  hero: { index: "B", title: "히어로 비주얼", english: "HERO VISUAL", score: "95", note: "대표 렌더와 핵심 개념 강조" },
  technical: { index: "C", title: "테크니컬 매트릭스", english: "TECHNICAL MATRIX", score: "89", note: "평면 · 단면 · 입면 비교" },
};

export function CompetitionMvp({ onOpenStudio }: { onOpenStudio: () => void }) {
  const [step, setStep] = useState<DemoStep>("layouts");
  const [layout, setLayout] = useState<LayoutKind>("hero");
  const [playing, setPlaying] = useState(false);
  const activeStep = useMemo(() => steps.find((item) => item.id === step)!, [step]);

  const startDemo = () => {
    setPlaying(true);
    setStep("source");
    const sequence: DemoStep[] = ["blocks", "layouts", "deck"];
    sequence.forEach((next, index) => window.setTimeout(() => {
      setStep(next);
      if (next === "deck") setPlaying(false);
    }, 850 * (index + 1)));
    document.querySelector("#mvp-demo")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <main className="pitch-site">
      <header className="pitch-nav">
        <a className="pitch-brand" href="#top" aria-label="ArchiPanel Studio 홈">
          <span className="pitch-brand-mark">AP</span>
          <span>ARCHIPANEL <b>STUDIO</b></span>
        </a>
        <nav aria-label="주요 메뉴">
          <a href="#problem">문제</a><a href="#mvp-demo">시연</a><a href="#impact">성과</a>
        </nav>
        <button className="pitch-nav-action" onClick={onOpenStudio}>편집기 열기 <ArrowRight size={14} /></button>
      </header>

      <section className="pitch-hero" id="top">
        <div className="pitch-grid" aria-hidden="true" />
        <div className="pitch-hero-copy">
          <p className="pitch-kicker"><span>2026 STARTUP MVP</span> ARCHITECTURE COMMUNICATION OS</p>
          <h1>패널 하나로,<br /><em>설계설명까지.</em></h1>
          <p className="pitch-lead">건축 패널의 도면·렌더·문장을 근거 단위로 정리하고,<br className="desktop-only" /> 격자가 맞는 배치와 편집 가능한 발표자료를 한 번에 만듭니다.</p>
          <div className="pitch-hero-actions">
            <button className="pitch-primary" onClick={startDemo}><Play size={15} fill="currentColor" /> 30초 MVP 시연</button>
            <button className="pitch-secondary" onClick={onOpenStudio}><MousePointer2 size={15} /> 내가 직접 편집</button>
          </div>
          <div className="pitch-proof">
            <span><b>03</b> 레이아웃 동시 제안</span>
            <span><b>100%</b> 원본 요소 역추적</span>
            <span><b>LOCAL</b> 로그인 없이 저장</span>
          </div>
        </div>

        <div className="pitch-hero-visual" aria-label="ArchiPanel 편집 화면 예시">
          <div className="hero-window">
            <div className="window-top"><span>ARCHIPANEL / DEMO-01</span><span>1800 × 900 mm · 300 dpi</span><i /><i /><i /></div>
            <div className="window-body">
              <aside><MousePointer2 /><Layers3 /><Grid3X3 /><Image /><FileOutput /></aside>
              <div className="window-canvas">
                <img src="/showcase/panel-demo.webp" alt="분해 및 배치 예시로 사용된 건축 패널" />
                <span className="selection selection-a"><b>HERO RENDER</b></span>
                <span className="selection selection-b"><b>CONCEPT</b></span>
                <span className="selection selection-c"><b>FLOOR PLAN</b></span>
              </div>
              <div className="window-inspector"><small>SELECTED BLOCK</small><b>대표 렌더</b><hr /><label>X <span>0.0 mm</span></label><label>Y <span>0.0 mm</span></label><label>W <span>594.0 mm</span></label><hr /><em>CONFIDENCE 0.96</em></div>
            </div>
          </div>
          <div className="hero-stamp"><Sparkles size={19} /><b>AUTO LAYOUT</b><span>3 PROPOSALS READY</span></div>
        </div>
      </section>

      <section className="pitch-problem" id="problem">
        <div className="section-index">01 / PROBLEM</div>
        <div className="problem-statement"><h2>설계는 한 번.<br />편집은 <em>세 번.</em></h2><p>패널, 설계설명서, 발표 PPT를 매번 다시 만드는 반복 작업. ArchiPanel은 이미 만든 설계 근거를 연결해 작업을 하나의 흐름으로 바꾸어 줍니다.</p></div>
        <div className="problem-flow">
          <article><span>01</span><b>여러 형식</b><p>PDF, PNG, PSD의 요소가 따로 놓여 있습니다.</p></article>
          <ChevronRight />
          <article><span>02</span><b>반복 배치</b><p>같은 도면과 설명을 매번 다시 배치합니다.</p></article>
          <ChevronRight />
          <article className="solution"><span>AP</span><b>한 번의 승인</b><p>원본을 바꾸지 않고 패널과 발표를 연결합니다.</p></article>
        </div>
      </section>

      <section className="pitch-demo" id="mvp-demo">
        <div className="section-index light">02 / INTERACTIVE MVP</div>
        <div className="demo-heading"><div><p>JURY MODE</p><h2>클릭해서 확인하는<br />패널 자동 구성</h2></div><p className="demo-status"><i className={playing ? "running" : ""} /> {playing ? "DEMO RUNNING" : `${activeStep.number} / ${activeStep.label}`}</p></div>
        <div className="demo-shell">
          <div className="demo-steps">
            {steps.map((item) => <button key={item.id} className={step === item.id ? "active" : ""} onClick={() => setStep(item.id)}><span>{item.number}</span><b>{item.label}</b><small>{item.detail}</small></button>)}
          </div>
          <div className="demo-stage">
            {step === "source" && <SourceStage />}
            {step === "blocks" && <BlocksStage />}
            {step === "layouts" && <LayoutsStage selected={layout} onSelect={setLayout} />}
            {step === "deck" && <DeckStage />}
          </div>
          <aside className="demo-summary">
            <small>CURRENT RESULT</small><h3>{activeStep.label}</h3><p>{activeStep.detail}</p>
            <ul><li><Check /> 원본 자산 불변</li><li><Check /> 요소별 출처 연결</li><li><Check /> 사용자 승인 우선</li></ul>
            <button onClick={() => setStep(steps[Math.min(steps.findIndex((item) => item.id === step) + 1, steps.length - 1)].id)}>다음 단계 <ArrowRight size={14} /></button>
          </aside>
        </div>
      </section>

      <section className="pitch-impact" id="impact">
        <div className="section-index">03 / IMPACT</div>
        <div className="impact-grid">
          <div><p>ONE SOURCE</p><h2>패널을 최종 산출물이 아닌<br /><em>설계 데이터베이스</em>로.</h2></div>
          <div className="impact-metrics"><article><b>3×</b><span>패널 레이아웃 즉시 비교</span></article><article><b>24P</b><span>A3 설계설명서 구조화</span></article><article><b>0</b><span>근거 없는 수치 자동 생성</span></article></div>
        </div>
        <div className="pitch-final">
          <div><WandSparkles size={26} /><span>ARCHIPANEL STUDIO MVP</span></div>
          <h2>당신의 설계를<br />더 잘 <em>설명하는 방법.</em></h2>
          <p>샘플 데이터로 시연하거나, 로컬 편집기에서 직접 패널을 구성해 보세요.</p>
          <button className="pitch-primary" onClick={onOpenStudio}>무료 MVP 열기 <ArrowRight size={15} /></button>
        </div>
      </section>

      <footer className="pitch-footer"><span>ARCHIPANEL STUDIO / MVP 1.4</span><span>LOCAL-FIRST · SOURCE-TRUE · RGB</span><span>© 2026</span></footer>
    </main>
  );
}

function SourceStage() {
  return <div className="source-stage"><div className="source-board"><img src="/showcase/panel-demo.webp" alt="가져온 건축 패널" /><i>ORIGINAL / LOCKED</i></div><div className="source-form"><span>INPUT DETECTED</span><b>panel-example.jpg</b><dl><dt>SIZE</dt><dd>1800 × 900 mm</dd><dt>MODE</dt><dd>RGB</dd><dt>POLICY</dt><dd>NON-DESTRUCTIVE</dd></dl></div></div>;
}

function BlocksStage() {
  const blocks = [
    [1, 1, 30, 93, "RENDER"], [33, 3, 16, 28, "CONTEXT"], [50, 3, 22, 28, "CONCEPT"], [74, 3, 24, 28, "DETAIL"],
    [33, 34, 20, 28, "SITE PLAN"], [55, 34, 43, 28, "FLOOR PLAN"], [33, 65, 65, 30, "SECTION"],
  ];
  return <div className="blocks-stage"><img src="/showcase/panel-demo.webp" alt="콘텐츠 분해 예시" />{blocks.map(([x, y, w, h, label]) => <i key={String(label)} style={{ left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%` }}><b>{label}</b></i>)}<div className="block-count"><b>14</b><span>EDITABLE<br />BLOCKS</span></div></div>;
}

function LayoutsStage({ selected, onSelect }: { selected: LayoutKind; onSelect: (layout: LayoutKind) => void }) {
  return <div className="layouts-stage">{(Object.keys(layoutCopy) as LayoutKind[]).map((kind) => { const item = layoutCopy[kind]; return <button key={kind} className={selected === kind ? "selected" : ""} onClick={() => onSelect(kind)}><span className="layout-score">{item.score}<small>/100</small></span><div className={`mini-board ${kind}`}><i className="m-hero" /><i className="m-a" /><i className="m-b" /><i className="m-c" /><i className="m-d" /></div><span className="layout-index">{item.index}</span><b>{item.title}</b><small>{item.english}</small><p>{item.note}</p>{selected === kind && <em><Check /> SELECTED</em>}</button>; })}</div>;
}

function DeckStage() {
  return <div className="deck-stage"><div className="deck-pages"><article className="deck-cover"><span>01</span><img src="/showcase/panel-demo.webp" alt="설계설명서 표지 예시" /><b>LEARNING<br />IN THE DEEP</b></article><article><span>05</span><small>CONCEPT</small><b>Learning<br />Node</b><div className="deck-diagram"><i /><i /><i /><i /></div></article><article><span>11</span><small>SPATIAL EVIDENCE</small><b>Floor Plan</b><div className="deck-plan" /></article></div><div className="deck-meta"><p><b>24</b> PAGES</p><p><b>100%</b> SOURCE LINKED</p><p><b>PPTX</b> EDITABLE TEXT</p></div></div>;
}
