import React from 'react';

// 확장성 높은 필드 정의
const FILTER_FIELDS = [
  { key: "고객유형", label: "고객유형" },
  { key: "문의유형", label: "문의유형" },
  { key: "서비스유형", label: "서비스유형" },
  { key: "문의유형_2차", label: "문의유형 (2차)" },
  { key: "서비스유형_2차", label: "서비스유형 (2차)" }
];

const FilterPanel = ({ options, values, setValues }) => {
  const handleChange = (key, value) => {
    setValues(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div style={{
      backgroundColor: "#f8f9fa",
      padding: "16px",
      borderRadius: "8px",
      marginBottom: "20px",
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
      gap: "16px"
    }}>
      {FILTER_FIELDS.map(field => (
        <div key={field.key}>
          <label style={{ display: "block", marginBottom: "4px", fontWeight: "bold" }}>
            {field.label}
          </label>
          <select
            value={values[field.key] || "전체"}
            onChange={e => handleChange(field.key, e.target.value)}
            style={{ width: "100%", padding: "8px", borderRadius: "4px", border: "1px solid #ddd" }}
          >
            {/* 항상 '전체' 옵션 */}
            <option value="전체">전체</option>
            {(options[field.key] || [])
              .filter(option => option !== "전체")
              .map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
          </select>
        </div>
      ))}

    </div>
  );
};

export default FilterPanel; 