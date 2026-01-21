import React from 'react';

const KpiCards = ({ statistics }) => {
  const kpis = [
    { label: "총 문의수", value: statistics.총문의수?.toLocaleString() || 0, color: "#007bff" },
    { label: "평균 첫 응답시간", value: `${statistics.평균첫응답시간?.toFixed(1) || 0}분`, color: "#17a2b8" },
    { label: "평균 해결시간", value: `${statistics.평균해결시간?.toFixed(1) || 0}분`, color: "#28a745" },
    { label: "자체해결 비율", value: `${statistics.자체해결비율?.toFixed(1) || 0}%`, color: "#6f42c1" },
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: "12px",
        marginBottom: "20px",
      }}
    >
      {kpis.map((kpi, idx) => (
        <div
          key={idx}
          style={{
            backgroundColor: "white",
            padding: "20px",
            borderRadius: "12px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "28px", fontWeight: "600", color: kpi.color, marginBottom: "4px" }}>{kpi.value}</div>
          <div style={{ fontSize: "14px", color: "#666", fontWeight: "500" }}>{kpi.label}</div>
        </div>
      ))}
    </div>
  );
};

export default KpiCards;
