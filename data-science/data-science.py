import pandas as pd
import json
import numpy as np

def run_data_science():
    print("Memulai Data Wrangling...")
    
    # 1. Load Data (Default Pandas sudah menggunakan koma sebagai pemisah)
    df = pd.read_csv('transactions.csv')
    
    # 2. Data Wrangling (Membersihkan data)
    # Ubah tipe data kolom tanggal (otomatis mendeteksi format 1/1/2026)
    df['date'] = pd.to_datetime(df['date'], errors='coerce')
    
    # Pastikan amount berupa angka
    df['amount'] = pd.to_numeric(df['amount'], errors='coerce')
    
    # Bersihkan teks 'NULL' menjadi NaN (kosong) pada kolom sales_channel
    df['sales_channel'] = df['sales_channel'].replace('NULL', np.nan)
    df['payment_method'] = df['payment_method'].replace('NULL', np.nan)
    
    # BERSIHKAN DATA ANOMALI: Hapus nominal minus (seperti baris 228 jika ada)
    # Hanya ambil data yang nominalnya > 0
    df_clean = df[df['amount'] > 0].copy()
    
    # Pisahkan data Pemasukan dan Pengeluaran
    income_df = df_clean[df_clean['type'] == 'pemasukan']
    expense_df = df_clean[df_clean['type'] == 'pengeluaran']
    
    # 3. Analisis: Total Pendapatan per Channel
    # Isi channel yang kosong dengan 'Lainnya' agar tidak error
    income_df['sales_channel'] = income_df['sales_channel'].fillna('Lainnya')
    channel_income = income_df.groupby('sales_channel')['amount'].sum().sort_values(ascending=False)
    
    top_channel = channel_income.index[0] if not channel_income.empty else "Tidak ada data"
    top_channel_amount = channel_income.iloc[0] if not channel_income.empty else 0
    
    # 4. Analisis: Bulan Paling Sibuk
    df_clean['month'] = df_clean['date'].dt.month_name()
    busiest_month = df_clean['month'].mode()[0] if not df_clean.empty else "N/A"
    
    # 5. Buat Kesimpulan (Insights)
    insights = {
        "total_pendapatan": int(income_df['amount'].sum()),
        "total_pengeluaran": int(expense_df['amount'].sum()),
        "channel_terbaik": str(top_channel),
        "pendapatan_channel_terbaik": int(top_channel_amount),
        "total_transaksi_valid": len(df_clean),
        "bulan_tersibuk": busiest_month
    }
    
    # Simpan hasil analisis untuk dibaca oleh Gen AI dan Node.js
    with open('insights.json', 'w') as f:
        json.dump(insights, f, indent=4)
        
    print("\n=== HASIL DATA SCIENCE ===")
    print(f"Total Transaksi Valid: {insights['total_transaksi_valid']} baris")
    print(f"Total Pendapatan: Rp {insights['total_pendapatan']:,}")
    print(f"Total Pengeluaran: Rp {insights['total_pengeluaran']:,}")
    print(f"Channel Terbaik: {insights['channel_terbaik']} (Rp {insights['pendapatan_channel_terbaik']:,})")
    print(f"Bulan Paling Sibuk: {insights['bulan_tersibuk']}")
    print("==========================")
    print("Insights berhasil disimpan ke 'insights.json'!")

if __name__ == "__main__":
    run_data_science()