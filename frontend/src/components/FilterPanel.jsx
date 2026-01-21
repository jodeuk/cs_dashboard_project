import React, { useMemo, useRef, useEffect } from "react";
import MultiSelectDropdown from "./MultiSelectDropdown";

// ✅ 첫 진입 디폴트 선택값
const DEFAULT_PRESELECT = {
  "서비스유형": ["엘리스LXP", "엘리스클라우드"],
};

const FILTER_FIELDS = [
  { key: "서비스유형", label: "서비스유형" },
  { key: "서비스유형_2차", label: "서비스유형 (세부)", parent: "서비스유형", mapKey: "service" },
  { key: "문의유형", label: "문의유형" },
  { key: "문의유형_2차", label: "문의유형 (세부)", parent: "문의유형", mapKey: "inquiry" },
  { key: "고객유형", label: "고객유형" },
  { key: "고객유형_2차", label: "고객유형 (세부)", parent: "고객유형", mapKey: "customer" },
];

const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []);

// 원래 순서 유지하며 여러 리스트를 합치는 유틸
const mergeUnique = (...lists) => {
  const out = [];
  const seen = new Set();
  lists.forEach((ls) =>
    arr(ls).forEach((x) => {
      if (!seen.has(x)) { seen.add(x); out.push(x); }
    })
  );
  return out;
};

const FilterPanel = ({ options = {}, values, setValues }) => {
  const subtypeMaps = options?.subtype_maps || {};
  // 필드별로 "직전 렌더에서 보이던 옵션"을 기억해 두었다가, 목록 축소를 방지
  const prevOptsRef = useRef({});
  const preselectDoneRef = useRef(false); // ✅ 최초 1회만 기본선택 주입

  // ✅ 옵션이 실제 로드된 뒤(빈 배열 아님)에만 기본값 주입
  useEffect(() => {
    if (preselectDoneRef.current) return;
    const src = (options?.["서비스유형"] || []).filter((x) => x !== "전체");
    if (src.length === 0) return;
    const cur = Array.isArray(values?.["서비스유형"]) ? values["서비스유형"] : [];
    if (cur.length === 0) {
      setValues((prev) => ({
        ...prev,
        ["서비스유형"]: ["엘리스LXP", "엘리스클라우드"].filter(v => src.includes(v)),
      }));
    }
    preselectDoneRef.current = true;
  }, [options, setValues]); // ❗ values 의존성 제거

  const getSubtypeUnion = (mapKey, parents) => {
    const m = subtypeMaps?.[mapKey] || {};
    const set = new Set();
    arr(parents).forEach((p) => {
      (m[p] || []).forEach((x) => x !== "전체" && set.add(x));
    });
    return Array.from(set).sort();
  };

  const fieldOptions = useMemo(() => {
    const base = {};
    FILTER_FIELDS.forEach((f) => {
      const prev = prevOptsRef.current?.[f.key] || [];
      if (!f.parent) {
        const raw = (options[f.key] || []).filter((x) => x !== "전체");
        base[f.key] = mergeUnique(prev, raw);
      } else {
        const parents = arr(values[f.parent]);
        const hasParent = parents.length > 0;
        const union = hasParent
          ? getSubtypeUnion(f.mapKey, parents)
          : (options[f.key] || []).filter((x) => x !== "전체");
        base[f.key] = hasParent ? union : mergeUnique(prev, union);
      }
    });
    return base;
  }, [options, values, subtypeMaps]);

  // 새로 계산된 옵션을 스냅샷으로 저장 (다음 렌더에서 "이전 옵션"으로 사용)
  useEffect(() => {
    prevOptsRef.current = fieldOptions;
  }, [fieldOptions]);

  const sanitizeChild = (state, parentKey, childKey, mapKey) => {
    if (!childKey) return state;
    const allowed = getSubtypeUnion(mapKey, state[parentKey] || []);
    return {
      ...state,
      [childKey]: arr(state[childKey]).filter((v) => allowed.includes(v)),
    };
  };

  return (
    <div style={{ backgroundColor:"#f8f9fa", padding:16, borderRadius:8, marginBottom:20 }}>
      {/* 기존 필터들 */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))", gap:16 }}>
      {FILTER_FIELDS.map((field) => {
        const isChild = !!field.parent;
        const currentValue = arr(values[field.key]);
        const opts = fieldOptions[field.key] || [];

        const onChange = (nextArr) => {
          if (!isChild) {
            const child = FILTER_FIELDS.find((f) => f.parent === field.key);
            setValues((prev) => {
              const next = { ...prev, [field.key]: nextArr };
              return child ? sanitizeChild(next, field.key, child.key, child.mapKey) : next;
            });
          } else {
            setValues((prev) => ({ ...prev, [field.key]: nextArr }));
          }
        };

        return (
          <div key={field.key}>
            <label style={{ display:"block", marginBottom:4, fontWeight:"bold" }}>{field.label}</label>
            <MultiSelectDropdown
              options={opts}
              value={currentValue}
              onChange={onChange}
              placeholder="전체"
            />
          </div>
        );
      })}
      </div>
    </div>
  );
};

export default FilterPanel;