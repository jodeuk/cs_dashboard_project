import React from "react";

// CSAT 질문 매핑
const CSAT_QUESTIONS = {
  "A-1": "상담원의 친절도는 어떠셨나요?",
  "A-2": "상담원이 문제 해결에 도움이 되었다고 느끼시나요?",
  "A-3": "상담 과정에 대해 개선점이나 의견이 있으시면 자유롭게 작성해 주세요.",
  "A-4": "플랫폼의 주요 기능의 작동과 안정성은 만족스러웠나요?",
  "A-5": "플랫폼의 디자인과 시각적 구성(화면 구성, 글자 크기, 버튼 크기 등)에 대해 어떻게 생각하시나요?",
  "A-6": "플랫폼에 대해 개선점이나 건의사항이 있으시면 작성해 주세요."
};

// 태그 칩 컴포넌트
const TagChips = ({ tags }) => {
  if (!tags) return null;

  const tagRows = [
    { label: "고객유형", a: tags.고객유형, b: tags.고객유형_2차 },
    { label: "문의유형", a: tags.문의유형, b: tags.문의유형_2차 },
    { label: "서비스유형", a: tags.서비스유형, b: tags.서비스유형_2차 },
  ].filter(({ a, b }) => (a && a.trim()) || (b && b.trim())); // 값 있는 것만

  if (!tagRows.length) return null;

  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
      {tagRows.map(({ label, a, b }) => {
        const segs = [label, a, b].filter(s => s && String(s).trim());
        const text = segs.join("/");
        return (
          <span
            key={label}
            style={{
              backgroundColor: "#e3f2fd",
              color: "#1976d2",
              padding: "2px 6px",
              borderRadius: 12,
              fontSize: 11,
              fontWeight: 500,
            }}
            title={text}
          >
            {text}
          </span>
        );
      })}
    </div>
  );
};

export default function CSatCommentsSection({ csatTextWithTags }) {
  if (!csatTextWithTags || csatTextWithTags.status !== "success") {
    return null;
  }

  return (
    <div
      style={{
        backgroundColor: "white",
        padding: "20px",
        borderRadius: "12px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
        marginBottom: "20px",
      }}
    >
      <h3 style={{ marginBottom: "16px", color: "#333", fontWeight: "600" }}>CSAT 상세 의견</h3>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
        {/* A-3 */}
        <div>
          <h4 style={{ marginBottom: "12px", color: "#007bff", fontWeight: "600" }}>
            A-3 · {CSAT_QUESTIONS["A-3"]} ({csatTextWithTags.comment_3?.total || csatTextWithTags.comment_3?.data?.length || 0}건)
          </h4>
          <div
            style={{
              maxHeight: "300px",
              overflowY: "auto",
              border: "1px solid #e0e0e0",
              borderRadius: "8px",
              padding: "12px",
            }}
          >
            {Array.isArray(csatTextWithTags.comment_3?.data) && csatTextWithTags.comment_3.data.length > 0
              ? csatTextWithTags.comment_3.data.map((item, index) => (
                <div
                  key={`${item.userId || "u"}-${item.firstAskedAt || index}-${index}`}
                  style={{
                    padding: "8px",
                    marginBottom: "8px",
                    backgroundColor: "#f8f9fa",
                    borderRadius: "6px",
                    borderLeft: "3px solid #007bff",
                  }}
                >
                  <div style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}>
                    {new Date(item.firstAskedAt ?? item.date ?? Date.now()).toLocaleDateString()} | User: {item.userId ?? item.user ?? item.personId ?? item.id ?? "-"}
                    {typeof item.score === "number" && ` | Score: ${item.score}`}
                  </div>
                  <TagChips tags={item.tags} />
                  <div style={{ fontSize: "14px", lineHeight: "1.4" }}>{item.text ?? item.comment ?? item.의견 ?? item.코멘트 ?? ""}</div>
                </div>
              ))
              : <div style={{ color: "#666", fontStyle: "italic" }}>데이터가 없습니다.</div>}
          </div>
        </div>

        {/* A-6 */}
        <div>
          <h4 style={{ marginBottom: "12px", color: "#28a745", fontWeight: "600" }}>
            A-6 · {CSAT_QUESTIONS["A-6"]} ({csatTextWithTags.comment_6?.total || csatTextWithTags.comment_6?.data?.length || 0}건)
          </h4>
          <div
            style={{
              maxHeight: "300px",
              overflowY: "auto",
              border: "1px solid #e0e0e0",
              borderRadius: "8px",
              padding: "12px",
            }}
          >
            {Array.isArray(csatTextWithTags.comment_6?.data) && csatTextWithTags.comment_6.data.length > 0
              ? csatTextWithTags.comment_6.data.map((item, index) => (
                <div
                  key={`${item.userId || "u"}-${item.firstAskedAt || index}-${index}`}
                  style={{
                    padding: "8px",
                    marginBottom: "8px",
                    backgroundColor: "#f8f9fa",
                    borderRadius: "6px",
                    borderLeft: "3px solid #28a745",
                  }}
                >
                  <div style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}>
                    {new Date(item.firstAskedAt ?? item.date ?? Date.now()).toLocaleDateString()} | User: {item.userId ?? item.user ?? item.personId ?? item.id ?? "-"}
                    {typeof item.score === "number" && ` | Score: ${item.score}`}
                  </div>
                  <TagChips tags={item.tags} />
                  <div style={{ fontSize: "14px", lineHeight: "1.4" }}>{item.text ?? item.comment ?? item.의견 ?? item.코멘트 ?? ""}</div>
                </div>
              ))
              : <div style={{ color: "#666", fontStyle: "italic" }}>데이터가 없습니다.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
