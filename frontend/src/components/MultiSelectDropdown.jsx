import React, { useState, useRef, useEffect } from "react";

export default function MultiSelectDropdown({
  options = [],          // ["A","B","C"]  (항상 '전체' 제외해서 전달)
  value = [],            // 선택값 배열
  onChange,              // (nextArray)=>void
  placeholder = "전체",
  width = "100%",
  maxTagCount = 2,
  /** 선택 후에도 메뉴가 줄지 않게: 현재 options ∪ value 로 즉시 구성 */
  stickyOptions = true,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const userAllRef = useRef(false); // 사용자가 직접 '전체'를 클릭했는지 추적

  // ✅ 누적 스냅샷 대신, 그때그때 options ∪ value (중복 제거, 기존 순서 보존)
  const displayOptions = (() => {
    const base = Array.isArray(options) ? options : [];
    if (!stickyOptions) return base;
    const set = new Set(base);
    (Array.isArray(value) ? value : []).forEach(v => { if (!set.has(v)) set.add(v); });
    // 원래 options 순서를 먼저, 선택값 중 options에 없던 것만 뒤에
    const extras = (Array.isArray(value) ? value : []).filter(v => !base.includes(v));
    return [...base, ...extras];
  })();

  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const toggleItem = (opt) => {
    const set = new Set(value || []);
    set.has(opt) ? set.delete(opt) : set.add(opt);
    onChange(Array.from(set));
  };

  // ✅ '전체' 토글 계산
  const allOptions = (options || []).filter(Boolean);
  const allSelectedLogical =
    Array.isArray(value) && value.length > 0 && value.length === allOptions.length;
  
  // ✅ '전체'는 오직 사용자가 직접 누른 경우에만 체크됨
  const allSelectedVisual = userAllRef.current;
  
  const handleToggleAll = () => {
    userAllRef.current = !allSelectedLogical; // 사용자가 직접 클릭했음을 표시
    onChange(allSelectedLogical ? [] : allOptions);
  };

  const clearAll = () => {
    userAllRef.current = false; // 전체 해제 시 플래그도 리셋
    onChange([]);
  };

  // ✅ 전체 선택이 풀리면 전체 체크 플래그도 해제
  useEffect(() => {
    if (!allSelectedLogical) userAllRef.current = false;
  }, [allSelectedLogical, value]);

  // ✅ 선택 요약: 모두 선택이면 '전체'로 표기
  const label =
    allSelectedLogical
      ? "전체"
      : value && value.length
      ? value.length <= maxTagCount
        ? value.join(", ")
        : `${value.slice(0, maxTagCount).join(", ")} 외 ${value.length - maxTagCount}`
      : placeholder;

  return (
    <div ref={ref} style={{ position: "relative", width }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%", padding: "8px", border: "1px solid #ddd",
          borderRadius: 4, textAlign: "left", background: "#fff"
        }}
      >
        {label}
        <span style={{ float: "right", opacity: 0.6 }}>▾</span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute", zIndex: 100, top: "110%", left: 0, right: 0,
            background: "#fff", border: "1px solid #ddd", borderRadius: 6,
            maxHeight: 280, overflow: "auto", boxShadow: "0 6px 16px rgba(0,0,0,.12)"
          }}
        >
          <div
            style={{
              padding: 8, borderBottom: "1px solid #eee",
              display: "flex", justifyContent: "space-between", alignItems: "center"
            }}
          >
            <span style={{ fontSize: 12, color: "#666" }}>
              {value.length ? `${value.length}개 선택됨` : "선택하세요"}
            </span>
            {value.length > 0 && (
              <button
                onClick={clearAll}
                style={{ fontSize: 12, border: "none", background: "transparent", color: "#007bff", cursor: "pointer" }}
              >
                전체 해제
              </button>
            )}
          </div>

          <ul style={{ listStyle: "none", margin: 0, padding: 8 }}>
            {/* ✅ 맨 위에 '전체' 항목 추가 */}
            <li
              style={{ 
                padding: "6px 4px", 
                display: "flex", 
                gap: 8, 
                alignItems: "center", 
                cursor: "pointer",
                fontWeight: allSelectedVisual ? 600 : 400,
                backgroundColor: allSelectedVisual ? "#f0f8ff" : "transparent"
              }}
              onClick={handleToggleAll}
              title="전체 선택/해제"
            >
              <input type="checkbox" readOnly checked={allSelectedVisual} />
              <span style={{ fontSize: 14 }}>전체</span>
            </li>
            <li style={{ height: 8, borderBottom: "1px solid #eee", margin: "4px 0" }} />
            {(displayOptions || []).map((opt) => (
              <li
                key={opt}
                style={{ padding: "6px 4px", display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}
                onClick={() => toggleItem(opt)}
                title={opt}
              >
                <input type="checkbox" readOnly checked={value?.includes(opt)} />
                <span style={{ fontSize: 14 }}>{opt}</span>
              </li>
            ))}
            {(!displayOptions || displayOptions.length === 0) && (
              <li style={{ padding: 8, fontSize: 12, color: "#888" }}>옵션 없음</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
