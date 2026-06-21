import { useState } from "react";
import axios from "axios";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceDot,
  ReferenceLine, ReferenceArea,
} from "recharts";

const API_URL = "http://localhost:8000";

const SIGNAL_DESCRIPTIONS = {
  vehicle_speed_kmh: "Vehicle speed in km/h. Anomalies indicate unexpected acceleration or deceleration.",
  engine_rpm: "Engine RPM. Spikes may indicate engine braking events or over-rev faults.",
  ebs_brake_pressure_bar: "EBS brake line pressure in bar. Spikes at cruise (non-braking) indicate valve faults or sensor glitches.",
  wheel_slip_pct: "Wheel slip percentage. Values >5% indicate ABS activation or loss of traction.",
  coolant_temp_c: "Engine coolant temperature in °C. Values >95°C indicate overtemp — possible grade climb or cooling fault.",
  turbo_boost_kpa: "Turbocharger boost pressure in kPa. Drops during cruise indicate underboost — possible engine derate.",
  exhaust_brake_active: "Exhaust brake engagement (0=off, 1=on). Active during deceleration events.",
};

const CustomTooltip = ({ active, payload, label, mean, std }) => {
  if (!active || !payload?.length) return null;
  const val = payload[0]?.value;
  const isAnomaly = Math.abs(val - mean) > 2 * std;
  const sigma = std > 0 ? ((val - mean) / std).toFixed(1) : "N/A";

  return (
    <div style={{
      background: "white", border: `1px solid ${isAnomaly ? "#dc2626" : "#e2e8f0"}`,
      borderRadius: 8, padding: "10px 14px", fontSize: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.1)"
    }}>
      <p style={{ margin: "0 0 4px", color: "#555" }}>Time: <b>{label}ms</b></p>
      <p style={{ margin: "0 0 4px", color: "#1a1a2e" }}>Value: <b>{val}</b></p>
      <p style={{ margin: "0 0 4px", color: "#555" }}>σ from mean: <b>{sigma}σ</b></p>
      {isAnomaly && (
        <p style={{ margin: "4px 0 0", color: "#dc2626", fontWeight: 600 }}>
          ⚠ Anomaly — exceeds 2σ threshold
        </p>
      )}
    </div>
  );
};

export default function App() {
  const [file, setFile] = useState(null);
  const [columns, setColumns] = useState([]);
  const [selectedSignal, setSelectedSignal] = useState("");
  const [chartData, setChartData] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [step, setStep] = useState(1);
  const [zoomLeft, setZoomLeft] = useState(null);
  const [zoomRight, setZoomRight] = useState(null);
  const [selecting, setSelecting] = useState(false);
  const [displayData, setDisplayData] = useState([]);
  const [isZoomed, setIsZoomed] = useState(false);

  const handleFileChange = async (e) => {
    const f = e.target.files[0];
    setFile(f);
    setColumns([]);
    setChartData([]);
    setDisplayData([]);
    setStats(null);
    setStep(1);
    setIsZoomed(false);
    const formData = new FormData();
    formData.append("file", f);
    try {
      const res = await axios.post(`${API_URL}/columns`, formData);
      setColumns(res.data.columns);
      setSelectedSignal(res.data.columns[0]);
      setStep(2);
    } catch {
      setError("Could not read columns from CSV.");
    }
  };

  const handleAnalyze = async () => {
    if (!file || !selectedSignal) return;
    setLoading(true);
    setError(null);
    setIsZoomed(false);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("signal", selectedSignal);
    try {
      const res = await axios.post(`${API_URL}/analyze`, formData);
      setChartData(res.data.data);
      setDisplayData(res.data.data);
      setStats({
        signal: res.data.signal,
        total: res.data.total_rows,
        anomalies: res.data.anomaly_count,
        mean: res.data.mean,
        std: res.data.std,
        min: res.data.min,
        max: res.data.max,
      });
      setStep(3);
    } catch {
      setError("Analysis failed. Check your CSV format.");
    } finally {
      setLoading(false);
    }
  };

  const handleMouseDown = (e) => {
    if (!e?.activeLabel) return;
    setZoomLeft(e.activeLabel);
    setZoomRight(null);
    setSelecting(true);
  };

  const handleMouseMove = (e) => {
    if (selecting && e?.activeLabel) setZoomRight(e.activeLabel);
  };

  const handleMouseUp = () => {
    if (selecting && zoomLeft && zoomRight && zoomLeft !== zoomRight) {
      const l = Math.min(Number(zoomLeft), Number(zoomRight));
      const r = Math.max(Number(zoomLeft), Number(zoomRight));
      const zoomed = chartData.filter(d => Number(d.time) >= l && Number(d.time) <= r);
      if (zoomed.length > 1) {
        setDisplayData(zoomed);
        setIsZoomed(true);
      }
    }
    setSelecting(false);
    setZoomLeft(null);
    setZoomRight(null);
  };

  const resetZoom = () => {
    setDisplayData(chartData);
    setIsZoomed(false);
  };

  const anomalyPoints = displayData.filter(d => d.anomaly);
  const upperBand = stats ? stats.mean + 2 * stats.std : null;
  const lowerBand = stats ? stats.mean - 2 * stats.std : null;

  return (
    <div style={{ fontFamily: "sans-serif", maxWidth: 980, margin: "0 auto", padding: "40px 20px" }}>

      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ color: "#1a1a2e", margin: "0 0 8px", fontSize: 28 }}>CAN Signal Dashboard</h1>
        <p style={{ color: "#64748b", margin: 0, fontSize: 14 }}>
          Upload a vehicle CAN log CSV, select a signal, and detect anomalies using z-score analysis.
        </p>
      </div>

      {/* Step 1 */}
      <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 20, marginBottom: 16 }}>
        <p style={{ margin: "0 0 12px", fontWeight: 600, color: "#1a1a2e" }}>① Upload CAN Log CSV</p>
        <input type="file" accept=".csv" onChange={handleFileChange}
          style={{ padding: "6px", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 13 }} />
        {columns.length > 0 && (
          <span style={{ marginLeft: 12, color: "#16a34a", fontSize: 13 }}>
            ✓ {columns.length} signals detected
          </span>
        )}
      </div>

      {/* Step 2 */}
      {step >= 2 && (
        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 20, marginBottom: 16 }}>
          <p style={{ margin: "0 0 12px", fontWeight: 600, color: "#1a1a2e" }}>② Select Signal to Analyze</p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
            {columns.map(col => (
              <button key={col} onClick={() => setSelectedSignal(col)} style={{
                padding: "7px 16px", borderRadius: 20, border: "1px solid",
                cursor: "pointer", fontSize: 12,
                backgroundColor: selectedSignal === col ? "#4f46e5" : "white",
                color: selectedSignal === col ? "white" : "#4f46e5",
                borderColor: "#4f46e5",
                fontWeight: selectedSignal === col ? 600 : 400,
              }}>{col}</button>
            ))}
          </div>
          {selectedSignal && SIGNAL_DESCRIPTIONS[selectedSignal] && (
            <p style={{
              margin: "0 0 16px", fontSize: 12, color: "#475569",
              background: "#eff6ff", border: "1px solid #bfdbfe",
              borderRadius: 6, padding: "8px 12px"
            }}>
              ℹ️ {SIGNAL_DESCRIPTIONS[selectedSignal]}
            </p>
          )}
          <button onClick={handleAnalyze} disabled={loading} style={{
            padding: "10px 28px", backgroundColor: "#4f46e5", color: "white",
            border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 14
          }}>
            {loading ? "Analyzing..." : "Analyze Signal"}
          </button>
        </div>
      )}

      {error && <p style={{ color: "red" }}>{error}</p>}

      {/* Step 3 */}
      {step === 3 && stats && (
        <div style={{ background: "#f8fafc", borderRadius: 12, padding: 24, border: "1px solid #e2e8f0" }}>

          {/* Chart header + inline stats */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, flexWrap: "wrap", gap: 12 }}>
            <div>
              <h3 style={{ margin: "0 0 4px", color: "#1a1a2e", fontSize: 16 }}>
                Signal: <span style={{ color: "#4f46e5" }}>{stats.signal}</span>
              </h3>
              <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
                Click and drag to zoom into a time range
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {[
                { label: "Rows", value: stats.total },
                { label: "Mean", value: stats.mean },
                { label: "Std Dev", value: stats.std },
                { label: "Min", value: stats.min },
                { label: "Max", value: stats.max },
              ].map(card => (
                <div key={card.label} style={{
                  padding: "6px 12px", borderRadius: 6, textAlign: "center",
                  backgroundColor: "#f1f5f9", border: "1px solid #e2e8f0"
                }}>
                  <div style={{ fontSize: 10, color: "#888" }}>{card.label}</div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "#1a1a2e" }}>{card.value}</div>
                </div>
              ))}
              <div style={{
                padding: "6px 12px", borderRadius: 6, textAlign: "center",
                backgroundColor: stats.anomalies > 0 ? "#fee2e2" : "#f1f5f9",
                border: stats.anomalies > 0 ? "1px solid #fca5a5" : "1px solid #e2e8f0"
              }}>
                <div style={{ fontSize: 10, color: "#888" }}>Anomalies</div>
                <div style={{ fontWeight: 700, fontSize: 13, color: stats.anomalies > 0 ? "#dc2626" : "#1a1a2e" }}>
                  {stats.anomalies}
                </div>
              </div>
              {isZoomed && (
                <button onClick={resetZoom} style={{
                  padding: "6px 14px", fontSize: 12, borderRadius: 6,
                  border: "1px solid #4f46e5", color: "#4f46e5",
                  background: "white", cursor: "pointer"
                }}>
                  ↺ Reset Zoom
                </button>
              )}
            </div>
          </div>

          {/* Legend */}
          <div style={{ display: "flex", gap: 20, marginBottom: 16, fontSize: 12, color: "#555", flexWrap: "wrap" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 24, height: 2, background: "#4f46e5", display: "inline-block" }} />
              Signal value
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#dc2626", display: "inline-block" }} />
              Anomaly — exceeds ±2σ from mean ({(stats.mean - 2 * stats.std).toFixed(2)} to {(stats.mean + 2 * stats.std).toFixed(2)})
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 24, height: 2, borderTop: "2px dashed #f59e0b", display: "inline-block" }} />
              ±2σ threshold
            </span>
          </div>

          {/* Chart */}
          <ResponsiveContainer width="100%" height={400}>
            <LineChart
              data={displayData}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              style={{ userSelect: "none", cursor: selecting ? "crosshair" : "default" }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd"
                label={{ value: "Time (ms)", position: "insideBottom", offset: -2, fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip content={<CustomTooltip mean={stats.mean} std={stats.std} />} />
              <ReferenceArea y1={lowerBand} y2={upperBand} fill="#4f46e5" fillOpacity={0.05} />
              <ReferenceLine y={stats.mean} stroke="#94a3b8" strokeDasharray="4 4"
                label={{ value: `mean ${stats.mean}`, position: "insideTopRight", fontSize: 10, fill: "#94a3b8" }} />
              <ReferenceLine y={upperBand} stroke="#f59e0b" strokeDasharray="4 4"
                label={{ value: `+2σ`, position: "insideTopRight", fontSize: 10, fill: "#f59e0b" }} />
              {lowerBand > 0 && (
                <ReferenceLine y={lowerBand} stroke="#f59e0b" strokeDasharray="4 4"
                  label={{ value: `-2σ`, position: "insideBottomRight", fontSize: 10, fill: "#f59e0b" }} />
              )}
              {selecting && zoomLeft && zoomRight && (
                <ReferenceArea x1={zoomLeft} x2={zoomRight} fill="#4f46e5" fillOpacity={0.1} />
              )}
              <Line type="monotone" dataKey="value"
                stroke="#4f46e5" dot={false} strokeWidth={1.5} />
              {anomalyPoints.map((point, i) => (
                <ReferenceDot key={i} x={point.time} y={point.value}
                  r={4} fill="#dc2626" stroke="white" strokeWidth={1} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}