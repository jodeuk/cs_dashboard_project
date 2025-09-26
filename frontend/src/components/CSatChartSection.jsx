import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList, ResponsiveContainer } from "recharts";

// CSAT 질문 매핑
const CSAT_QUESTIONS = {
  "A-1": "상담원의 친절도는 어떠셨나요?",
  "A-2": "상담원이 문제 해결에 도움이 되었다고 느끼시나요?",
  "A-3": "상담 과정에 대해 개선점이나 의견이 있으시면 자유롭게 작성해 주세요.",
  "A-4": "플랫폼의 주요 기능의 작동과 안정성은 만족스러웠나요?",
  "A-5": "플랫폼의 디자인과 시각적 구성(화면 구성, 글자 크기, 버튼 크기 등)에 대해 어떻게 생각하시나요?",
  "A-6": "플랫폼에 대해 개선점이나 건의사항이 있으시면 작성해 주세요."
};

export default function CSatChartSection({ csatSummary, totalResponses }) {
  if (!csatSummary || !csatSummary.length) {
    return <div style={{ padding: "12px", color: "#666" }}>CSat 데이터가 없습니다.</div>;
  }

  // 응답자 / 미응답자 데이터 변환 + 응답률 계산
  const chartData = csatSummary.map(item => {
    const denom = (typeof item.대상자수 === "number" ? item.대상자수 : totalResponses) || 0; // ✅ 대상자수 우선
    const responseRate = denom > 0 ? Math.round((item.응답자수 / denom) * 100) : 0;
    return {
      // Y축엔 코드만 (예: "A-1")
      항목: item.항목,
      // 툴팁에서 쓸 원문 정보
      질문: CSAT_QUESTIONS?.[item.항목] || "",
      평균점수: item.평균점수,
      응답자: item.응답자수,
      미응답자: Math.max(0, denom - item.응답자수),  // ✅ 대상자수 기반
      응답률: `${responseRate}%`,
    };
  });

  // (추가) 항목별 평균점수 맵
  const avgByItem = Object.fromEntries(chartData.map(d => [d.항목, d.평균점수]));
  const fmtAvg = (x) => (typeof x === "number" && isFinite(x) ? x.toFixed(2) : "-");

  return (
    <div style={{ backgroundColor: "white", padding: "20px", borderRadius: "8px", marginBottom: "20px" }}>
      <h3 style={{ marginBottom: "16px", color: "#333" }}>항목별 평균점수, 응답자수, 응답률</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 20, right: 20, left: 40, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" />
          {/* Y축엔 코드 + (평균점수) */}
          <YAxis
            type="category"
            dataKey="항목"
            width={140}  // ← 길어지므로 약간 넉넉히
            tickFormatter={(v) => `${v} (${fmtAvg(avgByItem[v])}점)`}
          />
          {/* 툴팁에 전체 질문 + 점수 노출 */}
          <Tooltip
            formatter={(value, name) => {
              if (name === "응답자" || name === "미응답자") return [`${value}명`, name];
              return [value, name];
            }}
            labelFormatter={(_, payload) => {
              const p = payload && payload[0] && payload[0].payload;
              if (!p) return "";
              // 예: "A-1 · 상담원의 친절도는… (4.79점)"
              return `${p.항목}${p.질문 ? ` · ${p.질문}` : ""} (${p.평균점수}점)`;
            }}
          />
          <Legend />
          <Bar dataKey="응답자" stackId="a" fill="#1f77b4">
            <LabelList dataKey="응답률" position="center" fill="white" fontSize={14} />
          </Bar>
          <Bar dataKey="미응답자" stackId="a" fill="#ff7f0e" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
