import React, { useState, useEffect } from 'react';
import { fetchCacheStatus, clearCache, refreshCache } from '../api';

const CacheStatusSection = ({ start, end }) => {
  const [cacheStatus, setCacheStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadCacheStatus = async () => {
    try {
      setLoading(true);
      setError(null);
      const status = await fetchCacheStatus();
      setCacheStatus(status);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClearCache = async () => {
    if (!window.confirm('모든 캐시를 삭제하시겠습니까?')) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await clearCache();
      await loadCacheStatus();
      alert('캐시가 성공적으로 삭제되었습니다.');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshCache = async () => {
    try {
      setLoading(true);
      setError(null);
      await refreshCache(start, end);
      await loadCacheStatus();
      alert('캐시가 성공적으로 새로고침되었습니다.');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCacheStatus();
  }, []);

  if (loading) {
    return (
      <div style={{
        backgroundColor: "#f8f9fa",
        padding: "16px",
        borderRadius: "8px",
        marginBottom: "20px",
        textAlign: "center"
      }}>
        캐시 상태를 불러오는 중...
      </div>
    );
  }

  return (
    <div style={{
      backgroundColor: "white",
      padding: "20px",
      borderRadius: "8px",
      marginBottom: "20px",
      boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
    }}>
      <h3 style={{ marginBottom: "16px", color: "#333" }}>캐시 상태</h3>
      
      {error && (
        <div style={{
          backgroundColor: "#ffebee",
          color: "#c62828",
          padding: "12px",
          borderRadius: "4px",
          marginBottom: "16px"
        }}>
          ❌ {error}
        </div>
      )}

      {cacheStatus && (
        <div>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "16px",
            marginBottom: "16px"
          }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "20px", fontWeight: "bold", color: "#007bff" }}>
                {cacheStatus.cache_files}
              </div>
              <div style={{ fontSize: "14px", color: "#666" }}>캐시 파일 수</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "20px", fontWeight: "bold", color: "#28a745" }}>
                {cacheStatus.total_size_mb} MB
              </div>
              <div style={{ fontSize: "14px", color: "#666" }}>캐시 크기</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "20px", fontWeight: "bold", color: "#ffc107" }}>
                {cacheStatus.cache_enabled ? "활성화" : "비활성화"}
              </div>
              <div style={{ fontSize: "14px", color: "#666" }}>캐시 상태</div>
            </div>
          </div>

          {cacheStatus.files && cacheStatus.files.length > 0 && (
            <div style={{ marginBottom: "16px" }}>
              <h4 style={{ marginBottom: "8px", color: "#666" }}>캐시 파일 목록:</h4>
              <div style={{
                maxHeight: "200px",
                overflowY: "auto",
                backgroundColor: "#f8f9fa",
                padding: "12px",
                borderRadius: "4px"
              }}>
                {cacheStatus.files.map((file, index) => (
                  <div key={index} style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "4px 0",
                    borderBottom: index < cacheStatus.files.length - 1 ? "1px solid #eee" : "none"
                  }}>
                    <span style={{ fontSize: "12px", color: "#666" }}>{file.filename}</span>
                    <span style={{ fontSize: "12px", color: "#999" }}>{file.size_mb} MB</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{
            display: "flex",
            gap: "12px",
            justifyContent: "center"
          }}>
            <button
              onClick={handleClearCache}
              disabled={loading}
              style={{
                backgroundColor: "#dc3545",
                color: "white",
                border: "none",
                padding: "8px 16px",
                borderRadius: "4px",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.6 : 1
              }}
            >
              {loading ? "처리 중..." : "캐시 삭제"}
            </button>
            <button
              onClick={handleRefreshCache}
              disabled={loading}
              style={{
                backgroundColor: "#007bff",
                color: "white",
                border: "none",
                padding: "8px 16px",
                borderRadius: "4px",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.6 : 1
              }}
            >
              {loading ? "처리 중..." : "캐시 새로고침"}
            </button>
            <button
              onClick={loadCacheStatus}
              disabled={loading}
              style={{
                backgroundColor: "#6c757d",
                color: "white",
                border: "none",
                padding: "8px 16px",
                borderRadius: "4px",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.6 : 1
              }}
            >
              {loading ? "처리 중..." : "상태 새로고침"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CacheStatusSection; 