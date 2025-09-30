import React, { useState, useMemo, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

// CSAT 질문 매핑
const CSAT_QUESTIONS = {
  "A-1": "상담원의 친절도는 어떠셨나요?",
  "A-2": "상담원이 문제 해결에 도움이 되었다고 느끼시나요?",
  "A-3": "상담 과정에 대해 개선점이나 의견이 있으시면 자유롭게 작성해 주세요.",
  "A-4": "플랫폼의 주요 기능의 작동과 안정성은 만족스러웠나요?",
  "A-5": "플랫폼의 디자인과 시각적 구성(화면 구성, 글자 크기, 버튼 크기 등)에 대해 어떻게 생각하시나요?",
  "A-6": "플랫폼에 대해 개선점이나 건의사항이 있으시면 작성해 주세요."
};

// 점수 있는 문항만 노출
const CSAT_SCORE_ITEMS = ["A-1", "A-2", "A-4", "A-5"];

export default function CSatTypeChartSection({ typeScores, typeLabel }) {
  // typeScores에 "처리유형" 키가 있으면 우선 선택, 없으면 전달된 typeLabel, 그것도 없으면 첫 번째 키
  const initialType = useMemo(() => {
    const keys = Object.keys(typeScores || {});
    if (keys.includes("처리유형")) return "처리유형";
    if (typeLabel && keys.includes(typeLabel)) return typeLabel;
    return keys[0] || "문의유형";
  }, [typeScores, typeLabel]);
  const [selectedType, setSelectedType] = useState(initialType);
  
  // 초기 선택값 보정 (유형에 해당 데이터가 있는 첫 항목)
  const initialCsat = useMemo(() => {
    const t = initialType;
    // 현재 유형에 실제 데이터가 있는 점수 문항만 후보
    const avail = CSAT_SCORE_ITEMS.filter(k => typeScores?.[t]?.[k]?.length);
    return avail[0] || "A-1";
  }, [initialType, typeScores]);
  const [selectedCsat, setSelectedCsat] = useState(initialCsat);

  // 유형 변경 시, 해당 유형에 데이터가 있는 첫 점수 문항으로 스냅
  useEffect(() => {
    const avail = CSAT_SCORE_ITEMS.filter(k => typeScores?.[selectedType]?.[k]?.length);
    if (!avail.includes(selectedCsat)) {
      setSelectedCsat(avail[0] || "A-1");
    }
  }, [selectedType, selectedCsat, typeScores]);

  if (!typeScores || Object.keys(typeScores).length === 0) {
    return <div style={{ padding: "12px", color: "#666" }}>유형별 CSAT 데이터가 없습니다.</div>;
  }

  // 사용 가능한 유형들
  const availableTypes = Object.keys(typeScores);

  // 선택된 유형의 데이터 가져오기
  const getTypeData = () => {
    if (!typeScores[selectedType] || !typeScores[selectedType][selectedCsat]) {
      return [];
    }
    
    const data = typeScores[selectedType][selectedCsat];
    // 원본 변형 방지 - 응답자수 기준으로 정렬
    return [...data].sort((a, b) => b.응답자수 - a.응답자수);
  };

  const chartData = getTypeData();

  // (추가) 데이터 개수에 따라 차트 높이 가변
  const ROW_HEIGHT = 28;         // 항목 1개당 세로 픽셀
  const CHART_MIN_H = 220;       // 최소 높이
  const chartH = Math.max(CHART_MIN_H, chartData.length * ROW_HEIGHT);

  return (
    <div style={{ backgroundColor: "white", padding: "20px", borderRadius: "8px", marginBottom: "20px" }}>
      <h3 style={{ marginBottom: "16px", color: "#333" }}>유형별 CSAT 분석</h3>
      
      {/* 유형 선택 */}
      <div style={{ marginBottom: "20px" }}>
        <div style={{ display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", color: "#495057" }}>
              분석할 유형:
            </label>
            <select 
              value={selectedType} 
              onChange={(e) => setSelectedType(e.target.value)}
              style={{
                padding: "8px 12px",
                borderRadius: "4px",
                border: "1px solid #ced4da",
                fontSize: "14px"
              }}
            >
              {availableTypes.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", color: "#495057" }}>
              CSAT 항목:
            </label>
            <select 
              value={selectedCsat} 
              onChange={(e) => setSelectedCsat(e.target.value)}
              style={{
                padding: "8px 12px",
                borderRadius: "4px",
                border: "1px solid #ced4da",
                fontSize: "14px"
              }}
            >
              {CSAT_SCORE_ITEMS.map(csat => (
                <option key={csat} value={csat}>
                  {csat} {CSAT_QUESTIONS[csat] ? `· ${CSAT_QUESTIONS[csat]}` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 차트들 */}
      {chartData.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "30px" }}>
          {/* 1. 응답자수 차트 */}
          <div>
            <h4 style={{ marginBottom: "16px", color: "#495057", fontSize: "16px" }}>
              {selectedType}별 {selectedCsat}
              {CSAT_QUESTIONS[selectedCsat] ? ` · ${CSAT_QUESTIONS[selectedCsat]}` : ""} 응답자수
            </h4>
            <ResponsiveContainer width="100%" height={chartH}>
              <BarChart data={chartData} layout="vertical" margin={{ top: 10, right: 10, left: 20, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis
                  type="category"
                  dataKey={selectedType}
                  width={200}
                  interval={0}       // ✅ 모든 카테고리 라벨 표시
                  tickMargin={6}
                  scale="band"
                />
                <Tooltip 
                  formatter={(value) => [`${value}명`, '응답자수']}
                  labelFormatter={(label) => `${label} · ${CSAT_QUESTIONS[selectedCsat] || ""}`}
                />
                <Legend />
                <Bar dataKey="응답자수" fill="#007bff" name="응답자수" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 2. 평균점수 차트 */}
          <div>
            <h4 style={{ marginBottom: "16px", color: "#495057", fontSize: "16px" }}>
              {selectedType}별 {selectedCsat}
              {CSAT_QUESTIONS[selectedCsat] ? ` · ${CSAT_QUESTIONS[selectedCsat]}` : ""} 평균점수
            </h4>
            <ResponsiveContainer width="100%" height={chartH}>
              <BarChart data={chartData} layout="vertical" margin={{ top: 10, right: 10, left: 20, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" domain={[0, 5]} />
                <YAxis
                  type="category"
                  dataKey={selectedType}
                  width={200}
                  interval={0}       // ✅ 모든 카테고리 라벨 표시
                  tickMargin={6}
                  scale="band"
                />
                <Tooltip 
                  formatter={(value) => [`${value}점`, '평균점수']}
                  labelFormatter={(label) => `${label} · ${CSAT_QUESTIONS[selectedCsat] || ""}`}
                />
                <Legend />
                <Bar dataKey="평균점수" fill="#28a745" name="평균점수" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div style={{ 
          padding: "40px", 
          textAlign: "center", 
          color: "#6c757d",
          backgroundColor: "#f8f9fa",
          borderRadius: "6px"
        }}>
          선택한 {selectedType}에 대한 {selectedCsat} 데이터가 없습니다.
        </div>
      )}
    </div>
  );
}
