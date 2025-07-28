import React, { useEffect, useState } from "react";
import { fetchCsatSample } from "../api";

function CsatSection() {
  const [data, setData] = useState([]);
  useEffect(() => {
    fetchCsatSample().then(setData);
  }, []);
  return (
    <div>
      <h3>CSat 샘플 데이터</h3>
      <pre style={{ maxHeight: 250, overflowY: "auto", background: "#fafaff" }}>
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

export default CsatSection;
