import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList, ResponsiveContainer } from "recharts";

export default function CSatChartSection({ csatSummary, totalResponses }) {
  if (!csatSummary || !csatSummary.length) {
    return <div style={{ padding: "12px", color: "#666" }}>CSat 데이터가 없습니다.</div>;
  }

  // 응답자 / 미응답자 데이터 변환 + 응답률 계산
  const chartData = csatSummary.map(item => {
    const responseRate = totalResponses > 0 ? Math.round((item.응답자수 / totalResponses) * 100) : 0;
    return {
      항목: `${item.항목} (${item.평균점수}점)`,
      응답자: item.응답자수,
      미응답자: totalResponses - item.응답자수,
      응답률: `${responseRate}%`
    };
  });

  return (
    <div style={{ backgroundColor: "white", padding: "20px", borderRadius: "8px", marginBottom: "20px" }}>
      <h3 style={{ marginBottom: "16px", color: "#333" }}>항목별 평균점수, 응답자수, 응답률</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 20, right: 20, left: 40, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" />
          <YAxis type="category" dataKey="항목" width={180} />
          <Tooltip />
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
