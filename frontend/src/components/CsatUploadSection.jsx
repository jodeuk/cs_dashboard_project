import React, { useState } from "react";

function CsatUploadSection({ onUploadSuccess }) {
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState(null);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileType = file.name.split(".").pop().toLowerCase();
    if (!["xlsx", "xls"].includes(fileType)) {
      setMessage("xlsx/xls 파일만 업로드 가능합니다.");
      return;
    }

    setUploading(true);
    setMessage(null);

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const base64Data = String(ev.target.result).split(",")[1];
        const res = await fetch(`${process.env.REACT_APP_API_BASE}/upload-csat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            file_data: base64Data,
            file_type: fileType,
            filename: file.name,
          }),
        });
        const result = await res.json();
        if (res.ok) {
          setMessage("✅ 업로드 성공: " + (result.message || "완료"));
          onUploadSuccess && onUploadSuccess();
        } else {
          setMessage("❌ 업로드 실패: " + (result.detail || result.message || "오류"));
        }
      } catch (err) {
        setMessage("❌ 업로드 중 오류: " + err.message);
      } finally {
        setUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div style={{ background: "#fff", padding: 16, borderRadius: 8, marginBottom: 20 }}>
      <h3>📤 CSAT 데이터 업로드</h3>
      <input type="file" accept=".xlsx,.xls" onChange={handleFileChange} disabled={uploading} />
      {uploading && <div style={{ color: "#1565c0" }}>업로드 중...</div>}
      {message && (
        <div style={{ marginTop: 8, color: message.includes("✅") ? "green" : "red" }}>{message}</div>
      )}
    </div>
  );
}

export default CsatUploadSection;