import { Activity, Eye, EyeOff, Focus, Grid3X3, RotateCcw, ScanSearch, Sparkles } from "lucide-react";
import { FEATURE_KEYS, FEATURE_LABELS, tasteMatch } from "./critique";
import type { CritiqueResultV1, CritiqueSettingsV1, CritiqueView, LayoutDecisionRecordV1, LocalTasteProfileV1 } from "./types";
import "./critique.css";

const views: { id: CritiqueView; label: string; description: string }[] = [
  { id: "original", label: "원본", description: "편집 화면" }, { id: "grayscale", label: "흑백", description: "색상 제거" },
  { id: "thumbnail", label: "축소판", description: "전체 초점" }, { id: "blur", label: "블러", description: "큰 덩어리" },
];

export function CritiqueDock({ result, busy, settings, profile, pendingDecision, onSettings, onSelect, onLearn, onReset }: {
  result?: CritiqueResultV1; busy: boolean; settings: CritiqueSettingsV1; profile: LocalTasteProfileV1; pendingDecision?: LayoutDecisionRecordV1;
  onSettings: (patch: Partial<CritiqueSettingsV1>) => void; onSelect: (ids: string[]) => void; onLearn: () => void; onReset: () => void;
}) {
  return <section className="critique-dock" data-testid="critique-dock">
    <header><div><ScanSearch size={16}/><span><b>DESIGN CRITIQUE</b><small>규칙 기반 도우미 · 실제 아이트래킹 아님</small></span></div><div className="critique-views">{views.map((item)=><button key={item.id} className={settings.view===item.id?"active":""} onClick={()=>onSettings({view:item.id})}><b>{item.label}</b><small>{item.description}</small></button>)}</div><div className="critique-toggles"><button className={settings.showHierarchy?"active":""} onClick={()=>onSettings({showHierarchy:!settings.showHierarchy})}><Focus size={13}/> 위계</button><button className={settings.showDensity?"active":""} onClick={()=>onSettings({showDensity:!settings.showDensity})}><Grid3X3 size={13}/> 밀도</button><button className={settings.showGaze?"active":""} onClick={()=>onSettings({showGaze:!settings.showGaze})}><Activity size={13}/> 예상 시선</button></div></header>
    <div className="critique-body">
      <div className="critique-score"><span>{busy?"…":Math.round(result?.overallScore??0)}</span><small>OVERALL / 100</small><em>신뢰도 {Math.round((result?.confidence??0)*100)}%</em></div>
      <div className="critique-metrics">{FEATURE_KEYS.map((key)=><div key={key}><span><b>{FEATURE_LABELS[key]}</b><em>{Math.round(result?.featureVector[key]??0)}</em></span><i><u style={{width:`${result?.featureVector[key]??0}%`}}/></i></div>)}</div>
      <div className="critique-warnings"><div className="critique-label"><span>DIAGNOSTIC NOTES</span><b>{result?.warnings.length??0}</b></div>{result?.warnings.length?result.warnings.slice(0,3).map((warning)=><button key={warning.code} onClick={()=>onSelect(warning.elementIds)}><i className={warning.severity}/><span><b>{warning.message}</b><small>{warning.suggestion}</small></span></button>):<div className="critique-clear"><Sparkles size={14}/><span>큰 구성 충돌이 발견되지 않았습니다.</span></div>}</div>
      <div className="taste-panel"><div className="critique-label"><span>LOCAL TASTE</span><b>{profile.sampleCount<20?`학습 중 ${profile.sampleCount}/20`:`${Math.round(result?tasteMatch(result.featureVector,profile,result.projectId):0)}% 일치`}</b></div><p>{pendingDecision?`선택한 ${pendingDecision.selectedStrategy} 안과 현재 수정본을 비교할 수 있습니다.`:"명시적으로 선택한 레이아웃만 학습합니다."}</p><div><button className="primary" disabled={!pendingDecision||!result} onClick={onLearn}><Eye size={13}/> 이 수정에서 학습</button><button title="전체 취향 프로필 초기화" onClick={onReset}><RotateCcw size={13}/></button></div><small><EyeOff size={11}/> 이미지·문장·경로는 저장하지 않음</small></div>
    </div>
  </section>;
}
