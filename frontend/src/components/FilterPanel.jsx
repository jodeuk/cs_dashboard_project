import React, { useMemo, useRef, useEffect } from "react";
import MultiSelectDropdown from "./MultiSelectDropdown";

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
        // ✅ 이전에 보이던 옵션 + 현재 원천 옵션 + 현재 선택값 모두 유지
        base[f.key] = mergeUnique(prev, raw, values[f.key]);
      } else {
        const parents = values[f.parent] || [];
        const hasParent = Array.isArray(parents) && parents.length > 0;
        const union = hasParent
          ? getSubtypeUnion(f.mapKey, parents)
          : (options[f.key] || []).filter((x) => x !== "전체");

        // ✅ 자식도 동일: 이전 옵션 + 부모합집합 + 선택값
        base[f.key] = mergeUnique(prev, union, values[f.key]);
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
    <div style={{ backgroundColor:"#f8f9fa", padding:16, borderRadius:8, marginBottom:20,
                  display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))", gap:16 }}>
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
  );
};

export default FilterPanel;