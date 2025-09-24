import React, { useMemo, useCallback } from "react";
import Select from "react-select";

export default function MultiSelect({ 
  options = [], 
  value = [], 
  onChange, 
  placeholder, 
  disabled = false,
  noOptionsText = "옵션이 없습니다"
}) {
  const safeValue = Array.isArray(value) ? value : (value ? [value] : []);
  const mappedOptions = useMemo(
    () => (options || []).map((o) => ({ label: String(o), value: String(o) })),
    [options]
  );
  const mappedValue = useMemo(
    () => safeValue.map((v) => ({ label: String(v), value: String(v) })),
    [safeValue]
  );
  const handleChange = useCallback(
    (vals) => onChange((Array.isArray(vals) ? vals : []).map((v) => v.value)),
    [onChange]
  );

  return (
    <Select
      isMulti
      options={mappedOptions}
      value={mappedValue}
      placeholder={placeholder}
      className="w-full text-sm"
      isDisabled={disabled}
      noOptionsMessage={() => noOptionsText}
      closeMenuOnSelect={false}      // ✅ 선택해도 닫지 않기
      hideSelectedOptions={false}    // ✅ 선택된 것도 계속 목록에 표시
      backspaceRemovesValue={false}
      menuPortalTarget={typeof document !== "undefined" ? document.body : null}
      styles={{ menuPortal: (b) => ({ ...b, zIndex: 9999 }), menu: (b) => ({ ...b, zIndex: 9999 }) }}
      onChange={handleChange}
    />
  );
}
