import React from "react";
import { Line } from "react-chartjs-2";

function ChartSection({ data, label, xLabel, yLabel }) {
  // data: [{x축, 문의량}], label: "CS 문의량"
  const chartData = {
    labels: data.map((d) => d.x축),
    datasets: [
      {
        label: label || "",
        data: data.map((d) => d.문의량),
        borderColor: "#36a2eb",
        backgroundColor: "rgba(54,162,235,0.1)",
        fill: true,
        tension: 0.3,
        pointRadius: 4,
      },
    ],
  };
  return (
    <div style={{ margin: "24px 0" }}>
      <Line
        data={chartData}
        options={{
          plugins: {
            legend: { display: !!label },
          },
          scales: {
            x: { title: { display: true, text: xLabel || "" } },
            y: { title: { display: true, text: yLabel || "" }, beginAtZero: true },
          },
        }}
      />
    </div>
  );
}

export default ChartSection;
