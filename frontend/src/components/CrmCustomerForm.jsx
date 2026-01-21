import React from 'react';

const CrmCustomerForm = ({ 
  formData, 
  onFormDataChange, 
  editingIndex, 
  onCancel,
  onSubmit,
  loading
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
        {editingIndex !== null ? "CRM 정보 수정" : "신규 CRM 등록"}
      </h3>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: "12px",
        marginBottom: "16px"
      }}>
        <div>
          <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: "500" }}>
            기관 생성일
          </label>
          <input
            type="date"
            value={formData.기관생성일}
            onChange={(e) => onFormDataChange({ ...formData, 기관생성일: e.target.value })}
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
            성함 <span style={{ color: "red" }}>*</span>
          </label>
          <input
            type="text"
            value={formData.성함}
            onChange={(e) => onFormDataChange({ ...formData, 성함: e.target.value })}
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
            이메일 <span style={{ color: "red" }}>*</span>
          </label>
          <input
            type="email"
            value={formData.이메일}
            onChange={(e) => onFormDataChange({ ...formData, 이메일: e.target.value })}
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
            카드미등록 발송일자
          </label>
          <input
            type="date"
            value={formData.카드미등록발송일자}
            onChange={(e) => onFormDataChange({ ...formData, 카드미등록발송일자: e.target.value })}
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
            카드등록일
          </label>
          <input
            type="date"
            value={formData.카드등록일}
            onChange={(e) => onFormDataChange({ ...formData, 카드등록일: e.target.value })}
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
            크레딧 충전일
          </label>
          <input
            type="date"
            value={formData.크레딧충전일}
            onChange={(e) => onFormDataChange({ ...formData, 크레딧충전일: e.target.value })}
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
            기관 어드민 링크
          </label>
          <input
            type="url"
            placeholder="https://admin.example.com"
            value={formData.기관어드민링크}
            onChange={(e) => onFormDataChange({ ...formData, 기관어드민링크: e.target.value })}
            style={{
              width: "100%",
              padding: "8px",
              border: "1px solid #ced4da",
              borderRadius: "4px",
              fontSize: "14px"
            }}
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
        {editingIndex !== null && (
          <button
            onClick={onCancel}
            disabled={loading}
            style={{
              padding: "10px 20px",
              backgroundColor: "#6c757d",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: loading ? "not-allowed" : "pointer",
              fontSize: "14px",
              fontWeight: "500",
              opacity: loading ? 0.6 : 1
            }}
          >
            취소
          </button>
        )}
        <button
          onClick={onSubmit}
          disabled={loading}
          style={{
            padding: "10px 20px",
            backgroundColor: "#198754",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: loading ? "not-allowed" : "pointer",
            fontSize: "14px",
            fontWeight: "500",
            opacity: loading ? 0.6 : 1
          }}
        >
          {editingIndex !== null ? "수정 완료" : "등록"}
        </button>
      </div>
    </div>
  );
};

export default CrmCustomerForm;
