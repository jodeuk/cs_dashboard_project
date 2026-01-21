import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const InstitutionTimelineChart = ({ crmCustomers }) => {
  const dateCounts = {};

  crmCustomers.forEach((c) => {
    if (c.기관생성일) {
      const key = c.기관생성일;
      if (!dateCounts[key]) dateCounts[key] = { date: key, created: 0, registered: 0 };
      dateCounts[key].created += 1;
    }
    if (c.카드등록일) {
      const key = c.카드등록일;
      if (!dateCounts[key]) dateCounts[key] = { date: key, created: 0, registered: 0 };
      dateCounts[key].registered += 1;
    }
  });

  const lineData = Object.values(dateCounts).sort((a, b) =>
    (a.date || "").localeCompare(b.date || "")
  );

  if (lineData.length === 0) {
    return (
      <div style={{
        backgroundColor: "#fff",
        border: "1px solid #dee2e6",
        borderRadius: "8px",
        padding: "12px",
        boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
        gridColumn: "span 2"
      }}>
        <h3 style={{ fontSize: "14px", marginBottom: "12px", color: "#495057", fontWeight: "600" }}>
          일자별 기관 생성 / 카드 등록 추이
        </h3>
        <div style={{ textAlign: "center", color: "#6c757d", padding: "24px 0", fontSize: "13px" }}>
          기관 생성일/카드등록일 데이터가 없습니다.
        </div>
      </div>
    );
  }

  return (
    <div style={{
      backgroundColor: "#fff",
      border: "1px solid #dee2e6",
      borderRadius: "8px",
      padding: "12px",
      boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
      gridColumn: "span 2"
    }}>
      <h3 style={{ fontSize: "14px", marginBottom: "12px", color: "#495057", fontWeight: "600" }}>
        일자별 기관 생성 / 카드 등록 추이
      </h3>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={lineData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis />
          <Tooltip />
          <Legend />
          <Line
            type="monotone"
            dataKey="created"
            stroke="#0d6efd"
            strokeWidth={2}
            dot={{ r: 3 }}
            name="기관 생성"
          />
          <Line
            type="monotone"
            dataKey="registered"
            stroke="#20c997"
            strokeWidth={2}
            dot={{ r: 3 }}
            name="카드 등록"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default InstitutionTimelineChart;
