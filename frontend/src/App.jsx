import { useState } from "react";
import axios from "axios";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceDot
} from "recharts";

const API_URL = "http://localhost:8000";

export default function App() {
  const [file, setFile] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await axios.post(`${API_URL}/upload`, formData);
      setChartData(res.data.data);
      setStats({
        signal: res.data.signal,
        total: res.data.total_rows,
        anomalies: res.data.anomaly_count,
        mean: res.data.mean,
        std: res.data.std,
      });
    } catch (err) {
      setError("Upload failed. Check your CSV format.");
    } finally {
      setLoading(false);
    }
  };

  const anomalyPoints = chartData.filter(d => d.anomaly);

  return (
    <div style={{ fontFamily: "sans-serif", maxWidth: 900, margin: "40px auto", padding: "0 20px" }}>
      <h1 style={{ color: "#1a1a2e" }}>CAN Signal Dashboard</h1>
      <p style={{ color: "#555" }}>Upload a CSV of time-series or CAN data to visualize and detect anomalies.</p>

      {/* Upload Section */}
      <div style={{ display: "flex", gap: 12, margin: "24px 0" }}>
        <input
          type="file"
          accept=".csv"
          onChange={e => setFile(e.target.files[0])}
          style={{ padding: "8px", border: "1px solid #ccc", borderRadius: 6 }}
        />
        <button
          onClick={handleUpload}
          disabled={!file || loading}
          style={{
            padding: "8px 20px", backgroundColor: "#4f46e5",
            color: "white", border: "none", borderRadius: 6, cursor: "pointer"
          }}
        >
          {loading ? "Analyzing..." : "Upload & Analyze"}
        </button>
      </div>

      {error && <p style={{ color: "red" }}>{error}</p>}

      {/* Stats Cards */}
      {stats && (
        <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
          {[
            { label: "Signal", value: stats.signal },
            { label: "Total Rows", value: stats.total },
            { label: "Anomalies", value: stats.anomalies, alert: stats.anomalies > 0 },
            { label: "Mean", value: stats.mean },
            { label: "Std Dev", value: stats.std },
          ].map(card => (
            <div key={card.label} style={{
              padding: "12px 20px", borderRadius: 8, minWidth: 120, textAlign: "center",
              backgroundColor: card.alert ? "#fee2e2" : "#f1f5f9",
              border: card.alert ? "1px solid #fca5a5" : "1px solid #e2e8f0"
            }}>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>{card.label}</div>
              <div style={{ fontWeight: 600, color: card.alert ? "#dc2626" : "#1a1a2e" }}>{card.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Chart */}
      {chartData.length > 0 && (
        <div style={{ background: "#f8fafc", borderRadius: 12, padding: 24, border: "1px solid #e2e8f0" }}>
          <h3 style={{ margin: "0 0 16px", color: "#1a1a2e" }}>
            Signal: <span style={{ color: "#4f46e5" }}>{stats?.signal}</span>
            <span style={{ fontSize: 13, color: "#888", fontWeight: 400, marginLeft: 12 }}>
              🔴 = anomaly (&gt;2σ from mean)
            </span>
          </h3>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="time" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(val, name) => [val, name]}
                labelFormatter={l => `Time: ${l}`}
              />
              <Line
                type="monotone" dataKey="value"
                stroke="#4f46e5" dot={false} strokeWidth={1.5}
              />
              {anomalyPoints.map((point, i) => (
                <ReferenceDot
                  key={i} x={point.time} y={point.value}
                  r={4} fill="#dc2626" stroke="none"
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}