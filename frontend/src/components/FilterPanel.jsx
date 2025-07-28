import React from "react";

function FilterPanel({ options, values, setValues, onFilter }) {
  // options: {고객유형, 문의유형 ...}, values: {고객유형: "..."}
  const handleChange = (e) => {
    setValues({ ...values, [e.target.name]: e.target.value });
  };
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
      {Object.keys(options).map((key) => (
        <select key={key} name={key} value={values[key] || "전체"} onChange={handleChange}>
          {(options[key] || []).map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      ))}
      <button onClick={onFilter}>적용</button>
    </div>
  );
}

export default FilterPanel;
