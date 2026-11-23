from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import subprocess
import json
import os
import sys

app = FastAPI(title="Dorokdok Data Science API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PY_SCRIPT = os.path.join(BASE_DIR, 'data_science.py')

# Fungsi pembantu untuk mengeksekusi data_science.py dan mengambil output JSON
def run_ds_script(args):
    try:
        # Menjalankan perintah: python data_science.py <args>
        result = subprocess.run(
            [sys.executable, PY_SCRIPT] + args,
            capture_output=True,
            text=True,
            cwd=BASE_DIR
        )
        if result.returncode != 0:
            print("Python Error:", result.stderr)
            raise HTTPException(status_code=500, detail="Gagal mengeksekusi model Data Science.")
        
        # data_science.py mencetak log di stderr dan output JSON di baris terakhir stdout
        output_lines = result.stdout.strip().split('\n')
        return json.loads(output_lines[-1])
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==========================================
# ENDPOINT API (KONTRAK FULL-STACK & DS)
# ==========================================

@app.get("/api/ds/insights")
def get_insights():
    # Menjalankan dashboard: preprocessing + generate json + grafik
    return run_ds_script([])

@app.get("/api/ds/grafik")
def get_grafik(jenis: str, days: int = None, kategori: str = None, channel: str = None, tipe: str = None):
    args = ["grafik", f"--jenis={jenis}"]
    if days: args.append(f"--days={days}")
    if kategori: args.append(f"--kategori={kategori}")
    if channel: args.append(f"--channel={channel}")
    if tipe: args.append(f"--tipe={tipe}")
    return run_ds_script(args)

@app.get("/api/ds/bandingkan")
def get_bandingkan(periode: str = "bulan", days: int = None):
    args = ["bandingkan", f"--periode={periode}"]
    if days: args.append(f"--days={days}")
    return run_ds_script(args)

@app.get("/api/ds/forecast")
def get_forecast(horizon: int = 14):
    return run_ds_script(["forecast", f"--horizon={horizon}"])

@app.get("/api/ds/anomali")
def get_anomali(top: int = 10, days: int = None):
    args = ["anomali", f"--top={top}"]
    if days: args.append(f"--days={days}")
    return run_ds_script(args)

@app.get("/api/ds/kesehatan")
def get_kesehatan():
    return run_ds_script(["kesehatan"])

@app.get("/api/ds/breakeven")
def get_breakeven():
    return run_ds_script(["breakeven"])

@app.get("/api/ds/kategori")
def get_kategori(nama: str):
    return run_ds_script(["kategori", f"--nama={nama}"])

@app.get("/api/ds/karyawan")
def get_karyawan():
    return run_ds_script(["karyawan"])

@app.get("/api/ds/cari")
def get_cari(days: int = None, kategori: str = None, channel: str = None, user: str = None, tipe: str = None, min_nominal: float = None, max_nominal: float = None, urut: str = None, limit: int = 10):
    args = ["cari", f"--limit={limit}"]
    if days: args.append(f"--days={days}")
    if kategori: args.append(f"--kategori={kategori}")
    if channel: args.append(f"--channel={channel}")
    if user: args.append(f"--user={user}")
    if tipe: args.append(f"--tipe={tipe}")
    if min_nominal is not None: args.append(f"--min={min_nominal}")
    if max_nominal is not None: args.append(f"--max={max_nominal}")
    if urut: args.append(f"--urut={urut}")
    return run_ds_script(args)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)