import React from 'react';

const ChartSection = ({ data, label, xLabel, yLabel, loading }) => {
  if (loading) {
    return (
      <div style={{
        backgroundColor: "#f8f9fa",
        padding: "20px",
        borderRadius: "8px",
        marginBottom: "20px",
        textAlign: "center"
      }}>
        <div>로딩 중...</div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div style={{
        backgroundColor: "#f8f9fa",
        padding: "20px",
        borderRadius: "8px",
        marginBottom: "20px",
        textAlign: "center",
        color: "#666"
      }}>
        데이터가 없습니다.
      </div>
    );
  }

  const maxValue = Math.max(...data.map(item => item[yLabel] || 0));
  const maxBarHeight = 200;

  return (
    <div style={{
      backgroundColor: "white",
      padding: "20px",
      borderRadius: "8px",
      marginBottom: "20px",
      boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
    }}>
      <h3 style={{ marginBottom: "16px", color: "#333" }}>{label}</h3>
      
      <div style={{ display: "flex", alignItems: "end", gap: "8px", height: "220px" }}>
        {data.map((item, index) => {
          const height = maxValue > 0 ? (item[yLabel] / maxValue) * maxBarHeight : 0;
          return (
            <div key={index} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{
                backgroundColor: "#007bff",
                width: "100%",
                height: `${height}px`,
                borderRadius: "4px 4px 0 0",
                marginBottom: "8px",
                minHeight: "4px"
              }} />
              <div style={{
                fontSize: "12px",
                color: "#666",
                textAlign: "center"
              }}>
                {item[xLabel]}
              </div>
              <div style={{
                fontSize: "10px",
                color: "#999",
                textAlign: "center"
              }}>
                {item[yLabel]}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ChartSection; 