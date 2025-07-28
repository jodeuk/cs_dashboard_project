import React from 'react';

const CsatSection = ({ data, loading }) => {
  if (loading) {
    return (
      <div style={{
        backgroundColor: "#f8f9fa",
        padding: "20px",
        borderRadius: "8px",
        marginBottom: "20px",
        textAlign: "center"
      }}>
        <div>CSAT 데이터 로딩 중...</div>
      </div>
    );
  }

  if (!data || !data.평균점수 || data.평균점수.length === 0) {
    return (
      <div style={{
        backgroundColor: "#f8f9fa",
        padding: "20px",
        borderRadius: "8px",
        marginBottom: "20px",
        textAlign: "center",
        color: "#666"
      }}>
        CSAT 데이터가 없습니다.
      </div>
    );
  }

  return (
    <div style={{
      backgroundColor: "white",
      padding: "20px",
      borderRadius: "8px",
      marginBottom: "20px",
      boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
    }}>
      <h3 style={{ marginBottom: "16px", color: "#333" }}>CSAT 분석</h3>
      
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: "16px"
      }}>
        {data.평균점수.map((item, index) => (
          <div key={index} style={{
            backgroundColor: "#f8f9fa",
            padding: "16px",
            borderRadius: "8px",
            textAlign: "center"
          }}>
            <div style={{
              fontSize: "14px",
              fontWeight: "bold",
              marginBottom: "8px",
              color: "#333"
            }}>
              {item.문항}
            </div>
            <div style={{
              fontSize: "24px",
              fontWeight: "bold",
              color: "#007bff"
            }}>
              {item.평균점수?.toFixed(1) || "N/A"}
            </div>
            <div style={{
              fontSize: "12px",
              color: "#666",
              marginTop: "4px"
            }}>
              평균 점수
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CsatSection; 