/* 
import React, { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { Line } from "react-chartjs-2";
import { Chart as ChartJS, LineElement, CategoryScale, LinearScale, PointElement, Legend, Tooltip } from "chart.js";

ChartJS.register(LineElement, CategoryScale, LinearScale, PointElement, Legend, Tooltip);

const EliceTrackItemTrendChart = ({ file }) => {
  const [chartData, setChartData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });

        const mergedRows = [];

        workbook.SheetNames.forEach((sheetName) => {
          const sheet = workbook.Sheets[sheetName];
          const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
          if (!raw || raw.length < 2) return;

          const headerIndex = raw.findIndex(row =>
            row.some(cell => typeof cell === "string" && /주차|챕터|chapter|week/i.test(cell))
          );
          if (headerIndex === -1) return;

          const headers = raw[headerIndex];
          const dataRows = raw.slice(headerIndex + 1);
          const json = dataRows.map(row => {
            const obj = {};
            headers.forEach((h, i) => { obj[h] = row[i]; });
            return obj;
          });

          const weekKey = headers.find(h => typeof h === "string" && /주차|챕터|chapter|week/i.test(h));
          if (!weekKey) return;

          const contentKey = headers.find(h =>
            typeof h === "string" &&
            /(콘텐츠|컨텐츠|자료|강의|만족도)/.test(h) &&
            !/코치|멘토|강사/.test(h)
          );
          const coachKey = headers.find(h =>
            typeof h === "string" &&
            /(코치|멘토|강사|지도|참여도|적극성|질의응답)/.test(h)
          );

          if (!contentKey && !coachKey) return;

          json.forEach((row) => {
            const rawLabel = row[weekKey];
            if (!rawLabel) return;

            let label = typeof rawLabel === "number"
              ? `${Math.floor(rawLabel)}주차`
              : typeof rawLabel === "string" && /주차/.test(rawLabel)
              ? rawLabel
              : `${rawLabel}`;

            const contentVal = contentKey ? parseFloat(row[contentKey]) : null;
            const coachVal = coachKey ? parseFloat(row[coachKey]) : null;

            mergedRows.push({
              label,
              content: !isNaN(contentVal) ? contentVal : null,
              coach: !isNaN(coachVal) ? coachVal : null,
            });
          });
        });

        if (mergedRows.length === 0) return setError("유효한 데이터를 찾지 못했습니다.");

        // 중복 제거 및 정렬
        const uniqueLabels = Array.from(new Set(mergedRows.map(r => r.label))).sort((a, b) => {
          const getNum = (v) => parseInt(String(v).replace(/[^\d]/g, '')) || 0;
          return getNum(a) - getNum(b);
        });

        const contentScores = uniqueLabels.map(label => {
          const entry = mergedRows.find(r => r.label === label && r.content !== null);
          return entry ? entry.content : null;
        });

        const coachScores = uniqueLabels.map(label => {
          const entry = mergedRows.find(r => r.label === label && r.coach !== null);
          return entry ? entry.coach : null;
        });

        const datasets = [];

        if (contentScores.some(v => v !== null)) {
          datasets.push({
            label: "자료 만족도",
            data: contentScores,
            borderColor: "#007bff",
            backgroundColor: "rgba(0, 123, 255, 0.1)",
            fill: false,
            tension: 0.1,
            pointRadius: 4,
            pointHoverRadius: 6,
          });
        }

        if (coachScores.some(v => v !== null)) {
          datasets.push({
            label: "코치 만족도",
            data: coachScores,
            borderColor: "#28a745",
            backgroundColor: "rgba(40, 167, 69, 0.1)",
            fill: false,
            tension: 0.1,
            pointRadius: 4,
            pointHoverRadius: 6,
          });
        }

        if (datasets.length === 0) return setError("표시할 수 있는 만족도 데이터가 없습니다.");

        setChartData({ labels: uniqueLabels, datasets });
      } catch (err) {
        console.error(err);
        setError("파일 처리 중 오류가 발생했습니다.");
      }
    };
    reader.readAsArrayBuffer(file);
  }, [file]);

  return (
    <div style={{ marginTop: 20 }}>
      <h3 style={{ marginBottom: 16 }}>📊 통합 만족도 추이 (이론주간 + 프로젝트주간)</h3>
      {error && <div style={{ color: "red", marginTop: 20 }}>⚠️ {error}</div>}
      {chartData && (
        <div style={{ height: "460px", width: "100%" }}>
          <Line
            data={chartData}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  position: "top",
                  labels: {
                    usePointStyle: true,
                    padding: 20,
                  },
                },
                tooltip: {
                  mode: "index",
                  intersect: false,
                },
              },
              scales: {
                y: {
                  min: 0,
                  max: 5,
                  ticks: {
                    stepSize: 0.5,
                    callback: (v) => v.toFixed(1),
                  },
                  title: {
                    display: true,
                    text: "점수",
                    font: {
                      size: 12,
                      weight: "bold",
                    },
                  },
                  grid: {
                    color: "rgba(0,0,0,0.1)",
                  },
                },
                x: {
                  title: {
                    display: true,
                    text: "주차",
                    font: {
                      size: 12,
                      weight: "bold",
                    },
                  },
                  grid: {
                    color: "rgba(0,0,0,0.1)",
                  },
                },
              },
              interaction: {
                intersect: false,
                mode: "index",
              },
            }}
          />
        </div>
      )}
      {!error && !chartData && <div>📊 데이터를 불러오는 중입니다...</div>}
    </div>
  );
};

export default EliceTrackItemTrendChart;
*/
