from __future__ import annotations

import base64
import json
from pathlib import Path
from typing import Any

from .models import LABELS


def _data_uri(path: Path) -> str:
    mime = "image/png" if path.suffix.lower() == ".png" else "image/jpeg"
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"


def build_editor(manifest: dict[str, Any], output_path: str | Path) -> Path:
    output = Path(output_path).resolve()
    page_path = Path(manifest["source"]["page_image"])
    payload = json.dumps(manifest, ensure_ascii=False).replace("</", "<\\/")
    options = "".join(f'<option value="{label}">{label}</option>' for label in LABELS)
    html = f"""<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ArchiPanel Agent · Architecture Board Editor</title>
<style>
:root{{--paper:#f5f3ee;--ink:#171714;--muted:#716e65;--rule:#d4d0c5;--accent:#c96c32;--review:#bd3c2e}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--paper);color:var(--ink);font:14px/1.45 "Malgun Gothic",Arial,sans-serif}}
header{{position:sticky;top:0;z-index:20;display:flex;gap:14px;align-items:center;padding:13px 20px;background:#f5f3eef2;border-bottom:1px solid var(--rule)}}h1{{font:700 18px/1 Georgia,serif;margin:0}}header small{{color:var(--muted)}}button{{border:1px solid var(--ink);background:transparent;padding:8px 12px;cursor:pointer}}button.primary{{background:var(--ink);color:white}}.status{{margin-left:auto;color:var(--muted)}}
.summary{{display:flex;gap:18px;padding:10px 20px;border-bottom:1px solid var(--rule);color:var(--muted)}}.summary b{{color:var(--ink)}}main{{display:grid;grid-template-columns:minmax(620px,1fr) 430px;min-height:calc(100vh - 100px)}}.viewer{{padding:22px;overflow:auto}}.canvas{{position:relative;max-width:1400px;margin:auto;background:white;box-shadow:0 12px 40px #0001}}.canvas img{{width:100%;display:block}}
.sheet{{position:absolute;border:2px dashed #51677e;pointer-events:none}}.sheet span{{position:absolute;left:0;top:0;background:#51677e;color:white;padding:2px 6px;font-size:10px}}.box{{position:absolute;border:2px solid var(--accent);background:#c96c3212;cursor:pointer}}.box.low{{border-color:var(--review);background:#bd3c2e12}}.box.selected{{outline:3px solid var(--ink);z-index:3}}.box b{{position:absolute;left:-2px;top:-22px;background:var(--accent);color:#fff;padding:2px 5px;font-size:10px;white-space:nowrap}}
aside{{border-left:1px solid var(--rule);background:#fff;padding:17px;overflow:auto;max-height:calc(100vh - 100px)}}.flags{{border-left:4px solid var(--review);padding:10px 12px;background:#fff1ee;margin-bottom:14px}}.flags ul{{padding-left:18px;margin:6px 0}}.row{{padding:13px 0;border-bottom:1px solid var(--rule)}}.row.selected{{background:#faf3ec;margin:0 -8px;padding:13px 8px}}.head{{display:grid;grid-template-columns:66px 1fr 70px;gap:8px}}label{{display:block;font-size:11px;color:var(--muted);margin-top:7px}}input,select,textarea{{width:100%;border:1px solid var(--rule);background:white;padding:7px;font:inherit}}textarea{{min-height:62px}}.bbox{{display:grid;grid-template-columns:repeat(4,1fr);gap:5px}}@media(max-width:1050px){{main{{grid-template-columns:1fr}}aside{{max-height:none}}}}
</style></head><body>
<header><h1>ArchiPanel Agent</h1><small>건축 패널 · 판형/시트/도면군 편집</small><span class="status" id="status">저장 전</span><button id="download">JSON 다운로드</button><button class="primary" id="save">저장</button></header>
<div class="summary"><span>판형 <b id="physical"></b></span><span>구성 <b id="mode"></b></span><span>시트 <b id="sheetCount"></b></span><span>블록 <b id="blockCount"></b></span></div>
<main><section class="viewer"><div class="canvas" id="canvas"><img alt="source architecture board" src="{_data_uri(page_path)}"></div></section><aside><div id="flags"></div><div id="form"></div></aside></main>
<script type="application/json" id="manifest-data">{payload}</script>
<script>
const manifest=JSON.parse(document.getElementById('manifest-data').textContent),labelOptions='{options}';
const canvas=document.getElementById('canvas'),form=document.getElementById('form'),statusEl=document.getElementById('status');let selected=null;
const physical=manifest.physical_layout||{{}},size=physical.physical_size_mm||['?','?'];
document.getElementById('physical').textContent=size.map(function(v){{return v==null?'?':Math.round(v)}}).join(' × ')+' mm';
document.getElementById('mode').textContent=physical.layout_mode||'legacy';
document.getElementById('sheetCount').textContent=(manifest.sheets||[1]).length;document.getElementById('blockCount').textContent=manifest.blocks.length;
function dirty(){{statusEl.textContent='편집됨 · 저장 필요'}}
function renderFlags(){{const flags=manifest.review_flags||[],items=flags.slice(0,18).map(function(f){{return '<li>'+f.code+' · '+f.message+'</li>'}}).join('');document.getElementById('flags').innerHTML=flags.length?'<div class="flags"><b>검토 필요 '+flags.length+'건</b><ul>'+items+'</ul></div>':''}}
function render(){{
 canvas.querySelectorAll('.box,.sheet').forEach(function(n){{n.remove()}});(manifest.sheets||[]).forEach(function(s){{const q=s.bbox_document_normalized,el=document.createElement('div');el.className='sheet';Object.assign(el.style,{{left:q[0]*100+'%',top:q[1]*100+'%',width:(q[2]-q[0])*100+'%',height:(q[3]-q[1])*100+'%'}});el.innerHTML='<span>'+s.id+' · '+s.name+'</span>';canvas.appendChild(el)}});
 form.innerHTML='';manifest.blocks.sort(function(a,b){{return a.reading_order-b.reading_order}}).forEach(function(b){{const q=b.bbox_normalized,box=document.createElement('div');box.className='box '+(b.confidence<.65?'low ':'')+(selected===b.id?'selected':'');Object.assign(box.style,{{left:q[0]*100+'%',top:q[1]*100+'%',width:(q[2]-q[0])*100+'%',height:(q[3]-q[1])*100+'%'}});box.innerHTML='<b>'+b.reading_order+' · '+b.label+' · '+Math.round(b.confidence*100)+'%</b>';box.onclick=function(){{selected=b.id;render()}};canvas.appendChild(box);
  const row=document.createElement('div');row.className='row '+(selected===b.id?'selected':'');const bbox=b.bbox_normalized.map(function(v,i){{return '<input data-b="'+i+'" type="number" min="0" max="1" step=".001" value="'+v+'">'}}).join('');
  row.innerHTML='<div class="head"><input data-k="reading_order" type="number" min="1" value="'+b.reading_order+'"><select data-k="label">'+labelOptions+'</select><input data-k="confidence" type="number" min="0" max="1" step=".01" value="'+b.confidence+'"></div><label>시트 / 하위유형 / 도면 축척</label><div class="head"><input value="'+(b.source_sheet_id||'sheet-01')+'" disabled><input data-k="subtype" value="'+(b.subtype||'')+'" placeholder="예: 1층"><input data-k="drawing_scale" value="'+(b.drawing_scale||'')+'" placeholder="1:500"></div><label>document bbox (x0,y0,x1,y1)</label><div class="bbox">'+bbox+'</div><label>원문/OCR — 확인되지 않은 내용은 보정하지 마세요</label><textarea data-k="text">'+(b.text||'')+'</textarea>';
  row.querySelector('select').value=b.label;row.querySelectorAll('[data-k]').forEach(function(el){{el.onchange=function(){{const k=el.dataset.k;b[k]=k==='reading_order'?Number(el.value):k==='confidence'?Number(el.value):(el.value||null);dirty();render()}}}});row.querySelectorAll('[data-b]').forEach(function(el){{el.onchange=function(){{b.bbox_normalized[Number(el.dataset.b)]=Number(el.value);dirty();render()}}}});form.appendChild(row)
 }})
}}
function download(body){{body=body||JSON.stringify(manifest,null,2);const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([body],{{type:'application/json'}}));a.download='architecture-panel-edited.json';a.click();URL.revokeObjectURL(a.href)}}
async function save(){{const body=JSON.stringify(manifest,null,2);try{{const res=await fetch('/api/manifest',{{method:'PUT',headers:{{'Content-Type':'application/json'}},body:body}});if(!res.ok)throw Error(await res.text());statusEl.textContent='로컬 manifest 저장됨'}}catch(e){{download(body);statusEl.textContent='서버 없음 · JSON 다운로드됨'}}}}
document.getElementById('save').onclick=save;document.getElementById('download').onclick=function(){{download()}};renderFlags();render();
</script></body></html>"""
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(html, encoding="utf-8")
    return output
