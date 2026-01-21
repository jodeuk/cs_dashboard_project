import React from 'react';

const RefundCustomerForm = ({ 
  formData, 
  onFormDataChange, 
  editingIndex, 
  onCancel,
  onSubmit,
  reasonOption,
  onReasonOptionChange,
  reasonOptions
}) => {
  return (
    <div style={{
      backgroundColor: "#f8f9fa",
      padding: "20px",
      borderRadius: "8px",
      marginBottom: "24px",
      border: "1px solid #dee2e6"
    }}>
      <h3 style={{ fontSize: "18px", marginBottom: "16px", color: "#495057" }}>
        {editingIndex !== null ? "환불 정보 수정" : "신규 환불 등록"}
      </h3>
      
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: "12px",
        marginBottom: "16px"
      }}>
        <div>
          <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
            이름 <span style={{ color: "red" }}>*</span>
          </label>
          <input
            type="text"
            value={formData.이름}
            onChange={(e) => onFormDataChange({ ...formData, 이름: e.target.value })}
            style={{
              width: "100%",
              padding: "8px",
              border: "1px solid #ced4da",
              borderRadius: "4px",
              fontSize: "14px"
            }}
          />
        </div>
        
        <div>
          <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
            기관명
          </label>
          <input
            type="text"
            value={formData.기관}
            onChange={(e) => onFormDataChange({ ...formData, 기관: e.target.value })}
            style={{
              width: "100%",
              padding: "8px",
              border: "1px solid #ced4da",
              borderRadius: "4px",
              fontSize: "14px"
            }}
          />
        </div>
        
        <div>
          <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
            기관 링크
          </label>
          <input
            type="url"
            placeholder="https://example.com"
            value={formData.기관링크}
            onChange={(e) => onFormDataChange({ ...formData, 기관링크: e.target.value })}
            style={{
              width: "100%",
              padding: "8px",
              border: "1px solid #ced4da",
              borderRadius: "4px",
              fontSize: "14px"
            }}
          />
        </div>
        
        <div>
          <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
            크레딧 충전 금액
          </label>
          <input
            type="text"
            placeholder="예: 100만원"
            value={formData.크레딧충전금액}
            onChange={(e) => onFormDataChange({ ...formData, 크레딧충전금액: e.target.value })}
            style={{
              width: "100%",
              padding: "8px",
              border: "1px solid #ced4da",
              borderRadius: "4px",
              fontSize: "14px"
            }}
          />
        </div>
        
        <div>
          <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
            환불금액 <span style={{ color: "red" }}>*</span>
          </label>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            placeholder="예: 500000"
            value={formData.환불금액}
            onChange={(e) => onFormDataChange({ ...formData, 환불금액: e.target.value })}
            style={{
              width: "100%",
              padding: "8px",
              border: "1px solid #ced4da",
              borderRadius: "4px",
              fontSize: "14px"
            }}
          />
        </div>
        
        <div>
          <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
            환불날짜 <span style={{ color: "red" }}>*</span>
          </label>
          <input
            type="date"
            value={formData.환불날짜}
            onChange={(e) => onFormDataChange({ ...formData, 환불날짜: e.target.value })}
            style={{
              width: "100%",
              padding: "8px",
              border: "1px solid #ced4da",
              borderRadius: "4px",
              fontSize: "14px"
            }}
          />
        </div>
        
        <div>
          <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
            환불사유
          </label>
          <select
            value={reasonOption}
            onChange={(e) => {
              const value = e.target.value;
              onReasonOptionChange(value);
              if (!value || value !== "기타") {
                onFormDataChange({ ...formData, 환불사유: value || "" });
              }
            }}
            style={{
              width: "100%",
              padding: "8px",
              border: "1px solid #ced4da",
              borderRadius: "4px",
              fontSize: "14px",
              backgroundColor: "white"
            }}
          >
            <option value="">환불 사유를 선택하세요</option>
            {reasonOptions.map(option => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
          {reasonOption === "기타" && (
            <input
              type="text"
              placeholder="환불 사유를 입력하세요"
              value={formData.환불사유}
              onChange={(e) => onFormDataChange({ ...formData, 환불사유: e.target.value })}
              style={{
                width: "100%",
                marginTop: "8px",
                padding: "8px",
                border: "1px solid #ced4da",
                borderRadius: "4px",
                fontSize: "14px"
              }}
            />
          )}
        </div>
      </div>
      
      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
        {editingIndex !== null && (
          <button
            onClick={onCancel}
            style={{
              padding: "10px 20px",
              backgroundColor: "#6c757d",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: "500"
            }}
          >
            취소
          </button>
        )}
        <button
          onClick={onSubmit}
          style={{
            padding: "10px 20px",
            backgroundColor: "#dc3545",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "14px",
            fontWeight: "500"
          }}
        >
          {editingIndex !== null ? "수정 완료" : "등록"}
        </button>
      </div>
    </div>
  );
};

export default RefundCustomerForm;
