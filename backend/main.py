from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import numpy as np
import io

app = FastAPI()

# allow React frontend to talk to this backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")

def root():
    return {"status": "CAN Dashboard API is running "}

@app.post("/upload")

async def upload_csv(file: UploadFile = File(...)):
    # Read uploaded CSV into pandas
    contents = await file.read()
    df = pd.read_csv(io.BytesIO(contents))

    # --- Clean --- 
    df = df.dropna()                        # drop rows with missing values
    df.columns = df.columns.str.strip()     # remove whitespace from column names

    # --- Detect numeric columns  --- 
    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()

    if not numeric_cols:
        return {"error": "No numeric columns found in CSV"}

    # --- Pick first numeric column as signal to analyze --- 
    time_col = df.columns[0]
    signal_col = numeric_cols[1] if len(numeric_cols) > 1 else numeric_cols[0]      

    # --- Anomaly detection (z-score threshold) --- 
    mean = df[signal_col].mean()
    std = df[signal_col].std()
    df["anomaly"] = ((df[signal_col] - mean).abs() > 2 * std)

    # -- Build response ---
    chart_data = []
    for _, row in df.iterrows():
        chart_data.append({
            "time": str(row[time_col]),
            "value": round(float(row[signal_col]), 4),
            "anomaly": bool(row["anomaly"])
        })

    return {
        "signal": signal_col,
        "total_rows": len(df),
        "anomaly_count": int(df["anomaly"].sum()),
        "mean": round(mean, 4),
        "std": round(std, 4),
        "data": chart_data
    }

