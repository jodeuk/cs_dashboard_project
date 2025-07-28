import React, { useState, useEffect } from 'react';
import { fetchWordCloudData } from '../api';

const WordCloudSection = ({ params, loading }) => {
  const [keywordData, setKeywordData] = useState(null);

  useEffect(() => {
    if (!loading && params) {
      fetchWordCloudData(params)
        .then(setKeywordData)
        .catch(console.error);
    }
  }, [params, loading]);

  if (loading) {
    return (
      <div style={{
        backgroundColor: "#f8f9fa",
        padding: "20px",
        borderRadius: "8px",
        marginBottom: "20px",
        textAlign: "center"
      }}>
        <div>키워드 분석 중...</div>
      </div>
    );
  }

  if (!keywordData || !keywordData.keywords) {
    return (
      <div style={{
        backgroundColor: "#f8f9fa",
        padding: "20px",
        borderRadius: "8px",
        marginBottom: "20px",
        textAlign: "center",
        color: "#666"
      }}>
        키워드 데이터가 없습니다.
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
      <h3 style={{ marginBottom: "16px", color: "#333" }}>키워드 분석</h3>
      
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
        gap: "8px",
        marginBottom: "16px"
      }}>
        {keywordData.keywords.slice(0, 20).map((item, index) => (
          <div key={index} style={{
            backgroundColor: "#f8f9fa",
            padding: "8px",
            borderRadius: "4px",
            textAlign: "center",
            fontSize: "12px"
          }}>
            <div style={{ fontWeight: "bold" }}>{item.word}</div>
            <div style={{ color: "#666" }}>{item.count}</div>
          </div>
        ))}
      </div>
      
      {keywordData.message && (
        <div style={{
          fontSize: "12px",
          color: "#666",
          textAlign: "center",
          fontStyle: "italic"
        }}>
          {keywordData.message}
        </div>
      )}
    </div>
  );
};

export default WordCloudSection; 