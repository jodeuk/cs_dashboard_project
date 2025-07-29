import React, { useState } from 'react';

const CsatUploadSection = ({ onUploadSuccess }) => {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      // Excel 파일 확장자 확인
      if (selectedFile.name.endsWith('.xlsx') || selectedFile.name.endsWith('.xls')) {
        setFile(selectedFile);
        setUploadStatus(null);
      } else {
        setUploadStatus({
          type: 'error',
          message: 'Excel 파일(.xlsx, .xls)만 업로드 가능합니다.'
        });
        setFile(null);
      }
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setUploadStatus({
        type: 'error',
        message: '파일을 선택해주세요.'
      });
      return;
    }

    setUploading(true);
    setUploadStatus(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload-csat', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (response.ok) {
        setUploadStatus({
          type: 'success',
          message: `${result.message} (${result.rows}행, ${result.columns.length}컬럼)`
        });
        if (onUploadSuccess) {
          onUploadSuccess();
        }
      } else {
        setUploadStatus({
          type: 'error',
          message: result.detail || '업로드에 실패했습니다.'
        });
      }
    } catch (error) {
      setUploadStatus({
        type: 'error',
        message: `업로드 중 오류가 발생했습니다: ${error.message}`
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{
      backgroundColor: '#fff',
      padding: '20px',
      borderRadius: '8px',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      marginBottom: '20px'
    }}>
      <h3 style={{ margin: '0 0 16px 0', color: '#333' }}>
        📊 CSAT 데이터 업로드
      </h3>
      
      <div style={{ marginBottom: '16px' }}>
        <p style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#666' }}>
          CSAT 설문조사 결과 Excel 파일을 업로드하세요.
        </p>
        <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#999' }}>
          • 지원 형식: .xlsx, .xls<br/>
          • firstAskedAt 컬럼이 포함되어야 합니다<br/>
          • A-1, A-2, A-4, A-5: 점수 컬럼 (1-5 범위)<br/>
          • A-3, A-6: 텍스트 응답 컬럼
        </p>
      </div>

      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px' }}>
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileChange}
          style={{
            padding: '8px',
            border: '1px solid #ddd',
            borderRadius: '4px',
            fontSize: '14px'
          }}
        />
        
        <button
          onClick={handleUpload}
          disabled={!file || uploading}
          style={{
            padding: '8px 16px',
            backgroundColor: file && !uploading ? '#007bff' : '#ccc',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: file && !uploading ? 'pointer' : 'not-allowed',
            fontSize: '14px'
          }}
        >
          {uploading ? '업로드 중...' : '업로드'}
        </button>
      </div>

      {uploadStatus && (
        <div style={{
          padding: '12px',
          borderRadius: '4px',
          backgroundColor: uploadStatus.type === 'success' ? '#d4edda' : '#f8d7da',
          color: uploadStatus.type === 'success' ? '#155724' : '#721c24',
          fontSize: '14px'
        }}>
          {uploadStatus.type === 'success' ? '✅ ' : '❌ '}
          {uploadStatus.message}
        </div>
      )}
    </div>
  );
};

export default CsatUploadSection; 