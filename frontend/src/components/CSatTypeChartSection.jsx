import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function CSatTypeChartSection({ typeScores, typeLabel }) {
  if (!typeScores || !typeScores.length) {
    return <div style={{ padding: "12px", color: "#666" }}>선택한 {typeLabel}에 대한 CSat 데이터가 없습니다.</div>;
  }

  return (
    <div style={{ backgroundColor: "white", padding: "20px", borderRadius: "8px", marginBottom: "20px" }}>
      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={typeScores} layout="vertical" margin={{ top: 20, right: 20, left: 40, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} />
          <YAxis type="category" dataKey={typeLabel} width={180} />
          <Tooltip />
          <Bar dataKey="평균점수" fill="#28a745" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
