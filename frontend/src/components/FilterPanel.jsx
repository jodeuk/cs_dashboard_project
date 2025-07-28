import React from 'react';

const FilterPanel = ({ options, values, setValues, onFilter }) => {
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
      <div>
        <label style={{ display: "block", marginBottom: "4px", fontWeight: "bold" }}>
          고객유형
        </label>
        <select
          value={values.고객유형 || "전체"}
          onChange={(e) => handleChange("고객유형", e.target.value)}
          style={{ width: "100%", padding: "8px", borderRadius: "4px", border: "1px solid #ddd" }}
        >
          {options.고객유형?.map(option => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </div>

      <div>
        <label style={{ display: "block", marginBottom: "4px", fontWeight: "bold" }}>
          문의유형
        </label>
        <select
          value={values.문의유형 || "전체"}
          onChange={(e) => handleChange("문의유형", e.target.value)}
          style={{ width: "100%", padding: "8px", borderRadius: "4px", border: "1px solid #ddd" }}
        >
          {options.문의유형?.map(option => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </div>

      <div>
        <label style={{ display: "block", marginBottom: "4px", fontWeight: "bold" }}>
          서비스유형
        </label>
        <select
          value={values.서비스유형 || "전체"}
          onChange={(e) => handleChange("서비스유형", e.target.value)}
          style={{ width: "100%", padding: "8px", borderRadius: "4px", border: "1px solid #ddd" }}
        >
          {options.서비스유형?.map(option => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </div>

      <div>
        <label style={{ display: "block", marginBottom: "4px", fontWeight: "bold" }}>
          문의유형 (2차)
        </label>
        <select
          value={values.문의유형_2차 || "전체"}
          onChange={(e) => handleChange("문의유형_2차", e.target.value)}
          style={{ width: "100%", padding: "8px", borderRadius: "4px", border: "1px solid #ddd" }}
        >
          {options.문의유형_2차?.map(option => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </div>

      <div>
        <label style={{ display: "block", marginBottom: "4px", fontWeight: "bold" }}>
          서비스유형 (2차)
        </label>
        <select
          value={values.서비스유형_2차 || "전체"}
          onChange={(e) => handleChange("서비스유형_2차", e.target.value)}
          style={{ width: "100%", padding: "8px", borderRadius: "4px", border: "1px solid #ddd" }}
        >
          {options.서비스유형_2차?.map(option => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </div>

      <div style={{ display: "flex", alignItems: "end" }}>
        <button
          onClick={onFilter}
          style={{
            backgroundColor: "#007bff",
            color: "white",
            border: "none",
            padding: "8px 16px",
            borderRadius: "4px",
            cursor: "pointer",
            fontWeight: "bold"
          }}
        >
          필터 적용
        </button>
      </div>
    </div>
  );
};

export default FilterPanel; 