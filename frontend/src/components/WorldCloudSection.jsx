import React from "react";

function WordCloudSection({ params }) {
  // params: {start, end, 고객유형, 문의유형, ...}
  // 이미지 url 동적 생성 (백엔드에서 제공)
  const url = params ? require("../api").getWordCloudUrl(params) : null;
  return (
    <div>
      <h3>CS 워드클라우드</h3>
      {url ? (
        <img src={url} alt="CS 워드클라우드" style={{ width: 800, maxWidth: "100%" }} />
      ) : (
        <div>데이터 없음</div>
      )}
    </div>
  );
}

export default WordCloudSection;
