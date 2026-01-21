import React from 'react';

const CustomerTypeDonutChart = ({ data, tooltip, onTooltipChange, onHoverIndexChange }) => {
  if (!data || data.length === 0) return null;

  const total = data.reduce((sum, item) => sum + item.문의량, 0);
  const colors = ["#007bff", "#28a745", "#ffc107", "#dc3545", "#6f42c1", "#fd7e14"];

  let accAngle = 0;
  const radius = 100;
  const strokeW = 40;

  return (
    <div
      style={{
        backgroundColor: "white",
        padding: "20px",
        borderRadius: "12px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
      }}
    >
      <h3 style={{ marginBottom: "16px", color: "#333", fontWeight: "600" }}>고객유형별 분포</h3>
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "300px" }}>
        <div style={{ position: "relative", width: "300px", height: "300px" }}>
          <svg width="300" height="300" viewBox="0 0 300 300">
            <circle cx="150" cy="150" r="120" fill="none" stroke="#e0e0e0" strokeWidth="40" />
            {data.map((item, index) => {
              const frac = item.문의량 / total;
              const startAngle = accAngle;
              const endAngle = accAngle + frac * 2 * Math.PI;
              accAngle = endAngle;
              const x1 = 150 + radius * Math.cos(startAngle);
              const y1 = 150 + radius * Math.sin(startAngle);
              const x2 = 150 + radius * Math.cos(endAngle);
              const y2 = 150 + radius * Math.sin(endAngle);
              const largeArcFlag = endAngle - startAngle <= Math.PI ? "0" : "1";
              const color = colors[index % colors.length];
              return (
                <g key={index}>
                  <path
                    d={`M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`}
                    fill="none"
                    stroke={color}
                    strokeWidth={strokeW}
                    onMouseEnter={(e) => {
                      const rect = e.target.getBoundingClientRect();
                      onTooltipChange({
                        visible: true,
                        x: rect.left + rect.width / 2,
                        y: rect.top,
                        title: item.고객유형,
                        count: item.문의량,
                        percent: item.퍼센트,
                      });
                      onHoverIndexChange(index);
                    }}
                    onMouseLeave={() => {
                      onTooltipChange({ visible: false, x: 0, y: 0, title: "", count: 0, percent: 0 });
                      onHoverIndexChange(null);
                    }}
                    style={{ cursor: "pointer" }}
                  />
                </g>
              );
            })}
          </svg>
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "24px", fontWeight: "600", color: "#333" }}>
              {total.toLocaleString()}
            </div>
            <div style={{ fontSize: "14px", color: "#666" }}>총 문의</div>
          </div>
        </div>
      </div>
      <div style={{ marginTop: "20px", display: "flex", flexWrap: "wrap", gap: "8px", justifyContent: "center" }}>
        {data.map((item, index) => (
          <div
            key={index}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "4px 8px",
              backgroundColor: "#f8f9fa",
              borderRadius: "6px",
              fontSize: "12px",
              cursor: "default",
            }}
            title={`${item.고객유형}: ${item.문의량.toLocaleString()}건 (${item.퍼센트.toFixed(1)}%)`}
          >
            <div
              style={{
                width: "12px",
                height: "12px",
                borderRadius: "50%",
                backgroundColor: colors[index % colors.length],
              }}
            />
            <span>{item.고객유형}</span>
            <span style={{ color: "#666" }}>({item.퍼센트.toFixed(1)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CustomerTypeDonutChart;
