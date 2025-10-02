import React, { useMemo, useState, useEffect } from "react";

// 처리유형 태그만 인정 (공백 보정). 없으면 null → 집계에서 제외
const pickHandlingTag = (row) => {
  const tags = row?.tags || [];
  for (const t of tags) {
    if (typeof t !== "string") continue;
    const norm = t.replace(/\s+/g, "");
    if (norm.startsWith("처리유형/")) return t;
  }
  return null; // 태그 없음 → 제외
};

// 유효한 처리유형만 파싱 (없거나 형식 불량이면 null)
const parseType = (tag) => {
  if (!tag) return null;
  const parts = tag.split("/").map(s => s.trim());
  if (parts.length < 2) return null;
  return { top: parts[1], detail: parts.length >= 3 ? parts[2] : null };
};

// 밝은 대시보드 팔레트 (Bootstrap 계열)
const COLORS = [
  "#007bff", "#28a745", "#ffc107", "#dc3545",
  "#6f42c1", "#17a2b8", "#fd7e14", "#20c997"
];

export default function HandlingTypeDonut({ rows = [], width = 380, height = 300, innerRadius = 70, outerRadius = 120, defaultDetail = false }) {
  // ⬇️ 이관·처리불가 세부 보기 토글 (내부 상태 + 외부 기본값 연동)
  const [detail, setDetail] = useState(!!defaultDetail);
  useEffect(() => { setDetail(!!defaultDetail); }, [defaultDetail]);

  const counts = useMemo(() => {
    const map = new Map();
    rows.forEach(r => {
      const tag = pickHandlingTag(r);        // 태그 없으면 제외
      const parsed = parseType(tag);         // { top, detail } 또는 null
      if (!parsed) return;
      const { top, detail: d } = parsed;
      if (top === "기타") return;            // 명시 '기타' 제외
      // detail 토글: 자체해결은 그대로, 이관/처리불가는 세부만 카운트
      const key = detail
        ? (top === "자체해결" ? "자체해결" : (d ? `${top}/${d}` : top))  // 세부 정보 없으면 top 레벨 유지
        : top;
      if (!key) return;
      map.set(key, (map.get(key) || 0) + 1);
    });
    const ORDER = detail
      ? ["자체해결","이관/개발팀","이관/사업팀","이관/운영팀","이관/고객사","이관",
         "처리불가/개발팀","처리불가/사업팀","처리불가/운영팀","처리불가"]
      : ["자체해결","이관","처리불가"];
    return Array.from(map, ([label, value]) => ({ label, value }))
      .sort((a,b) => (ORDER.indexOf(a.label) - ORDER.indexOf(b.label)) || (b.value - a.value));
  }, [rows, detail]);

  // 파이 계산
  const total = counts.reduce((s, d) => s + d.value, 0) || 1;
  const arcs = useMemo(() => {
    let acc = 0;
    return counts.map((d, i) => {
      const angle = (d.value / total) * Math.PI * 2;
      const start = acc, end = acc + angle; acc += angle;
      return { ...d, start, end, idx: i };
    });
  }, [counts, total]);

  const cx = width / 2, cy = height / 2;

  const arcPath = (s, e, r) => {
    const x1 = cx + Math.cos(s) * r;
    const y1 = cy + Math.sin(s) * r;
    const x2 = cx + Math.cos(e) * r;
    const y2 = cy + Math.sin(e) * r;
    const large = e - s > Math.PI ? 1 : 0;
    return { x1, y1, x2, y2, large };
  };

  return (
    <div style={{ background:"#fff", borderRadius:12, boxShadow:"0 2px 8px rgba(0,0,0,0.08)", padding:16 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
        <h3 style={{ margin:0, color:"#333", fontWeight:600 }}>처리유형 비율 차트</h3>
        <label style={{ display:"inline-flex", alignItems:"center", gap:8, fontSize:13, color:"#374151" }}>
          <input type="checkbox" checked={detail} onChange={(e)=>setDetail(e.target.checked)} />
          이관·처리불가 세부 보기
        </label>
      </div>
      <div style={{ width }}>

      <svg width={width} height={height}>
        {arcs.map(a => {
          const o = arcPath(a.start, a.end, outerRadius);
          const i = arcPath(a.start, a.end, innerRadius);
          const d = [
            `M ${o.x1} ${o.y1}`,
            `A ${outerRadius} ${outerRadius} 0 ${o.large} 1 ${o.x2} ${o.y2}`,
            `L ${i.x2} ${i.y2}`,
            `A ${innerRadius} ${innerRadius} 0 ${i.large} 0 ${i.x1} ${i.y1}`,
            "Z"
          ].join(" ");
          const pct = ((a.value / total) * 100).toFixed(1);
          const mid = (a.start + a.end)/2;
          const lx = cx + Math.cos(mid) * (outerRadius + 18);
          const ly = cy + Math.sin(mid) * (outerRadius + 18);
          return (
            <g key={a.label}>
              <path d={d} fill={COLORS[a.idx % COLORS.length]} opacity={0.95}/>
              {a.end - a.start > 0.15 && (
                <text
                  x={lx}
                  y={ly}
                  fontSize="12"
                  fill="#374151"
                  textAnchor={mid > Math.PI/2 && mid < Math.PI*1.5 ? "end" : "start"}
                >
                  {a.label} ({pct}%)
                </text>
              )}
            </g>
          );
        })}
        <text x={cx} y={cy} textAnchor="middle" fontSize="13" fill="#111827" fontWeight="600">
          총 {total}건
        </text>
      </svg>
      </div>
    </div>
  );
}
