# -*- coding: utf-8 -*-
"""
DATA SCIENCE ENGINE - Asisten Bisnis Dorokdok
=============================================
Alur data:
    transactions.csv --> [PREPROCESSING] --> data bersih --> analisis --> insights.json --> RAG AI

Tahap PREPROCESSING (wajib dijalankan sebelum data dipakai model AI):
    1. Validasi skema kolom
    2. Normalisasi teks & deteksi token kosong ("NULL", "-", "nan", dll)
    3. Standarisasi kategori (tipe, metode bayar, channel, kapitalisasi)
    4. Konversi tipe data (tanggal, nominal Rupiah)
    5. Pembuangan data tidak valid (tanggal rusak, tanggal di masa depan, nominal <= 0, tipe asing)
    6. Pembuangan data duplikat
    7. Penanganan missing value (imputasi sesuai konteks)
    8. Deteksi outlier (IQR + robust z-score) -> ditandai, tidak dibuang
    9. Feature engineering (bulan, minggu, hari, akhir pekan, dll)
   10. Normalisasi/skala nominal (log, z-score, min-max)
   11. Skor kualitas data

Cara pakai (semua output = JSON di stdout, log di stderr):
    python data_science.py                       -> dashboard: preprocessing + insights.json + semua grafik
    python data_science.py --days 7              -> (kompatibel lama) grafik tren 7 hari
    python data_science.py grafik --jenis heatmap --days 60
    python data_science.py grafik --jenis gabungan --days 10   -> pemasukan + pengeluaran + garis laba
    python data_science.py bandingkan --periode bulan
    python data_science.py forecast --horizon 14
    python data_science.py anomali --top 10
    python data_science.py kesehatan
    python data_science.py breakeven
    python data_science.py kategori --nama "Bahan Baku"
    python data_science.py karyawan
    python data_science.py cari --tipe pengeluaran --min 500000 --limit 10
    python data_science.py preprocessing
"""
import argparse
import glob
import json
import math
import os
import re
import sys
import time
import traceback
from types import SimpleNamespace

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter

# ----------------------------------------------------------------------------
# KONFIGURASI
# ----------------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.environ.get('DS_CSV', os.path.join(BASE_DIR, 'transactions.csv'))
OUT_PATH = os.path.join(BASE_DIR, 'insights.json')
CLEAN_PATH = os.path.join(BASE_DIR, 'transactions_clean.csv')
CHARTS_DIR = os.path.join(BASE_DIR, 'uploads', 'charts')
BASE_URL = os.environ.get('CHART_BASE_URL', 'http://localhost:5000').rstrip('/')

HARI = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu']
BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus',
         'September', 'Oktober', 'November', 'Desember']
BULAN_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

GREEN, RED, BLUE, AMBER, PURPLE, GRAY, TEAL = '#10b981', '#ef4444', '#3b82f6', '#f59e0b', '#8b5cf6', '#9ca3af', '#14b8a6'
PALETTE = [BLUE, AMBER, PURPLE, TEAL, RED, '#ec4899', '#84cc16', GRAY]

NULL_TOKENS = {'', 'null', 'none', 'nan', 'n/a', 'na', '-', '--', 'undefined', 'nil'}
REQUIRED_COLS = ['date', 'type', 'amount']
TEXT_COLS = ['sales_channel', 'payment_method', 'category_name', 'user_name', 'role']
FIXED_COST_KEYWORDS = ['gaji', 'sewa', 'listrik', 'air', 'cicilan', 'asuransi', 'internet', 'pajak']

plt.rcParams.update({
    'figure.dpi': 120, 'savefig.dpi': 130, 'font.size': 9, 'axes.titlesize': 11,
    'axes.titleweight': 'bold', 'axes.spines.top': False, 'axes.spines.right': False,
    'axes.grid': True, 'grid.alpha': .25, 'axes.axisbelow': True, 'legend.frameon': False,
})


# ----------------------------------------------------------------------------
# UTILITAS UMUM
# ----------------------------------------------------------------------------
def get_today():
    """Tanggal acuan = hari ini (kalender asli). Untuk testing: set env DS_TODAY=YYYY-MM-DD."""
    return pd.Timestamp(os.environ.get('DS_TODAY') or pd.Timestamp.now()).normalize()


def log(*a):
    print(*a, file=sys.stderr)


def _jd(o):
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating,)):
        return None if (math.isnan(float(o)) or math.isinf(float(o))) else float(o)
    if isinstance(o, (np.bool_,)):
        return bool(o)
    if isinstance(o, (pd.Timestamp, pd.Period)):
        return str(o)[:10]
    if isinstance(o, np.ndarray):
        return o.tolist()
    return str(o)


def emit(obj):
    print(json.dumps(obj, ensure_ascii=False, default=_jd))


def rp(x):
    try:
        return 'Rp ' + f"{int(round(float(x))):,}".replace(',', '.')
    except Exception:
        return 'Rp 0'


def rp_short(x, pos=None):
    a, sign = abs(x), ('-' if x < 0 else '')
    if a >= 1e9:
        s = f"{a / 1e9:.1f} M"
    elif a >= 1e6:
        s = f"{a / 1e6:.1f} jt"
    elif a >= 1e3:
        s = f"{a / 1e3:.0f} rb"
    else:
        s = f"{a:.0f}"
    return f"{sign}Rp {s}".replace('.', ',')


def pct(a, b):
    """Persentase perubahan a terhadap b. None jika b = 0."""
    try:
        if b == 0:
            return None
        return round((a - b) / abs(b) * 100, 1)
    except Exception:
        return None


def clip01(x):
    return float(min(1.0, max(0.0, x)))


def lab(ts, gran):
    if gran == 'bulanan':
        return f"{BULAN_ABBR[ts.month - 1]} {str(ts.year)[2:]}"
    return f"{ts.day} {BULAN_ABBR[ts.month - 1]}"


# ----------------------------------------------------------------------------
# TAHAP PREPROCESSING
# ----------------------------------------------------------------------------
def canon_case(s):
    """Samakan kapitalisasi: 'tunai' & 'Tunai' -> bentuk yang paling sering muncul."""
    valid = s.dropna()
    if valid.empty:
        return s
    mapping = valid.groupby(valid.str.lower()).agg(lambda x: x.value_counts().index[0])
    return s.where(s.isna(), s.str.lower().map(mapping))


def clean_amount(s):
    """'Rp 1.250.000' / '1,250,000' / '1250000' -> float."""
    s = s.astype(str).str.strip()
    s = s.str.replace(r'(?i)rp\.?', '', regex=True).str.replace(r'\s', '', regex=True)
    indo = s.str.match(r'^-?\d{1,3}(\.\d{3})+(,\d+)?$')
    s = s.where(~indo, s.str.replace('.', '', regex=False).str.replace(',', '.', regex=False))
    s = s.str.replace(',', '', regex=False)
    return pd.to_numeric(s, errors='coerce')


def preprocess(raw):
    """Pipeline preprocessing. Return (df_bersih, laporan)."""
    rep = {'langkah': []}

    def step(nama, detail, **extra):
        rep['langkah'].append({'tahap': len(rep['langkah']) + 1, 'nama': nama, 'detail': detail, **extra})

    df = raw.copy()
    n0 = len(df)
    today = get_today()
    keep_future = os.environ.get('DS_KEEP_FUTURE') == '1'  # khusus demo: pertahankan data bertanggal masa depan
    df.columns = [str(c).strip().lower() for c in df.columns]

    # 1. Validasi skema
    miss = [c for c in REQUIRED_COLS if c not in df.columns]
    if miss:
        raise ValueError(f"Kolom wajib tidak ada di CSV: {miss}")
    ditambah = [c for c in TEXT_COLS if c not in df.columns]
    for c in ditambah:
        df[c] = np.nan
    step('Validasi skema', f"Kolom wajib lengkap {REQUIRED_COLS}. Kolom opsional ditambahkan: {ditambah or 'tidak ada'}.")

    # 2. Normalisasi teks + token kosong
    for c in ['type'] + TEXT_COLS:
        s = df[c].astype(str).str.strip().str.replace(r'\s+', ' ', regex=True)
        df[c] = s.where(~s.str.lower().isin(NULL_TOKENS), np.nan)
    missing_sebelum = {c: int(df[c].isna().sum()) for c in TEXT_COLS}
    step('Normalisasi teks', 'Spasi dirapikan; token kosong ("NULL", "-", "nan", dll) diubah menjadi missing value.',
         missing_sebelum=missing_sebelum)

    # 3. Standarisasi kategori
    df['type'] = df['type'].str.lower().replace({'income': 'pemasukan', 'masuk': 'pemasukan', 'debit': 'pengeluaran',
                                                  'expense': 'pengeluaran', 'keluar': 'pengeluaran'})
    df['payment_method'] = df['payment_method'].str.lower().replace({'cash': 'tunai', 'qr': 'qris'})
    df['payment_method'] = df['payment_method'].map(lambda v: v if pd.isna(v) else ('QRIS' if v == 'qris' else v.title()))
    df['role'] = df['role'].str.lower()
    for c in ['sales_channel', 'category_name', 'user_name']:
        df[c] = canon_case(df[c])
    step('Standarisasi kategori', 'Tipe, metode bayar, channel, kategori & nama user diseragamkan (huruf besar/kecil, sinonim).')

    # 4. Konversi tipe data
    try:
        df['date'] = pd.to_datetime(df['date'], errors='coerce', format='mixed')
    except Exception:
        df['date'] = pd.to_datetime(df['date'], errors='coerce')
    df['date'] = df['date'].dt.normalize()
    df['amount'] = clean_amount(df['amount'])
    step('Konversi tipe data', 'Kolom date -> datetime, amount -> numerik (format Rp/titik/koma dibersihkan).')

    # 5. Data tidak valid
    bad_date = int(df['date'].isna().sum())
    bad_amt = int((df['amount'].isna() | (df['amount'] <= 0)).sum())
    bad_type = int((~df['type'].isin(['pemasukan', 'pengeluaran'])).sum())
    future = (df['date'] > today) & df['date'].notna()
    if keep_future:
        future = future & False
    n_future = int(future.sum())
    valid_mask = (df['date'].notna() & df['amount'].notna() & (df['amount'] > 0) & df['type'].isin(['pemasukan', 'pengeluaran'])
                  & ~future)
    df = df[valid_mask].copy()
    n_invalid = n0 - len(df)
    step('Pembuangan data tidak valid',
         f"Dibuang {n_invalid} baris (tanggal rusak: {bad_date}, tanggal di masa depan setelah {str(today)[:10]}: {n_future}, "
         f"nominal <= 0/kosong: {bad_amt}, tipe asing: {bad_type}).", dibuang=n_invalid, dibuang_masa_depan=n_future)

    # 6. Duplikat
    n_before = len(df)
    df = df.drop_duplicates().copy()
    n_dup = n_before - len(df)
    step('Pembuangan duplikat', f"Ditemukan & dibuang {n_dup} baris duplikat persis.", dibuang=n_dup)

    # 7. Missing value (imputasi kontekstual)
    imput = {}
    is_in = df['type'] == 'pemasukan'
    n_ch_in = int((df['sales_channel'].isna() & is_in).sum())
    n_ch_out = int((df['sales_channel'].isna() & ~is_in).sum())
    df.loc[df['sales_channel'].isna() & is_in, 'sales_channel'] = 'Tidak Diketahui'
    df.loc[df['sales_channel'].isna() & ~is_in, 'sales_channel'] = 'Non-Penjualan'
    imput['sales_channel'] = {'pemasukan->Tidak Diketahui': n_ch_in, 'pengeluaran->Non-Penjualan': n_ch_out}
    mode_pay = df['payment_method'].mode()
    mode_pay = mode_pay.iloc[0] if len(mode_pay) else 'Tunai'
    imput['payment_method'] = int(df['payment_method'].isna().sum())
    df['payment_method'] = df['payment_method'].fillna(mode_pay)
    for c, val in [('category_name', 'Tanpa Kategori'), ('user_name', 'Tidak Diketahui'), ('role', 'unknown')]:
        imput[c] = int(df[c].isna().sum())
        df[c] = df[c].fillna(val)
    step('Penanganan missing value',
         'Channel kosong pada pengeluaran = "Non-Penjualan" (bukan data hilang, channel hanya relevan utk penjualan); '
         'channel kosong pada pemasukan = "Tidak Diketahui"; metode bayar = modus; lainnya = label default.',
         diimputasi=imput)

    # 8. Outlier (IQR + robust z-score per tipe/kategori)
    key = df['type'] + '|' + df['category_name']
    cnt = key.map(key.value_counts())
    grp = pd.Series(np.where(cnt >= 8, key, df['type']), index=df.index)
    g = df.groupby(grp)['amount']
    q1 = g.transform(lambda x: x.quantile(.25))
    q3 = g.transform(lambda x: x.quantile(.75))
    iqr = q3 - q1
    low, up = q1 - 1.5 * iqr, q3 + 1.5 * iqr
    med = g.transform('median')
    mad = (df['amount'] - med).abs().groupby(grp).transform('median')
    scale = (1.4826 * mad).where(mad > 0, (iqr / 1.349).where(iqr > 0, df['amount'].std() or 1))
    df['amount_median_grup'] = med
    df['amount_robust_z'] = ((df['amount'] - med) / scale).round(2)
    df['is_outlier'] = (df['amount'] > up) | (df['amount'] < low)
    df['amount_winsor'] = df['amount'].clip(lower=low.clip(lower=0), upper=up)
    step('Deteksi outlier', f"{int(df['is_outlier'].sum())} transaksi ditandai outlier (IQR 1.5x per tipe/kategori). "
         'Hanya ditandai (is_outlier), tidak dibuang, karena pesanan besar bisa saja valid.', jumlah=int(df['is_outlier'].sum()))

    # 9. Feature engineering
    d = df['date']
    df['tahun'] = d.dt.year
    df['bulan'] = d.dt.month
    df['bulan_str'] = d.dt.strftime('%Y-%m')
    df['kuartal'] = d.dt.quarter
    df['minggu_mulai'] = d - pd.to_timedelta(d.dt.dayofweek, unit='D')
    df['dow'] = d.dt.dayofweek
    df['nama_hari'] = df['dow'].map(lambda i: HARI[i])
    df['is_weekend'] = df['dow'] >= 5
    df['tgl_bulan'] = d.dt.day
    df['signed_amount'] = np.where(df['type'] == 'pemasukan', df['amount'], -df['amount'])
    step('Feature engineering', 'Ditambahkan: tahun, bulan, kuartal, minggu_mulai, nama_hari, is_weekend, tgl_bulan, signed_amount.')

    # 10. Normalisasi / skala
    df['amount_log'] = np.log1p(df['amount']).round(4)
    gt = df.groupby('type')['amount']
    std = gt.transform('std').replace(0, np.nan)
    df['amount_zscore'] = ((df['amount'] - gt.transform('mean')) / std).fillna(0).round(4)
    rng = (gt.transform('max') - gt.transform('min')).replace(0, np.nan)
    df['amount_minmax'] = ((df['amount'] - gt.transform('min')) / rng).fillna(0).round(4)
    step('Normalisasi nominal', 'Ditambahkan amount_log (log1p), amount_zscore & amount_minmax (per tipe) untuk model statistik/ML.')

    df = df.sort_values(['date', 'type']).reset_index(drop=True)

    # 11. Skor kualitas data
    penalti = n_invalid + n_dup + n_ch_in + sum(v for k, v in imput.items() if k != 'sales_channel')
    kualitas = round(max(0.0, 100 * (1 - penalti / max(n0, 1))), 1)
    step('Skor kualitas data', f"Skor kualitas = {kualitas}/100 (penalti: data dibuang, duplikat, dan missing value yang bukan struktural).",
         skor=kualitas)

    rep['ringkasan'] = {
        'baris_awal': n0, 'baris_valid': len(df), 'baris_dibuang': n0 - len(df),
        'duplikat': n_dup, 'outlier': int(df['is_outlier'].sum()),
        'missing_sebelum': missing_sebelum,
        'missing_sesudah': {c: int(df[c].isna().sum()) for c in TEXT_COLS},
        'rentang_tanggal': [str(df['date'].min())[:10], str(df['date'].max())[:10]] if len(df) else None,
        'dibuang_masa_depan': n_future, 'tanggal_acuan': str(today)[:10],
        'skor_kualitas': kualitas,
        'kolom_akhir': list(df.columns),
    }
    return df, rep


# ----------------------------------------------------------------------------
# KONTEKS & AGREGASI
# ----------------------------------------------------------------------------
def make_ctx():
    if not os.path.exists(CSV_PATH):
        raise FileNotFoundError(f"transactions.csv tidak ditemukan di {CSV_PATH}")
    raw = pd.read_csv(CSV_PATH, dtype=str, keep_default_na=False)
    df, rep = preprocess(raw)
    if df.empty:
        raise ValueError('Tidak ada data valid setelah preprocessing.')
    today = get_today()
    return SimpleNamespace(df=df, rep=rep, as_of=today, today=today, last_data=df['date'].max())


def daily(df, start=None, end=None):
    start = start if start is not None else df['date'].min()
    end = end if end is not None else df['date'].max()
    idx = pd.date_range(start, end, freq='D')
    inc = df[df['type'] == 'pemasukan'].groupby('date')['amount'].sum()
    exp = df[df['type'] == 'pengeluaran'].groupby('date')['amount'].sum()
    out = pd.DataFrame({'pemasukan': inc.reindex(idx, fill_value=0).astype(float),
                        'pengeluaran': exp.reindex(idx, fill_value=0).astype(float)}, index=idx)
    out['laba'] = out['pemasukan'] - out['pengeluaran']
    return out


def agg_gran(d, gran):
    if gran == 'harian':
        return d
    if gran == 'mingguan':
        return d.resample('W-MON', label='left', closed='left').sum()
    return d.resample('MS').sum()


def monthly_table(df):
    g = df.groupby(['bulan_str', 'type'])['amount'].sum().unstack(fill_value=0)
    for c in ['pemasukan', 'pengeluaran']:
        if c not in g:
            g[c] = 0
    g = g[['pemasukan', 'pengeluaran']].astype(float)
    g['laba'] = g['pemasukan'] - g['pengeluaran']
    g['margin'] = np.where(g['pemasukan'] > 0, g['laba'] / g['pemasukan'] * 100, 0).round(1)
    g['growth_pendapatan'] = g['pemasukan'].pct_change().replace([np.inf, -np.inf], np.nan) * 100
    return g


def month_flags(df, as_of):
    """Tandai bulan parsial (data awal/akhir tidak penuh)."""
    flags = {}
    first = df['date'].min()
    for m in df['bulan_str'].unique():
        y, mo = int(m[:4]), int(m[5:])
        dim = pd.Period(m).days_in_month
        parsial = False
        if (first.year, first.month) == (y, mo) and first.day > 3:
            parsial = True
        if (as_of.year, as_of.month) == (y, mo) and as_of.day < dim:
            parsial = True
        flags[m] = parsial
    return flags


def filt(df, a):
    kat = getattr(a, 'kategori', None)
    ch = getattr(a, 'channel', None)
    tipe = getattr(a, 'tipe', None)
    if kat:
        df = df[df['category_name'].str.contains(kat, case=False, na=False, regex=False)]
    if ch:
        df = df[df['sales_channel'].str.contains(ch, case=False, na=False, regex=False)]
    if tipe in ('pemasukan', 'pengeluaran'):
        df = df[df['type'] == tipe]
    return df


def top_series(s, n=5, other='Lainnya'):
    s = s.sort_values(ascending=False)
    top = s.head(n)
    rest = s.iloc[n:].sum()
    if rest > 0:
        top = pd.concat([top, pd.Series({other: rest})])
    return top


# ----------------------------------------------------------------------------
# ANALISIS
# ----------------------------------------------------------------------------
def window(df, start, end):
    return df[(df['date'] >= start) & (df['date'] <= end)]


def metrics(df):
    i = float(df.loc[df['type'] == 'pemasukan', 'amount'].sum())
    o = float(df.loc[df['type'] == 'pengeluaran', 'amount'].sum())
    return {'pemasukan': int(i), 'pengeluaran': int(o), 'laba': int(i - o),
            'margin_persen': round((i - o) / i * 100, 1) if i > 0 else 0.0, 'jumlah_transaksi': int(len(df))}


def kategori_delta(d1, d2, tipe, n=5):
    a = d1[d1['type'] == tipe].groupby('category_name')['amount'].sum()
    b = d2[d2['type'] == tipe].groupby('category_name')['amount'].sum()
    diff = a.sub(b, fill_value=0)
    diff = diff.sort_values(key=lambda s: s.abs(), ascending=False).head(n)
    return [{'kategori': k, 'sekarang': int(a.get(k, 0)), 'sebelumnya': int(b.get(k, 0)), 'selisih': int(v),
             'perubahan_persen': pct(a.get(k, 0), b.get(k, 0))} for k, v in diff.items() if v != 0]


def bandingkan(ctx, mode='bulan', days=7):
    ao, df = ctx.as_of, ctx.df
    if mode == 'bulan':
        s1 = ao.replace(day=1)
        prev_end = s1 - pd.Timedelta(days=1)
        s2 = prev_end.replace(day=1)
        e2 = min(s2 + pd.Timedelta(days=ao.day - 1), prev_end)
        l1 = f"{BULAN[ao.month - 1]} {ao.year} (tgl 1-{ao.day})"
        l2 = f"{BULAN[s2.month - 1]} {s2.year} (tgl 1-{e2.day}, rentang sama)"
        e1 = ao
    else:
        n = 7 if mode == 'minggu' else max(1, int(days))
        e1, s1 = ao, ao - pd.Timedelta(days=n - 1)
        e2 = s1 - pd.Timedelta(days=1)
        s2 = e2 - pd.Timedelta(days=n - 1)
        l1 = f"{n} hari terakhir ({s1:%d %b} - {e1:%d %b})"
        l2 = f"{n} hari sebelumnya ({s2:%d %b} - {e2:%d %b})"
    d1, d2 = window(df, s1, e1), window(df, s2, e2)
    m1, m2 = metrics(d1), metrics(d2)
    drivers_in = kategori_delta(d1, d2, 'pemasukan')
    drivers_out = kategori_delta(d1, d2, 'pengeluaran')
    # dampak ke laba: pemasukan naik = positif, pengeluaran naik = negatif
    impact = [(x['kategori'], x['selisih'], 'pemasukan') for x in drivers_in] + \
             [(x['kategori'], -x['selisih'], 'pengeluaran') for x in drivers_out]
    impact.sort(key=lambda t: abs(t[1]), reverse=True)
    penjelasan = []
    for k, v, t in impact[:3]:
        arah = 'menambah' if v > 0 else 'menekan'
        penjelasan.append(f"{k} ({t}) {arah} laba sebesar {rp(abs(v))}")
    return {
        'status': 'sukses', 'mode': mode,
        'periode_ini': {'label': l1, 'dari': str(s1)[:10], 'sampai': str(e1)[:10], **m1},
        'periode_sebelumnya': {'label': l2, 'dari': str(s2)[:10], 'sampai': str(e2)[:10], **m2},
        'perubahan_persen': {'pemasukan': pct(m1['pemasukan'], m2['pemasukan']),
                             'pengeluaran': pct(m1['pengeluaran'], m2['pengeluaran']),
                             'laba': pct(m1['laba'], m2['laba'])},
        'penggerak_pemasukan': drivers_in, 'penggerak_pengeluaran': drivers_out,
        'penjelasan_laba': penjelasan,
        'catatan': 'Periode sebelumnya kosong, perbandingan tidak bermakna.' if m2['jumlah_transaksi'] == 0 else None,
    }


def _fit_predict(y, horizon):
    """Tren linear + musiman hari dalam minggu. y: Series harian ber-index tanggal."""
    t = np.arange(len(y))
    dow = y.index.dayofweek.values
    overall = float(y.mean())
    if overall <= 0:
        return np.zeros(horizon), 0.0, np.ones(7)
    fac = y.groupby(dow).mean().reindex(range(7)).fillna(overall) / overall
    fac = (fac / fac.mean()).clip(lower=0.2).values
    des = y.values / fac[dow]
    slope, icpt = np.polyfit(t, des, 1)
    slope = float(np.clip(slope, -0.5 * overall / max(horizon, 1), 0.5 * overall / max(horizon, 1)))
    icpt = float(des.mean() - slope * t.mean())
    fitted = (icpt + slope * t) * fac[dow]
    std = float(np.std(y.values - fitted))
    tf = np.arange(len(y), len(y) + horizon)
    fdow = (y.index[-1] + pd.to_timedelta(np.arange(1, horizon + 1), unit='D')).dayofweek.values
    pred = np.clip((icpt + slope * tf) * fac[fdow], 0, 3 * float(y.max()))
    return pred, std, fac


def forecast(ctx, horizon=14, df=None, lookback=90):
    df = ctx.df if df is None else df
    horizon = int(min(max(horizon, 1), 90))
    last = ctx.last_data
    d = daily(df, df['date'].min(), last)
    y_in, y_out = d['pemasukan'].tail(lookback), d['pengeluaran'].tail(lookback)
    if len(y_in) < 14 or (y_in > 0).sum() < 7:
        return {'status': 'data_kurang', 'pesan': 'Data historis belum cukup (minimal 14 hari dengan >= 7 hari penjualan) untuk prediksi.'}
    p_in, s_in, fac = _fit_predict(y_in, horizon)
    p_out, s_out, _ = _fit_predict(y_out, horizon)
    dates = pd.date_range(last + pd.Timedelta(days=1), periods=horizon)
    rows = [{'tanggal': str(dt)[:10], 'hari': HARI[dt.dayofweek], 'pemasukan': int(a), 'pengeluaran': int(b), 'laba': int(a - b)}
            for dt, a, b in zip(dates, p_in, p_out)]
    # backtest 14 hari terakhir
    akurasi = None
    if len(y_in) >= 35:
        h = 14
        bp, _, _ = _fit_predict(y_in.iloc[:-h], h)
        actual = y_in.iloc[-h:].values
        if actual.sum() > 0:
            akurasi = {'error_total_14_hari_persen': round(abs(bp.sum() - actual.sum()) / actual.sum() * 100, 1),
                       'wape_harian_persen': round(np.abs(bp - actual).sum() / actual.sum() * 100, 1)}
    # proyeksi akhir bulan dari data terakhir
    eom = last + pd.offsets.MonthEnd(0)
    rest = (eom - last).days
    mtd = window(df, last.replace(day=1), last)
    mm = metrics(mtd)
    proy = None
    if rest > 0:
        pi, _, _ = _fit_predict(y_in, rest)
        po, _, _ = _fit_predict(y_out, rest)
        proy = {'bulan': f"{BULAN[last.month - 1]} {last.year}", 'sisa_hari': rest,
                'pemasukan': int(mm['pemasukan'] + pi.sum()), 'pengeluaran': int(mm['pengeluaran'] + po.sum()),
                'laba': int(mm['pemasukan'] + pi.sum() - mm['pengeluaran'] - po.sum())}
    return {
        'status': 'sukses', 'horizon_hari': horizon, 'data_terakhir': str(last)[:10], 'hari_data_dipakai': len(y_in),
        'total_prediksi': {'pemasukan': int(p_in.sum()), 'pengeluaran': int(p_out.sum()), 'laba': int(p_in.sum() - p_out.sum())},
        'rata_rata_harian': {'pemasukan': int(p_in.mean()), 'pengeluaran': int(p_out.mean())},
        'rentang_80persen_pemasukan_harian': [int(max(0, p_in.mean() - 1.28 * s_in)), int(p_in.mean() + 1.28 * s_in)],
        'hari_terbaik': HARI[int(np.argmax(fac))], 'hari_terlemah': HARI[int(np.argmin(fac))],
        'proyeksi_akhir_bulan': proy, 'akurasi_backtest': akurasi,
        'harian': rows if horizon <= 31 else rows[:31],
        'catatan': 'Model sederhana (tren linear + pola hari dalam minggu). Gunakan sebagai gambaran, bukan kepastian.',
        '_arrays': {'pred_in': p_in, 'pred_out': p_out, 'std_in': s_in, 'std_out': s_out, 'dates': dates},
    }


def deteksi_anomali(ctx, top=10, days=None):
    df = ctx.df
    if days:
        df = window(df, ctx.as_of - pd.Timedelta(days=days - 1), ctx.as_of)
    x = df[df['is_outlier']].copy()
    x['skor'] = x['amount_robust_z'].abs()
    x = x.sort_values('skor', ascending=False).head(top)
    rows = []
    for _, r in x.iterrows():
        arah = 'di atas' if r['amount_robust_z'] > 0 else 'di bawah'
        rows.append({'tanggal': str(r['date'])[:10], 'tipe': r['type'], 'kategori': r['category_name'], 'nominal': int(r['amount']),
                     'user': r['user_name'], 'skor_anomali': float(r['skor']),
                     'alasan': f"{rp(r['amount'])} jauh {arah} kewajaran {r['category_name']} (median {rp(r['amount_median_grup'])})"})
    d = daily(df)
    out = d['pengeluaran'][d['pengeluaran'] > 0]
    hari_tinggi = []
    if len(out) >= 8:
        q1, q3 = out.quantile(.25), out.quantile(.75)
        up = q3 + 1.5 * (q3 - q1)
        hari_tinggi = [{'tanggal': str(i)[:10], 'pengeluaran': int(v)} for i, v in out[out > up].sort_values(ascending=False).head(5).items()]
    return {'status': 'sukses', 'jumlah_outlier_total': int(ctx.df['is_outlier'].sum()), 'transaksi_anomali': rows,
            'hari_pengeluaran_tinggi': hari_tinggi,
            'catatan': 'Outlier belum tentu salah; pesanan grosir besar bisa valid. Perlu dicek manual.'}


def konsentrasi(df):
    inc = df[df['type'] == 'pemasukan']
    out = {}
    if inc.empty:
        return out
    cat = inc.groupby('category_name')['amount'].sum()
    sh = cat / cat.sum()
    out['kategori_terbesar'] = {'nama': sh.idxmax(), 'persen': round(float(sh.max()) * 100, 1)}
    out['hhi_kategori'] = round(float((sh ** 2).sum()), 3)
    ch = inc[~inc['sales_channel'].isin(['Tidak Diketahui', 'Non-Penjualan'])].groupby('sales_channel')['amount'].sum()
    if ch.sum() > 0:
        s2 = ch / ch.sum()
        out['channel_terbesar'] = {'nama': s2.idxmax(), 'persen': round(float(s2.max()) * 100, 1)}
    return out


def health_score(ctx):
    df, ao = ctx.df, ctx.as_of
    w90 = window(df, ao - pd.Timedelta(days=89), ao)
    m90 = metrics(w90)
    margin = m90['margin_persen'] if m90['pemasukan'] > 0 else -100
    s1 = clip01(margin / 25) * 30
    a = metrics(window(df, ao - pd.Timedelta(days=29), ao))['pemasukan']
    b = metrics(window(df, ao - pd.Timedelta(days=59), ao - pd.Timedelta(days=30)))['pemasukan']
    g = (a - b) / b if b > 0 else (0 if a == 0 else 1)
    s2 = clip01((g + 0.2) / 0.4) * 20
    wk = daily(df, ao - pd.Timedelta(days=83), ao)['pemasukan'].resample('W-MON', label='left', closed='left').sum()
    cv = float(wk.std() / wk.mean()) if wk.mean() > 0 else 2.0
    s3 = clip01(1 - cv) * 20
    inc90 = w90[w90['type'] == 'pemasukan'].groupby('category_name')['amount'].sum()
    top_share = float(inc90.max() / inc90.sum()) if inc90.sum() > 0 else 1.0
    s4 = clip01((0.8 - top_share) / 0.4) * 15
    d30 = daily(df, ao - pd.Timedelta(days=29), ao)
    aktif = float((d30['pemasukan'] > 0).mean())
    s5 = clip01(aktif / 0.7) * 15
    total = round(s1 + s2 + s3 + s4 + s5, 1)
    grade = 'A' if total >= 80 else 'B' if total >= 65 else 'C' if total >= 50 else 'D' if total >= 35 else 'E'
    komp = [
        {'aspek': 'Profitabilitas', 'skor': round(s1, 1), 'maks': 30, 'keterangan': f"Margin 90 hari terakhir {margin:.1f}% (target >= 25%)"},
        {'aspek': 'Pertumbuhan', 'skor': round(s2, 1), 'maks': 20, 'keterangan': f"Pemasukan 30 hari terakhir {g * 100:+.1f}% vs 30 hari sebelumnya"},
        {'aspek': 'Stabilitas', 'skor': round(s3, 1), 'maks': 20, 'keterangan': f"Fluktuasi pemasukan mingguan (CV) {cv:.2f} (makin kecil makin stabil)"},
        {'aspek': 'Diversifikasi', 'skor': round(s4, 1), 'maks': 15, 'keterangan': f"Kategori terbesar = {top_share * 100:.0f}% dari pemasukan (ideal < 40%)"},
        {'aspek': 'Aktivitas penjualan', 'skor': round(s5, 1), 'maks': 15, 'keterangan': f"Ada penjualan di {aktif * 100:.0f}% hari dalam 30 hari terakhir (target >= 70%)"},
    ]
    return {'status': 'sukses', 'skor': total, 'grade': grade, 'komponen': komp,
            'aspek_terlemah': min(komp, key=lambda c: c['skor'] / c['maks'])['aspek'],
            'aspek_terkuat': max(komp, key=lambda c: c['skor'] / c['maks'])['aspek']}


def break_even(ctx):
    df, ao = ctx.df, ctx.as_of
    flags = month_flags(df, ao)
    use = df[~df['bulan_str'].map(flags)]
    if use['bulan_str'].nunique() < 1:
        use = df
    n_bulan = max(use['bulan_str'].nunique(), 1)
    inc = float(use.loc[use['type'] == 'pemasukan', 'amount'].sum())
    ex = use[use['type'] == 'pengeluaran']
    is_fixed = ex['category_name'].str.lower().apply(lambda s: any(k in s for k in FIXED_COST_KEYWORDS))
    fixed, var = float(ex.loc[is_fixed, 'amount'].sum()), float(ex.loc[~is_fixed, 'amount'].sum())
    if inc <= 0:
        return {'status': 'data_kurang', 'pesan': 'Belum ada pemasukan untuk menghitung break-even.'}
    cm = (inc - var) / inc
    if cm <= 0:
        return {'status': 'sukses', 'peringatan': 'Biaya variabel >= pemasukan, break-even tidak tercapai dengan struktur biaya sekarang.'}
    be_bulan = (fixed / n_bulan) / cm
    rata_inc = inc / n_bulan
    return {'status': 'sukses', 'bulan_dipakai': int(n_bulan), 'biaya_tetap_per_bulan': int(fixed / n_bulan),
            'biaya_variabel_rasio_persen': round(var / inc * 100, 1), 'margin_kontribusi_persen': round(cm * 100, 1),
            'omzet_impas_per_bulan': int(be_bulan), 'omzet_impas_per_hari': int(be_bulan / 30),
            'rata_rata_omzet_per_bulan': int(rata_inc), 'rasio_omzet_vs_impas': round(rata_inc / be_bulan, 2) if be_bulan > 0 else None,
            'status_impas': 'di atas titik impas' if rata_inc >= be_bulan else 'di bawah titik impas',
            'kategori_biaya_tetap': sorted(set(ex.loc[is_fixed, 'category_name'])),
            'catatan': 'Biaya tetap diasumsikan dari kategori gaji/listrik/air/sewa dll. Bulan parsial tidak dipakai.'}


def kategori_detail(ctx, nama):
    df = ctx.df
    x = df[df['category_name'].str.contains(nama, case=False, na=False, regex=False)]
    if x.empty:
        return {'status': 'tidak_ditemukan', 'pesan': f"Kategori '{nama}' tidak ada.",
                'kategori_tersedia': sorted(df['category_name'].unique())}
    tipe = x['type'].mode().iloc[0]
    x = x[x['type'] == tipe]
    total_tipe = df.loc[df['type'] == tipe, 'amount'].sum()
    mt = x.groupby('bulan_str')['amount'].sum()
    return {'status': 'sukses', 'kategori': x['category_name'].mode().iloc[0], 'tipe': tipe, 'total': int(x['amount'].sum()),
            'kontribusi_persen_dari_tipe': round(x['amount'].sum() / total_tipe * 100, 1), 'jumlah_transaksi': int(len(x)),
            'rata_rata': int(x['amount'].mean()), 'median': int(x['amount'].median()), 'terbesar': int(x['amount'].max()),
            'terkecil': int(x['amount'].min()), 'per_bulan': {k: int(v) for k, v in mt.items()},
            'perubahan_bulan_terakhir_persen': pct(mt.iloc[-1], mt.iloc[-2]) if len(mt) >= 2 else None,
            'channel_utama': x['sales_channel'].mode().iloc[0], 'pembayaran_utama': x['payment_method'].mode().iloc[0]}


def karyawan_stats(ctx):
    df = ctx.df
    g = df.groupby(['user_name', 'role'])
    rows = []
    for (u, r), x in g:
        rows.append({'nama': u, 'role': r, 'jumlah_transaksi': int(len(x)),
                     'jumlah_pemasukan': int((x['type'] == 'pemasukan').sum()),
                     'nilai_pemasukan': int(x.loc[x['type'] == 'pemasukan', 'amount'].sum()),
                     'nilai_pengeluaran': int(x.loc[x['type'] == 'pengeluaran', 'amount'].sum()),
                     'rata_rata_transaksi': int(x['amount'].mean()), 'hari_aktif': int(x['date'].nunique())})
    rows.sort(key=lambda r: r['jumlah_transaksi'], reverse=True)
    return {'status': 'sukses', 'ranking': rows}


def cari(ctx, a):
    df = ctx.df
    if a.days:
        df = window(df, ctx.as_of - pd.Timedelta(days=a.days - 1), ctx.as_of)
    df = filt(df, a)
    if a.user:
        df = df[df['user_name'].str.contains(a.user, case=False, na=False, regex=False)]
    if a.min is not None:
        df = df[df['amount'] >= a.min]
    if a.max is not None:
        df = df[df['amount'] <= a.max]
    df = df.sort_values('amount' if a.urut == 'terbesar' else 'date', ascending=(a.urut == 'terkecil')) \
        if a.urut != 'terbaru' else df.sort_values('date', ascending=False)
    rows = [{'tanggal': str(r['date'])[:10], 'tipe': r['type'], 'kategori': r['category_name'], 'nominal': int(r['amount']),
             'channel': r['sales_channel'], 'pembayaran': r['payment_method'], 'user': r['user_name']}
            for _, r in df.head(a.limit).iterrows()]
    return {'status': 'sukses', 'jumlah_ditemukan': int(len(df)), 'total_nominal': int(df['amount'].sum()), 'ditampilkan': len(rows), 'transaksi': rows}


def musiman(df, ao):
    inc = df[df['type'] == 'pemasukan']
    d = daily(df, df['date'].min(), df['date'].max())
    per_hari = d.groupby(d.index.dayofweek)['pemasukan'].mean()
    out = {'rata_pemasukan_per_hari': {HARI[i]: int(v) for i, v in per_hari.items()},
           'hari_terbaik': HARI[int(per_hari.idxmax())], 'hari_terlemah': HARI[int(per_hari.idxmin())]}
    tgl = inc.groupby(pd.cut(inc['tgl_bulan'], [0, 10, 20, 31], labels=['tgl 1-10', 'tgl 11-20', 'tgl 21-31']), observed=False)['amount'].sum()
    if tgl.sum() > 0:
        out['porsi_pemasukan_per_dekade_bulan_persen'] = {str(k): round(float(v / tgl.sum() * 100), 1) for k, v in tgl.items()}
    wk = inc.groupby('is_weekend')['amount'].sum()
    if wk.sum() > 0:
        out['porsi_akhir_pekan_persen'] = round(float(wk.get(True, 0) / wk.sum() * 100), 1)
    return out


def peringatan_dini(ctx, hs, konc):
    df, ao = ctx.df, ctx.as_of
    w = []
    cmp_ = bandingkan(ctx, 'bulan')
    p, q = cmp_['periode_ini'], cmp_['periode_sebelumnya']
    if p['pemasukan'] > 0 and p['margin_persen'] < 10:
        w.append(f"Margin bulan ini hanya {p['margin_persen']}% (di bawah 10%).")
    if p['laba'] < 0:
        w.append(f"Bulan ini sedang RUGI {rp(abs(p['laba']))}.")
    ch = cmp_['perubahan_persen']
    if ch['pengeluaran'] is not None and ch['pengeluaran'] > 20:
        w.append(f"Pengeluaran bulan ini naik {ch['pengeluaran']}% dibanding rentang sama bulan lalu.")
    if ch['pemasukan'] is not None and ch['pemasukan'] < -15:
        w.append(f"Pemasukan bulan ini turun {abs(ch['pemasukan'])}% dibanding rentang sama bulan lalu.")
    kt = konc.get('kategori_terbesar')
    if kt and kt['persen'] > 50:
        w.append(f"{kt['persen']}% pemasukan bergantung pada satu kategori ({kt['nama']}), risiko konsentrasi tinggi.")
    ct = konc.get('channel_terbesar')
    if ct and ct['persen'] > 60:
        w.append(f"{ct['persen']}% penjualan datang dari satu channel ({ct['nama']}).")
    d30 = daily(df, ao - pd.Timedelta(days=29), ao)['pemasukan']
    streak = mx = 0
    for v in d30.values:
        streak = streak + 1 if v == 0 else 0
        mx = max(mx, streak)
    if mx >= 5:
        w.append(f"Pernah ada {mx} hari beruntun tanpa penjualan dalam 30 hari terakhir.")
    if hs['skor'] < 50:
        w.append(f"Skor kesehatan bisnis rendah ({hs['skor']}/100), aspek terlemah: {hs['aspek_terlemah']}.")
    return w


# ----------------------------------------------------------------------------
# GRAFIK
# ----------------------------------------------------------------------------
def money(ax, axis='y'):
    (ax.yaxis if axis == 'y' else ax.xaxis).set_major_formatter(FuncFormatter(rp_short))


def ticks(ax, x, labels, max_ticks=12):
    step = max(1, math.ceil(len(x) / max_ticks))
    ax.set_xticks(list(x)[::step])
    ax.set_xticklabels(labels[::step], rotation=45, ha='right')


def summarize_series(g, gran):
    if g.empty:
        return {}
    pk, bl, wl = g['pemasukan'].idxmax(), g['laba'].idxmax(), g['laba'].idxmin()
    out = {'granularitas': gran, 'jumlah_titik': int(len(g)), 'total_pemasukan': int(g['pemasukan'].sum()),
           'total_pengeluaran': int(g['pengeluaran'].sum()), 'total_laba': int(g['laba'].sum()),
           'rata_rata_pemasukan_per_titik': int(g['pemasukan'].mean()),
           'puncak_pemasukan': {'label': lab(pk, gran), 'nilai': int(g.loc[pk, 'pemasukan'])},
           'laba_terbaik': {'label': lab(bl, gran), 'nilai': int(g.loc[bl, 'laba'])},
           'laba_terburuk': {'label': lab(wl, gran), 'nilai': int(g.loc[wl, 'laba'])},
           'jumlah_titik_rugi': int((g['laba'] < 0).sum())}
    if len(g) <= 31:
        out['data'] = [{'label': lab(i, gran), 'pemasukan': int(r['pemasukan']), 'pengeluaran': int(r['pengeluaran']), 'laba': int(r['laba'])}
                       for i, r in g.iterrows()]
    return out


def d_trend(ax, S):
    g = agg_gran(S.d, S.gran)
    x = np.arange(len(g))
    ax.plot(x, g['pemasukan'], marker='o', ms=3, lw=2, color=GREEN, label='Pemasukan')
    ax.plot(x, g['pengeluaran'], marker='o', ms=3, lw=2, color=RED, label='Pengeluaran')
    if S.gran == 'harian' and len(g) >= 10:
        ax.plot(x, g['pemasukan'].rolling(7, min_periods=3).mean(), ls='--', lw=1.5, color=GREEN, alpha=.55, label='Rata-rata 7 hari')
    ticks(ax, x, [lab(i, S.gran) for i in g.index])
    money(ax)
    ax.legend()
    ax.set_title(f"Tren {S.gran.title()} ({S.days} hari)")
    return summarize_series(g, S.gran)


def d_gabungan(ax, S):
    """Pemasukan + pengeluaran (batang) + laba bersih (garis) dalam satu gambar."""
    g = agg_gran(S.d, S.gran)
    x = np.arange(len(g))
    ax.bar(x - .2, g['pemasukan'], .4, color=GREEN, label='Pemasukan')
    ax.bar(x + .2, g['pengeluaran'], .4, color=RED, label='Pengeluaran')
    ax.plot(x, g['laba'], color=BLUE, marker='o', lw=2.2, label='Laba bersih', zorder=3)
    ax.axhline(0, color='black', lw=.8)
    if len(g) <= 12:
        for xi, v in zip(x, g['laba']):
            ax.annotate(rp_short(v), (xi, v), textcoords='offset points', xytext=(0, -14 if v < 0 else 8), ha='center', fontsize=7.5,
                        color=BLUE, fontweight='bold', bbox=dict(boxstyle='round,pad=0.15', fc='white', ec='none', alpha=.85), zorder=4)
    ticks(ax, x, [lab(i, S.gran) for i in g.index])
    money(ax)
    ax.legend()
    ax.set_title(f"Pemasukan, Pengeluaran & Laba ({S.gran}, {S.days} hari)")
    return summarize_series(g, S.gran)


def d_bar(ax, S):
    g = agg_gran(S.d, S.gran)
    x = np.arange(len(g))
    ax.bar(x - .2, g['pemasukan'], .4, color=GREEN, label='Pemasukan')
    ax.bar(x + .2, g['pengeluaran'], .4, color=RED, label='Pengeluaran')
    ticks(ax, x, [lab(i, S.gran) for i in g.index])
    money(ax)
    ax.legend()
    ax.set_title(f"Pemasukan vs Pengeluaran ({S.gran})")
    return summarize_series(g, S.gran)


def d_laba(ax, S):
    g = agg_gran(S.d, S.gran)
    x = np.arange(len(g))
    ax.bar(x, g['laba'], color=[GREEN if v >= 0 else RED for v in g['laba']])
    ax.axhline(0, color='black', lw=.8)
    ticks(ax, x, [lab(i, S.gran) for i in g.index])
    money(ax)
    ax.set_title(f"Laba Bersih ({S.gran}), hijau untung, merah rugi")
    return summarize_series(g, S.gran)


def d_kumulatif(ax, S):
    d = S.d
    ci, co, cl = d['pemasukan'].cumsum(), d['pengeluaran'].cumsum(), d['laba'].cumsum()
    ax.plot(d.index, ci, color=GREEN, lw=2, label='Pemasukan kumulatif')
    ax.plot(d.index, co, color=RED, lw=2, label='Pengeluaran kumulatif')
    ax.fill_between(d.index, cl, 0, color=BLUE, alpha=.18, label='Laba kumulatif')
    money(ax)
    ax.legend()
    ax.set_title('Pertumbuhan Kumulatif')
    plt.setp(ax.get_xticklabels(), rotation=45, ha='right')
    return {'pemasukan_kumulatif': int(ci.iloc[-1]), 'pengeluaran_kumulatif': int(co.iloc[-1]), 'laba_kumulatif': int(cl.iloc[-1])}


def donut_series(ax, s, title):
    if s.empty or s.sum() <= 0:
        ax.axis('off')
        ax.set_title(title)
        return []
    s = top_series(s, 5)
    cols = (PALETTE + [GRAY] * 5)[:len(s)]
    ax.pie(s.values, colors=cols, startangle=90, counterclock=False, wedgeprops=dict(width=.42, edgecolor='white'))
    ax.text(0, 0, rp_short(s.sum()), ha='center', va='center', fontsize=11, fontweight='bold')
    ax.legend([f"{k} ({v / s.sum() * 100:.0f}%)" for k, v in s.items()], loc='center left', bbox_to_anchor=(0.95, 0.5), fontsize=8)
    ax.set_title(title)
    ax.grid(False)
    return [{'nama': k, 'total': int(v), 'persen': round(float(v / s.sum() * 100), 1)} for k, v in s.items()]


def mk_donut(tipe):
    def f(ax, S):
        s = S.sub[S.sub['type'] == tipe].groupby('category_name')['amount'].sum()
        return {'komposisi': donut_series(ax, s, f"Komposisi {tipe.title()} per Kategori")}
    return f


def d_pareto(ax, S):
    tipe = S.a.tipe if S.a.tipe in ('pemasukan', 'pengeluaran') else 'pemasukan'
    s = S.sub[S.sub['type'] == tipe].groupby('category_name')['amount'].sum().sort_values(ascending=False)
    if s.empty:
        return {}
    cum = s.cumsum() / s.sum() * 100
    ax.bar(range(len(s)), s.values, color=BLUE)
    ax.set_xticks(range(len(s)))
    ax.set_xticklabels(s.index, rotation=45, ha='right')
    money(ax)
    ax2 = ax.twinx()
    ax2.plot(range(len(s)), cum.values, color=AMBER, marker='o', lw=2)
    ax2.axhline(80, color=GRAY, ls='--', lw=1)
    ax2.set_ylim(0, 105)
    ax2.set_ylabel('% kumulatif')
    ax2.grid(False)
    ax.set_title(f"Pareto 80/20: {tipe.title()}")
    n80 = int((cum < 80).sum() + 1)
    return {'tipe': tipe, 'jumlah_kategori_penyumbang_80persen': n80, 'kategori_penyumbang_80persen': list(s.index[:n80]),
            'detail': [{'nama': k, 'total': int(v), 'persen_kumulatif': round(float(c), 1)} for (k, v), c in zip(s.items(), cum.values)]}


def d_channel(ax, S):
    inc = S.sub[S.sub['type'] == 'pemasukan']
    if inc.empty:
        return {}
    p = inc.pivot_table(index='bulan_str', columns='sales_channel', values='amount', aggfunc='sum', fill_value=0)
    bottom = np.zeros(len(p))
    for i, c in enumerate(p.columns):
        ax.bar(range(len(p)), p[c].values, bottom=bottom, label=c, color=(PALETTE + [GRAY] * 5)[i])
        bottom += p[c].values
    ax.set_xticks(range(len(p)))
    ax.set_xticklabels(p.index, rotation=45, ha='right')
    money(ax)
    ax.legend(fontsize=8)
    ax.set_title('Pemasukan per Channel per Bulan')
    tot = p.sum().sort_values(ascending=False)
    return {'channel': [{'nama': k, 'total': int(v), 'persen': round(float(v / tot.sum() * 100), 1)} for k, v in tot.items()]}


def d_bayar(axs, S):
    r = {}
    for ax, tipe in zip(axs, ['pemasukan', 'pengeluaran']):
        s = S.sub[S.sub['type'] == tipe].groupby('payment_method')['amount'].sum()
        r[tipe] = donut_series(ax, s, f"Metode Bayar: {tipe.title()}")
    return r


def d_margin(ax, S):
    m = monthly_table(S.sub)
    if m.empty:
        return {}
    flags = month_flags(S.sub, S.ctx.as_of)
    x = np.arange(len(m))
    ax.bar(x, m['laba'], color=[GREEN if v >= 0 else RED for v in m['laba']], alpha=.8)
    ax.set_xticks(x)
    ax.set_xticklabels([i + ('*' if flags.get(i) else '') for i in m.index], rotation=45, ha='right')
    money(ax)
    ax2 = ax.twinx()
    ax2.plot(x, m['margin'], color=PURPLE, marker='o', lw=2)
    ax2.set_ylabel('Margin (%)')
    ax2.grid(False)
    ax.set_title('Laba & Margin per Bulan (* = bulan parsial)')
    return {'bulanan': [{'bulan': k, 'laba': int(r['laba']), 'margin_persen': float(r['margin']), 'parsial': bool(flags.get(k))} for k, r in m.iterrows()]}


def d_distribusi(axs, S):
    inc = S.sub.loc[S.sub['type'] == 'pemasukan', 'amount']
    out = S.sub.loc[S.sub['type'] == 'pengeluaran', 'amount']
    axs[0].hist([inc, out], bins=15, color=[GREEN, RED], label=['Pemasukan', 'Pengeluaran'])
    money(axs[0], 'x')
    axs[0].legend()
    axs[0].set_title('Sebaran Nominal Transaksi')
    bp = axs[1].boxplot([v for v in [inc, out] if len(v)], tick_labels=[n for n, v in [('Pemasukan', inc), ('Pengeluaran', out)] if len(v)],
                        patch_artist=True)
    for patch, c in zip(bp['boxes'], [GREEN, RED]):
        patch.set_facecolor(c)
        patch.set_alpha(.5)
    money(axs[1])
    axs[1].set_title('Box Plot & Outlier')
    desc = lambda v: {'rata_rata': int(v.mean()), 'median': int(v.median()), 'min': int(v.min()), 'maks': int(v.max())} if len(v) else {}
    return {'pemasukan': desc(inc), 'pengeluaran': desc(out)}


def d_karyawan(axs, S):
    k = karyawan_stats(SimpleNamespace(df=S.sub))['ranking']
    names = [r['nama'] for r in k]
    axs[0].barh(names, [r['jumlah_transaksi'] for r in k], color=BLUE)
    axs[0].invert_yaxis()
    axs[0].set_title('Jumlah Transaksi Dicatat')
    axs[1].barh(names, [r['nilai_pemasukan'] for r in k], color=GREEN)
    axs[1].invert_yaxis()
    money(axs[1], 'x')
    axs[1].set_title('Nilai Pemasukan Dicatat')
    return {'ranking': k}


def d_perbandingan(ax, S):
    mode = S.a.periode or ('custom' if S.a.days else 'bulan')
    r = bandingkan(S.ctx, mode, S.a.days or 7)
    a, b = r['periode_ini'], r['periode_sebelumnya']
    keys = ['pemasukan', 'pengeluaran', 'laba']
    x = np.arange(3)
    ax.bar(x - .2, [b[k] for k in keys], .4, color=GRAY, label=b['label'])
    ax.bar(x + .2, [a[k] for k in keys], .4, color=BLUE, label=a['label'])
    ax.set_xticks(x)
    ax.set_xticklabels([f"{k.title()}\n({r['perubahan_persen'][k]:+}%)" if r['perubahan_persen'][k] is not None else k.title() for k in keys])
    money(ax)
    ax.legend(fontsize=8)
    ax.set_title('Perbandingan Periode')
    return r


def d_heatmap(ax, S):
    inc = S.sub[S.sub['type'] == 'pemasukan']
    if inc.empty:
        return {}
    p = inc.pivot_table(index='dow', columns='minggu_mulai', values='amount', aggfunc='sum', fill_value=0).reindex(range(7), fill_value=0)
    p = p.iloc[:, -12:]
    im = ax.imshow(p.values, cmap='YlGn', aspect='auto')
    ax.set_yticks(range(7))
    ax.set_yticklabels(HARI)
    ax.set_xticks(range(p.shape[1]))
    ax.set_xticklabels([f"{c.day} {BULAN_ABBR[c.month - 1]}" for c in p.columns], rotation=45, ha='right')
    ax.grid(False)
    for i in range(p.shape[0]):
        for j in range(p.shape[1]):
            v = p.values[i, j]
            if v > 0:
                ax.text(j, i, rp_short(v).replace('Rp ', ''), ha='center', va='center', fontsize=6)
    ax.set_title('Heatmap Pemasukan: Hari x Minggu (data tidak punya jam)')
    tot = p.sum(axis=1)
    return {'hari_terkuat': HARI[int(tot.idxmax())], 'hari_terlemah': HARI[int(tot.idxmin())],
            'total_per_hari': {HARI[i]: int(v) for i, v in tot.items()}}


def d_heatmap_kat(ax, S):
    tipe = S.a.tipe if S.a.tipe in ('pemasukan', 'pengeluaran') else 'pengeluaran'
    x = S.sub[S.sub['type'] == tipe]
    if x.empty:
        return {}
    p = x.pivot_table(index='category_name', columns='bulan_str', values='amount', aggfunc='sum', fill_value=0)
    p = p.loc[p.sum(axis=1).sort_values(ascending=False).index[:10]]
    ax.imshow(p.values, cmap='Reds' if tipe == 'pengeluaran' else 'Greens', aspect='auto')
    ax.set_yticks(range(len(p)))
    ax.set_yticklabels(p.index)
    ax.set_xticks(range(p.shape[1]))
    ax.set_xticklabels(p.columns, rotation=45, ha='right')
    ax.grid(False)
    for i in range(p.shape[0]):
        for j in range(p.shape[1]):
            if p.values[i, j] > 0:
                ax.text(j, i, rp_short(p.values[i, j]).replace('Rp ', ''), ha='center', va='center', fontsize=6)
    ax.set_title(f"Heatmap {tipe.title()}: Kategori x Bulan")
    return {'tipe': tipe, 'total_per_kategori': {k: int(v) for k, v in p.sum(axis=1).items()}}


def d_waterfall(ax, S):
    m = metrics(S.sub)
    ex = S.sub[S.sub['type'] == 'pengeluaran'].groupby('category_name')['amount'].sum()
    ex = top_series(ex, 6)
    labels = ['Pemasukan'] + list(ex.index) + ['Laba']
    vals = [m['pemasukan']] + [-v for v in ex.values]
    cum, bottoms, cols = 0, [], []
    for i, v in enumerate(vals):
        if i == 0:
            bottoms.append(0)
            cols.append(GREEN)
        else:
            bottoms.append(cum + v if v < 0 else cum)
            cols.append(RED)
        cum += v
    ax.bar(range(len(vals)), [abs(v) for v in vals], bottom=bottoms, color=cols)
    ax.bar(len(vals), abs(cum), bottom=min(0, cum), color=BLUE if cum >= 0 else RED)
    ax.set_xticks(range(len(labels)))
    ax.set_xticklabels(labels, rotation=45, ha='right')
    money(ax)
    ax.set_title('Waterfall: Dari Omzet ke Laba Bersih')
    return {'pemasukan': m['pemasukan'], 'laba': m['laba'], 'pengeluaran_per_kategori': {k: int(v) for k, v in ex.items()}}


def d_forecast(ax, S):
    horizon = S.a.horizon or 14
    f = forecast(S.ctx, horizon, df=S.allf)
    if f['status'] != 'sukses':
        ax.axis('off')
        ax.text(.5, .5, f['pesan'], ha='center', wrap=True)
        return f
    ar = f.pop('_arrays')
    d = daily(S.allf, S.allf['date'].min(), S.ctx.last_data).tail(30)
    ax.plot(d.index, d['pemasukan'], color=GREEN, lw=2, label='Pemasukan aktual')
    ax.plot(d.index, d['pengeluaran'], color=RED, lw=2, label='Pengeluaran aktual')
    ax.plot(ar['dates'], ar['pred_in'], color=GREEN, ls='--', lw=2, label='Prediksi pemasukan')
    ax.plot(ar['dates'], ar['pred_out'], color=RED, ls='--', lw=2, label='Prediksi pengeluaran')
    ax.fill_between(ar['dates'], np.clip(ar['pred_in'] - 1.28 * ar['std_in'], 0, None), ar['pred_in'] + 1.28 * ar['std_in'], color=GREEN, alpha=.12)
    ax.axvline(S.ctx.last_data, color=GRAY, ls=':')
    money(ax)
    ax.legend(fontsize=8)
    plt.setp(ax.get_xticklabels(), rotation=45, ha='right')
    ax.set_title(f"Prediksi {horizon} Hari ke Depan")
    return f


def d_hari(ax, S):
    d = S.d
    per = d.groupby(d.index.dayofweek)['pemasukan'].mean().reindex(range(7), fill_value=0)
    ax.bar(HARI, per.values, color=[AMBER if v == per.max() else BLUE for v in per.values])
    plt.setp(ax.get_xticklabels(), rotation=45, ha='right')
    money(ax)
    ax.set_title('Rata-rata Pemasukan per Hari dalam Seminggu')
    return {'rata_per_hari': {HARI[i]: int(v) for i, v in per.items()}, 'hari_terbaik': HARI[int(per.idxmax())], 'hari_terlemah': HARI[int(per.idxmin())]}


def d_kategori(ax, S):
    tipe = S.a.tipe if S.a.tipe in ('pemasukan', 'pengeluaran') else 'pemasukan'
    s = S.sub[S.sub['type'] == tipe].groupby('category_name')['amount'].sum().sort_values(ascending=False).head(8)
    if s.empty:
        return {}
    ax.barh(s.index, s.values, color=GREEN if tipe == 'pemasukan' else RED)
    ax.invert_yaxis()
    money(ax, 'x')
    for i, v in enumerate(s.values):
        ax.text(v, i, ' ' + rp_short(v), va='center', fontsize=8)
    ax.set_title(f"Top Kategori {tipe.title()}")
    return {'tipe': tipe, 'top': {k: int(v) for k, v in s.items()}}


# registry: nama -> (fungsi, ukuran, jumlah kolom, default hari)
CHARTS = {
    'trend': (d_trend, (8, 4), 1, 30), 'gabungan': (d_gabungan, (9, 4.5), 1, 30), 'bar': (d_bar, (8, 4), 1, 30), 'laba': (d_laba, (8, 4), 1, 30),
    'kumulatif': (d_kumulatif, (8, 4), 1, 30),
    'donut_pemasukan': (mk_donut('pemasukan'), (7, 4), 1, None), 'donut_pengeluaran': (mk_donut('pengeluaran'), (7, 4), 1, None),
    'pareto': (d_pareto, (8, 4.5), 1, None), 'channel': (d_channel, (8, 4), 1, None), 'pembayaran': (d_bayar, (10, 4), 2, None),
    'margin': (d_margin, (8, 4), 1, None), 'distribusi': (d_distribusi, (10, 4), 2, None), 'karyawan': (d_karyawan, (10, 3.5), 2, None),
    'perbandingan': (d_perbandingan, (8, 4), 1, None), 'heatmap': (d_heatmap, (9, 4), 1, 84),
    'heatmap_kategori': (d_heatmap_kat, (9, 5), 1, None), 'waterfall': (d_waterfall, (9, 4.5), 1, None),
    'forecast': (d_forecast, (9, 4), 1, 30), 'hari': (d_hari, (7, 4), 1, 90), 'kategori': (d_kategori, (8, 4), 1, None),
}
DASHBOARD_ALIASES = ['dashboard']
ALL_JENIS = list(CHARTS) + DASHBOARD_ALIASES


def make_scope(ctx, a, jenis):
    df = filt(ctx.df, a)
    days = getattr(a, 'days', None) or (CHARTS[jenis][3] if jenis in CHARTS else None)
    end = ctx.as_of
    start = end - pd.Timedelta(days=days - 1) if days else df['date'].min()
    sub = window(df, start, end)
    if sub.empty:
        return None
    n = (end - start).days + 1
    gran = getattr(a, 'granularitas', None) or ('harian' if n <= 31 else 'mingguan' if n <= 120 else 'bulanan')
    return SimpleNamespace(ctx=ctx, a=a, allf=df, sub=sub, start=start, end=end, days=n, gran=gran, d=daily(sub, start, end))


def save_fig(fig, filename):
    os.makedirs(CHARTS_DIR, exist_ok=True)
    path = os.path.join(CHARTS_DIR, filename)
    fig.tight_layout()
    fig.savefig(path, bbox_inches='tight', facecolor='white')
    plt.close(fig)
    return path


def cleanup_old_charts(hours=6):
    cutoff = time.time() - hours * 3600
    for p in glob.glob(os.path.join(CHARTS_DIR, '*_2???????????????_*.png')):
        try:
            if os.path.getmtime(p) < cutoff:
                os.remove(p)
        except OSError:
            pass


def render_chart(ctx, a, jenis, filename=None, days_override=None):
    """Render satu grafik. Return dict hasil (status, url, ringkasan)."""
    if days_override:
        a = SimpleNamespace(**{**vars(a), 'days': days_override})
    if jenis == 'dashboard':
        return render_dashboard(ctx, a, filename)
    fn, size, ncols, _ = CHARTS[jenis]
    S = make_scope(ctx, a, jenis)
    if S is None:
        return {'status': 'data_kosong', 'jenis': jenis,
                'pesan': f"Tidak ada transaksi pada periode yang diminta (data terakhir: {str(ctx.last_data)[:10]}). Coba rentang hari lebih panjang."}
    fig, axs = plt.subplots(1, ncols, figsize=size) if ncols > 1 else plt.subplots(figsize=size)
    ringkasan = fn(axs, S)
    stamp = time.strftime('%Y%m%d%H%M%S') + f"_{np.random.randint(1000, 9999)}"
    fname = filename or f"{jenis}_{stamp}_.png"
    path = save_fig(fig, fname)
    url = f"{BASE_URL}/uploads/charts/{os.path.basename(path)}"
    judul = f"Grafik {jenis.replace('_', ' ').title()}"
    if isinstance(ringkasan, dict):
        ringkasan.pop('_arrays', None)
    return {'status': 'sukses', 'jenis': jenis, 'judul': judul, 'url': url, 'markdown': f"![{judul}]({url})",
            'periode': {'dari': str(S.start)[:10], 'sampai': str(S.end)[:10], 'hari': S.days},
            'filter': {k: v for k, v in {'kategori': a.kategori, 'channel': a.channel, 'tipe': a.tipe if a.tipe != 'semua' else None}.items() if v},
            'ringkasan_data': ringkasan, '_path': path}


def render_dashboard(ctx, a, filename=None):
    S0 = make_scope(ctx, SimpleNamespace(**{**vars(a), 'days': getattr(a, 'days', None)}), 'dashboard')
    if S0 is None:
        return {'status': 'data_kosong', 'jenis': 'dashboard', 'pesan': 'Tidak ada data pada periode tersebut.'}
    fig = plt.figure(figsize=(14, 8.5))
    gs = fig.add_gridspec(2, 3)
    axk = fig.add_subplot(gs[0, 0])
    m = metrics(S0.sub)
    hs = health_score(ctx)
    axk.axis('off')
    axk.set_title('Ringkasan', loc='left')
    lines = [('Pemasukan', rp(m['pemasukan']), GREEN), ('Pengeluaran', rp(m['pengeluaran']), RED),
             ('Laba Bersih', rp(m['laba']), GREEN if m['laba'] >= 0 else RED), ('Margin', f"{m['margin_persen']}%", BLUE),
             ('Transaksi', str(m['jumlah_transaksi']), GRAY), ('Skor Kesehatan', f"{hs['skor']}/100 ({hs['grade']})", PURPLE)]
    for i, (k, v, c) in enumerate(lines):
        axk.text(0.02, 0.9 - i * 0.15, k, fontsize=10, color='#555', transform=axk.transAxes)
        axk.text(0.58, 0.9 - i * 0.15, v, fontsize=13, color=c, fontweight='bold', transform=axk.transAxes)
    gran_tren = 'mingguan' if S0.days > 60 else 'harian'
    panels = [(d_trend, gs[0, 1:], {'gran': gran_tren}), (d_laba, gs[1, 0], {'gran': 'bulanan' if S0.days > 120 else 'mingguan'}),
              (mk_donut('pengeluaran'), gs[1, 1], {}), (d_kategori, gs[1, 2], {})]
    for fn, pos, over in panels:
        ax = fig.add_subplot(pos)
        fn(ax, SimpleNamespace(**{**vars(S0), **over}))
        if fn is d_kategori:
            pass
    fig.suptitle(f"Dashboard Bisnis Dorokdok ({str(S0.start)[:10]} s/d {str(S0.end)[:10]})", fontsize=14, fontweight='bold')
    stamp = time.strftime('%Y%m%d%H%M%S') + f"_{np.random.randint(1000, 9999)}"
    path = save_fig(fig, filename or f"dashboard_{stamp}_.png")
    url = f"{BASE_URL}/uploads/charts/{os.path.basename(path)}"
    return {'status': 'sukses', 'jenis': 'dashboard', 'judul': 'Dashboard Bisnis', 'url': url, 'markdown': f"![Dashboard Bisnis]({url})",
            'periode': {'dari': str(S0.start)[:10], 'sampai': str(S0.end)[:10], 'hari': S0.days},
            'ringkasan_data': {**m, 'skor_kesehatan': hs['skor'], 'grade': hs['grade']}, '_path': path}


def chart_preprocessing(ctx, filename='preprocessing_all.png'):
    r = ctx.rep['ringkasan']
    fig, axs = plt.subplots(1, 2, figsize=(11, 4))
    labels = ['Baris awal', 'Baris valid', 'Dibuang', 'Outlier ditandai']
    vals = [r['baris_awal'], r['baris_valid'], r['baris_dibuang'], r['outlier']]
    axs[0].barh(labels, vals, color=[GRAY, GREEN, RED, AMBER])
    axs[0].invert_yaxis()
    for i, v in enumerate(vals):
        axs[0].text(v, i, f" {v}", va='center')
    axs[0].set_title(f"Preprocessing: Kualitas Data {r['skor_kualitas']}/100")
    cols = list(r['missing_sebelum'])
    x = np.arange(len(cols))
    axs[1].bar(x - .2, [r['missing_sebelum'][c] for c in cols], .4, color=RED, label='Sebelum')
    axs[1].bar(x + .2, [r['missing_sesudah'][c] for c in cols], .4, color=GREEN, label='Sesudah')
    axs[1].set_xticks(x)
    axs[1].set_xticklabels(cols, rotation=30, ha='right')
    axs[1].legend()
    axs[1].set_title('Missing Value: Sebelum vs Sesudah')
    save_fig(fig, filename)


# ----------------------------------------------------------------------------
# INSIGHTS.JSON (RAG)
# ----------------------------------------------------------------------------
def build_insights(ctx):
    df, ao = ctx.df, ctx.as_of
    inc, exp = df[df['type'] == 'pemasukan'], df[df['type'] == 'pengeluaran']
    tot_in, tot_out = int(inc['amount'].sum()), int(exp['amount'].sum())
    laba = tot_in - tot_out
    margin = round(laba / tot_in * 100, 1) if tot_in > 0 else 0
    bi = df[(df['date'].dt.year == ao.year) & (df['date'].dt.month == ao.month)]
    mb = metrics(bi)
    mt = monthly_table(df)
    flags = month_flags(df, ao)
    tren_bulanan = [{'bulan': k, 'pendapatan': int(r['pemasukan']), 'pengeluaran': int(r['pengeluaran']), 'laba': int(r['laba']),
                     'margin_persen': float(r['margin']), 'pertumbuhan_pendapatan_persen': None if pd.isna(r['growth_pendapatan']) else round(float(r['growth_pendapatan']), 1),
                     'parsial': bool(flags[k])} for k, r in mt.iterrows()]
    top_in = inc.groupby('category_name')['amount'].sum().sort_values(ascending=False).head(5)
    top_out = exp.groupby('category_name')['amount'].sum().sort_values(ascending=False).head(5)
    ch = inc.groupby('sales_channel')['amount'].sum().sort_values(ascending=False).head(6)
    pay = inc.groupby('payment_method')['amount'].sum().sort_values(ascending=False)
    kar = inc[inc['role'] == 'karyawan']['user_name'].value_counts()
    konc = konsentrasi(df)
    hs = health_score(ctx)
    be = break_even(ctx)
    fc = forecast(ctx, 14)
    fc_clean = {k: v for k, v in fc.items() if k != '_arrays'}
    anom = deteksi_anomali(ctx, 5)
    cmp_b, cmp_m = bandingkan(ctx, 'bulan'), bandingkan(ctx, 'minggu')
    pw = peringatan_dini(ctx, hs, konc)
    seas = musiman(df, ao)
    ins = {
        'meta': {'dibuat_pada': time.strftime('%Y-%m-%d %H:%M:%S'), 'acuan_tanggal': str(ao)[:10], 'data_terakhir': str(ctx.last_data)[:10],
                 'sumber': os.path.basename(CSV_PATH),
                 'catatan_tanggal': (f"Tanggal acuan = hari ini ({str(ao)[:10]}). "
                                     + (f"{ctx.rep['ringkasan']['dibuang_masa_depan']} transaksi bertanggal masa depan dibuang saat preprocessing."
                                        if ctx.rep['ringkasan']['dibuang_masa_depan'] else 'Tidak ada transaksi bertanggal masa depan.'))},
        # --- kompatibel dengan versi lama ---
        'laba_bersih': laba, 'margin_persen': margin,
        'rata_rata_transaksi': int(inc['amount'].mean()) if len(inc) else 0,
        'top_channel': str(ch.index[0]) if len(ch) else 'N/A',
        'top_payment': str(inc['payment_method'].mode().iloc[0]) if len(inc) else 'Tunai',
        'bulan_tersibuk': BULAN[int(df['bulan'].mode().iloc[0]) - 1],
        'hari_tersibuk': str(df['nama_hari'].mode().iloc[0]),
        'top_expense_cat': str(top_out.index[0]) if len(top_out) else 'N/A',
        'top_expense_amount': int(top_out.iloc[0]) if len(top_out) else 0,
        'top_user': str(kar.index[0]) if len(kar) else 'Belum ada', 'top_user_count': int(kar.iloc[0]) if len(kar) else 0,
        'total_transaksi_valid': int(len(df)),
        'total_pemasukan': tot_in, 'total_pengeluaran': tot_out,
        'data_mendalam': {
            'bulan_ini': {'pendapatan': mb['pemasukan'], 'pengeluaran': mb['pengeluaran'], 'laba_bersih': mb['laba']},
            'tren_3_bulan_terakhir': [{'bulan': t['bulan'], 'pendapatan': t['pendapatan'], 'pengeluaran': t['pengeluaran'], 'laba': t['laba']} for t in tren_bulanan[-3:]],
            'top_5_kategori_pemasukan': [{'kategori': k, 'total': int(v)} for k, v in top_in.items()],
            'top_5_kategori_pengeluaran': [{'kategori': k, 'total': int(v)} for k, v in top_out.items()],
            'rincian_semua_channel': [{'channel': k, 'total': int(v)} for k, v in ch.items()],
            'rincian_metode_bayar': [{'metode': k, 'total': int(v)} for k, v in pay.items()],
        },
        # --- baru ---
        'tren_bulanan': tren_bulanan,
        'perbandingan_bulan': cmp_b, 'perbandingan_minggu': cmp_m,
        'prediksi_14_hari': fc_clean, 'skor_kesehatan': hs, 'break_even': be, 'anomali': anom,
        'konsentrasi': konc, 'pola_waktu': seas, 'peringatan_dini': pw,
        'karyawan': karyawan_stats(ctx)['ranking'],
        'preprocessing': {'ringkasan': {k: v for k, v in ctx.rep['ringkasan'].items() if k != 'kolom_akhir'}, 'langkah': ctx.rep['langkah']},
    }
    ins['rag_text'] = build_rag_text(ins)
    return ins


def build_rag_text(i):
    L = []
    m = i['meta']
    L += ['=== INFO DATA ===', f"- Sumber: {m['sumber']} | Data terakhir: {m['data_terakhir']} | {m['catatan_tanggal']}"]
    L += ['', '=== RINGKASAN ALL-TIME ===',
          f"- Total Pemasukan: {rp(i['total_pemasukan'])} | Pengeluaran: {rp(i['total_pengeluaran'])} | Laba Bersih: {rp(i['laba_bersih'])}",
          f"- Margin: {i['margin_persen']}% | Rata-rata transaksi pemasukan: {rp(i['rata_rata_transaksi'])} | Total transaksi valid: {i['total_transaksi_valid']}"]
    bi = i['data_mendalam']['bulan_ini']
    L += ['', f"=== KINERJA BULAN INI ({BULAN[pd.Timestamp(m['acuan_tanggal']).month - 1]} {pd.Timestamp(m['acuan_tanggal']).year}) ===",
          f"- Pendapatan: {rp(bi['pendapatan'])} | Pengeluaran: {rp(bi['pengeluaran'])} | Laba: {rp(bi['laba_bersih'])}"]
    cb = i['perbandingan_bulan']
    L += ['', '=== BULAN INI vs BULAN LALU (rentang tanggal sama) ===',
          f"- {cb['periode_ini']['label']}: pemasukan {rp(cb['periode_ini']['pemasukan'])}, pengeluaran {rp(cb['periode_ini']['pengeluaran'])}, laba {rp(cb['periode_ini']['laba'])}",
          f"- {cb['periode_sebelumnya']['label']}: pemasukan {rp(cb['periode_sebelumnya']['pemasukan'])}, pengeluaran {rp(cb['periode_sebelumnya']['pengeluaran'])}, laba {rp(cb['periode_sebelumnya']['laba'])}",
          f"- Perubahan: {cb['perubahan_persen']}", f"- Penyebab utama: {'; '.join(cb['penjelasan_laba']) or '-'}"]
    L += ['', '=== TREN BULANAN (parsial = bulan belum/tidak penuh, hati-hati menyimpulkan) ===']
    for t in i['tren_bulanan'][-6:]:
        L.append(f"- {t['bulan']}{' (parsial)' if t['parsial'] else ''}: pendapatan {rp(t['pendapatan'])}, pengeluaran {rp(t['pengeluaran'])}, laba {rp(t['laba'])}, margin {t['margin_persen']}%")
    L += ['', '=== TOP 5 PRODUK/PEMASUKAN ===']
    L += [f"- {c['kategori']}: {rp(c['total'])}" for c in i['data_mendalam']['top_5_kategori_pemasukan']]
    L += ['', '=== TOP 5 PENGELUARAN ===']
    L += [f"- {c['kategori']}: {rp(c['total'])}" for c in i['data_mendalam']['top_5_kategori_pengeluaran']]
    L += ['', '=== CHANNEL & PEMBAYARAN (pemasukan) ===',
          '- Channel: ' + ', '.join(f"{c['channel']} ({rp(c['total'])})" for c in i['data_mendalam']['rincian_semua_channel']),
          '- Pembayaran: ' + ', '.join(f"{c['metode']} ({rp(c['total'])})" for c in i['data_mendalam']['rincian_metode_bayar'])]
    hs = i['skor_kesehatan']
    L += ['', f"=== SKOR KESEHATAN BISNIS: {hs['skor']}/100 (grade {hs['grade']}) ===",
          f"- Terkuat: {hs['aspek_terkuat']} | Terlemah: {hs['aspek_terlemah']}"] + [f"- {k['aspek']}: {k['skor']}/{k['maks']} ({k['keterangan']})" for k in hs['komponen']]
    be = i['break_even']
    if be.get('omzet_impas_per_bulan'):
        L += ['', '=== BREAK-EVEN ===', f"- Omzet impas: {rp(be['omzet_impas_per_bulan'])}/bulan (~{rp(be['omzet_impas_per_hari'])}/hari). Rata-rata omzet {rp(be['rata_rata_omzet_per_bulan'])}/bulan = {be['status_impas']}."]
    fc = i['prediksi_14_hari']
    if fc.get('status') == 'sukses':
        L += ['', '=== PREDIKSI 14 HARI KE DEPAN ===',
              f"- Total prediksi pemasukan {rp(fc['total_prediksi']['pemasukan'])}, pengeluaran {rp(fc['total_prediksi']['pengeluaran'])}, laba {rp(fc['total_prediksi']['laba'])}",
              f"- Hari terkuat: {fc['hari_terbaik']} | Terlemah: {fc['hari_terlemah']}"]
        if fc.get('proyeksi_akhir_bulan'):
            p = fc['proyeksi_akhir_bulan']
            L.append(f"- Proyeksi akhir {p['bulan']}: pemasukan {rp(p['pemasukan'])}, laba {rp(p['laba'])}")
    L += ['', '=== PERINGATAN DINI ==='] + ([f"- {w}" for w in i['peringatan_dini']] or ['- Tidak ada peringatan.'])
    L += ['', '=== ANOMALI TERBESAR ==='] + [f"- {a['tanggal']} {a['alasan']}" for a in i['anomali']['transaksi_anomali'][:3]]
    pw = i['pola_waktu']
    L += ['', '=== POLA WAKTU ===', f"- Hari terbaik: {pw['hari_terbaik']}, terlemah: {pw['hari_terlemah']}, tersibuk (jumlah transaksi): {i['hari_tersibuk']}"]
    if 'porsi_pemasukan_per_dekade_bulan_persen' in pw:
        L.append(f"- Porsi pemasukan per dekade bulan: {pw['porsi_pemasukan_per_dekade_bulan_persen']}")
    L += ['', '=== SDM ===', f"- Karyawan terajin (input pemasukan): {i['top_user']} ({i['top_user_count']} input)"]
    pr = i['preprocessing']['ringkasan']
    L += ['', '=== KUALITAS DATA (hasil preprocessing) ===',
          f"- {pr['baris_awal']} baris mentah -> {pr['baris_valid']} valid; duplikat {pr['duplikat']}; outlier ditandai {pr['outlier']}; skor kualitas {pr['skor_kualitas']}/100"]
    return '\n'.join(L)


# ----------------------------------------------------------------------------
# CLI
# ----------------------------------------------------------------------------
def build_parser():
    p = argparse.ArgumentParser(description='Data Science Engine Dorokdok')
    p.add_argument('--days', type=int, dest='legacy_days', default=None, help='(kompatibel lama) grafik tren N hari')
    sub = p.add_subparsers(dest='cmd')
    sub.add_parser('dashboard', help='preprocessing + insights.json + semua grafik')
    sub.add_parser('preprocessing', help='tampilkan laporan preprocessing')
    g = sub.add_parser('grafik')
    g.add_argument('--jenis', default='trend', choices=ALL_JENIS)
    g.add_argument('--days', type=int)
    g.add_argument('--kategori')
    g.add_argument('--channel')
    g.add_argument('--tipe', default='semua', choices=['semua', 'pemasukan', 'pengeluaran'])
    g.add_argument('--granularitas', choices=['harian', 'mingguan', 'bulanan'])
    g.add_argument('--periode', choices=['bulan', 'minggu', 'custom'])
    g.add_argument('--horizon', type=int, default=14)
    b = sub.add_parser('bandingkan')
    b.add_argument('--periode', default='bulan', choices=['bulan', 'minggu', 'custom'])
    b.add_argument('--days', type=int, default=7)
    f = sub.add_parser('forecast')
    f.add_argument('--horizon', type=int, default=14)
    an = sub.add_parser('anomali')
    an.add_argument('--top', type=int, default=10)
    an.add_argument('--days', type=int)
    sub.add_parser('kesehatan')
    sub.add_parser('breakeven')
    k = sub.add_parser('kategori')
    k.add_argument('--nama', required=True)
    sub.add_parser('karyawan')
    c = sub.add_parser('cari')
    c.add_argument('--days', type=int)
    c.add_argument('--kategori')
    c.add_argument('--channel')
    c.add_argument('--user')
    c.add_argument('--tipe', default='semua', choices=['semua', 'pemasukan', 'pengeluaran'])
    c.add_argument('--min', type=float)
    c.add_argument('--max', type=float)
    c.add_argument('--urut', default='terbesar', choices=['terbesar', 'terkecil', 'terbaru'])
    c.add_argument('--limit', type=int, default=10)
    return p


def chart_args(**kw):
    base = dict(days=None, kategori=None, channel=None, tipe='semua', granularitas=None, periode=None, horizon=14)
    base.update(kw)
    return SimpleNamespace(**base)


def run_dashboard(ctx):
    cleanup_old_charts()
    ins = build_insights(ctx)
    with open(OUT_PATH, 'w', encoding='utf-8') as fh:
        json.dump(ins, fh, indent=2, ensure_ascii=False, default=_jd)
    ctx.df.to_csv(CLEAN_PATH, index=False, encoding='utf-8')
    chart_preprocessing(ctx)
    plan = [('trend', 'trend_all', {'days': 90}), ('gabungan', 'gabungan_all', {'days': 30}), ('donut_pengeluaran', 'expense_all', {}), ('channel', 'channel_all', {}),
            ('bar', 'bar_all', {}), ('laba', 'laba_all', {}), ('kumulatif', 'kumulatif_all', {'days': 365}),
            ('donut_pemasukan', 'donut_pemasukan_all', {}), ('pareto', 'pareto_all', {}), ('pembayaran', 'pembayaran_all', {}),
            ('margin', 'margin_all', {}), ('distribusi', 'distribusi_all', {}), ('karyawan', 'karyawan_all', {}),
            ('perbandingan', 'perbandingan_all', {}), ('heatmap', 'heatmap_all', {}), ('heatmap_kategori', 'heatmap_kategori_all', {}),
            ('waterfall', 'waterfall_all', {}), ('forecast', 'forecast_all', {}), ('hari', 'hari_all', {}),
            ('kategori', 'kategori_all', {}), ('dashboard', 'dashboard_all', {'days': 365})]
    hasil, gagal = [], []
    for jenis, nama, kw in plan:
        try:
            r = render_chart(ctx, chart_args(**kw), jenis, filename=f"{nama}.png")
            (hasil if r['status'] == 'sukses' else gagal).append(nama)
        except Exception as e:
            gagal.append(f"{nama}: {e}")
            log(traceback.format_exc())
    log(f"[SUKSES] Data Science berhasil di-generate! ({len(hasil)} grafik)")
    return {'status': 'sukses', 'pesan': 'insights.json & grafik berhasil dibuat', 'insights': OUT_PATH, 'data_bersih': CLEAN_PATH,
            'grafik_dibuat': hasil, 'grafik_gagal': gagal, 'skor_kualitas_data': ctx.rep['ringkasan']['skor_kualitas'],
            'skor_kesehatan': ins['skor_kesehatan']['skor']}


def strip_private(d):
    if isinstance(d, dict):
        return {k: strip_private(v) for k, v in d.items() if not k.startswith('_')}
    return d


def main():
    a = build_parser().parse_args()
    ctx = make_ctx()
    cmd = a.cmd
    if cmd is None and a.legacy_days:
        r = render_chart(ctx, chart_args(days=a.legacy_days), 'trend')
        if r.get('status') == 'sukses':  # kompatibel dengan URL lama
            import shutil
            shutil.copyfile(r['_path'], os.path.join(CHARTS_DIR, 'trend_custom.png'))
            r['url_lama'] = f"{BASE_URL}/uploads/charts/trend_custom.png"
        out = r
    elif cmd in (None, 'dashboard'):
        out = run_dashboard(ctx)
    elif cmd == 'preprocessing':
        out = {'status': 'sukses', **ctx.rep}
        out['ringkasan'].pop('kolom_akhir', None)
    elif cmd == 'grafik':
        out = render_chart(ctx, a, a.jenis)
    elif cmd == 'bandingkan':
        out = bandingkan(ctx, a.periode, a.days)
    elif cmd == 'forecast':
        out = forecast(ctx, a.horizon)
    elif cmd == 'anomali':
        out = deteksi_anomali(ctx, a.top, a.days)
    elif cmd == 'kesehatan':
        hs = health_score(ctx)
        out = {**hs, 'peringatan_dini': peringatan_dini(ctx, hs, konsentrasi(ctx.df))}
    elif cmd == 'breakeven':
        out = break_even(ctx)
    elif cmd == 'kategori':
        out = kategori_detail(ctx, a.nama)
    elif cmd == 'karyawan':
        out = karyawan_stats(ctx)
    elif cmd == 'cari':
        out = cari(ctx, a)
    else:
        out = {'status': 'error', 'pesan': f"Perintah tidak dikenal: {cmd}"}
    emit(strip_private(out) if isinstance(out, dict) else out)


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        log(traceback.format_exc())
        emit({'status': 'error', 'pesan': str(e)})
        sys.exit(1)