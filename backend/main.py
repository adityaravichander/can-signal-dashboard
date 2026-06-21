from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import numpy as np
import io

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"status": "Volvo CAN Dashboard API is running"}

@app.post("/columns")
async def get_columns(file: UploadFile = File(...)):
    """Return list of numeric columns for the frontend dropdown"""
    contents = await file.read()
    df = pd.read_csv(io.BytesIO(contents))
    df.columns = df.columns.str.strip()
    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    # Remove timestamp column
    signal_cols = [c for c in numeric_cols if "time" not in c.lower() and "timestamp" not in c.lower()]
    return {"columns": signal_cols}

@app.post("/analyze")
async def analyze(file: UploadFile = File(...), signal: str = Form(...)):
    """Analyze a specific signal column for anomalies"""
    contents = await file.read()
    df = pd.read_csv(io.BytesIO(contents))
    df = df.dropna()
    df.columns = df.columns.str.strip()

    if signal not in df.columns:
        return {"error": f"Column '{signal}' not found"}

    time_col = df.columns[0]
    series = df[signal]

    mean = series.mean()
    std = series.std()
    df["anomaly"] = ((series - mean).abs() > 2 * std)

    # Summary stats
    anomaly_df = df[df["anomaly"] == True]

    chart_data = []
    for _, row in df.iterrows():
        chart_data.append({
            "time": str(row[time_col]),
            "value": round(float(row[signal]), 4),
            "anomaly": bool(row["anomaly"])
        })

    return {
        "signal": signal,
        "total_rows": len(df),
        "anomaly_count": int(df["anomaly"].sum()),
        "mean": round(mean, 4),
        "std": round(std, 4),
        "min": round(float(series.min()), 4),
        "max": round(float(series.max()), 4),
        "data": chart_data
    }