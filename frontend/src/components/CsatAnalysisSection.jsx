import React from 'react';

const CsatAnalysisSection = ({ data, loading }) => {
  if (loading) {
    return (
      <div style={{
        backgroundColor: '#fff',
        padding: '20px',
        borderRadius: '8px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        marginBottom: '20px'
      }}>
        <h3 style={{ margin: '0 0 16px 0', color: '#333' }}>
          📊 CSAT 분석
        </h3>
        <div style={{ textAlign: 'center', color: '#666' }}>
          🔄 데이터를 불러오는 중...
        </div>
      </div>
    );
  }

  if (!data || !data.평균점수 || data.평균점수.length === 0) {
    return (
      <div style={{
        backgroundColor: '#fff',
        padding: '20px',
        borderRadius: '8px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        marginBottom: '20px'
      }}>
        <h3 style={{ margin: '0 0 16px 0', color: '#333' }}>
          📊 CSAT 분석
        </h3>
        <div style={{ textAlign: 'center', color: '#666' }}>
          {data?.message || 'CSAT 데이터가 없습니다. Excel 파일을 업로드해주세요.'}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      backgroundColor: '#fff',
      padding: '20px',
      borderRadius: '8px',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      marginBottom: '20px'
    }}>
      <h3 style={{ margin: '0 0 16px 0', color: '#333' }}>
        📊 CSAT 분석
      </h3>

      {/* 평균 점수 */}
      <div style={{ marginBottom: '24px' }}>
        <h4 style={{ margin: '0 0 12px 0', color: '#555' }}>평균 점수</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          {data.평균점수.map((item, index) => (
            <div key={index} style={{
              padding: '12px',
              backgroundColor: '#f8f9fa',
              borderRadius: '6px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#007bff' }}>
                {item.평균점수.toFixed(2)}
              </div>
              <div style={{ fontSize: '14px', color: '#666', marginTop: '4px' }}>
                {item.문항}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 월별 트렌드 */}
      {data.월별트렌드 && Object.keys(data.월별트렌드).length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <h4 style={{ margin: '0 0 12px 0', color: '#555' }}>월별 트렌드</h4>
          {Object.entries(data.월별트렌드).map(([question, trendData]) => (
            <div key={question} style={{ marginBottom: '16px' }}>
              <h5 style={{ margin: '0 0 8px 0', color: '#666', fontSize: '14px' }}>
                {question}
              </h5>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {trendData.map((item, index) => (
                  <div key={index} style={{
                    padding: '6px 12px',
                    backgroundColor: '#e3f2fd',
                    borderRadius: '4px',
                    fontSize: '12px',
                    color: '#1976d2'
                  }}>
                    {item.월}월: {item[question]?.toFixed(2) || 'N/A'}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 문항 목록 */}
      {data.문항목록 && data.문항목록.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <h4 style={{ margin: '0 0 12px 0', color: '#555' }}>분석된 문항</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {data.문항목록.map((question, index) => (
              <span key={index} style={{
                padding: '4px 8px',
                backgroundColor: '#f0f0f0',
                borderRadius: '4px',
                fontSize: '12px',
                color: '#666'
              }}>
                {question}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 텍스트 응답 */}
      {data.텍스트응답 && Object.keys(data.텍스트응답).length > 0 && (
        <div>
          <h4 style={{ margin: '0 0 12px 0', color: '#555' }}>텍스트 응답</h4>
          {Object.entries(data.텍스트응답).map(([question, responses]) => (
            <div key={question} style={{ marginBottom: '16px' }}>
              <h5 style={{ margin: '0 0 8px 0', color: '#666', fontSize: '14px' }}>
                {question}
              </h5>
              <div style={{ 
                maxHeight: '200px', 
                overflowY: 'auto', 
                backgroundColor: '#f8f9fa', 
                padding: '12px', 
                borderRadius: '6px',
                fontSize: '13px'
              }}>
                {responses.slice(0, 10).map((response, index) => (
                  <div key={index} style={{ 
                    marginBottom: '8px', 
                    padding: '8px', 
                    backgroundColor: 'white', 
                    borderRadius: '4px',
                    border: '1px solid #e9ecef'
                  }}>
                    "{response}"
                  </div>
                ))}
                {responses.length > 10 && (
                  <div style={{ 
                    textAlign: 'center', 
                    color: '#666', 
                    fontSize: '12px',
                    marginTop: '8px'
                  }}>
                    ... 외 {responses.length - 10}개 응답
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CsatAnalysisSection; 