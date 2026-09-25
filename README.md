# Aplikasi Tabungan & Pengeluaran Bulanan

Aplikasi web sederhana untuk mencatat pemasukan, pengeluaran, dan tabungan per bulan.
Berjalan di komputer Anda sendiri (localhost), tanpa database dan **tanpa dependensi eksternal**:
cukup Node.js.

## Fitur

- Catat 4 jenis transaksi: **Pemasukan**, **Pengeluaran**, **Setor Tabungan**, **Tarik Tabungan**
- Ringkasan per bulan: total pemasukan, pengeluaran, yang ditabung, sisa uang, dan total saldo tabungan
- Grafik pengeluaran per kategori, lengkap dengan **anggaran (batas) per kategori** dan peringatan jika terlampaui
- Pindah bulan dengan tombol ‹ › atau pemilih bulan
- Ubah / hapus transaksi, filter per jenis, dan pencarian
- **Target tabungan** (mis. Dana Darurat, Liburan) dengan progres
- Ekspor transaksi bulanan ke **CSV** (bisa dibuka di Excel)
- Tampilan responsif (bisa dibuka dari HP di jaringan yang sama) dan mode gelap otomatis

## Cara Menjalankan

1. Pasang [Node.js](https://nodejs.org) versi 18 atau lebih baru.
2. Jalankan:

   ```bash
   npm start
   ```

3. Buka **http://localhost:3000** di browser.

Tidak perlu `npm install` karena aplikasi hanya memakai modul bawaan Node.js.

### Pengaturan (opsional)

| Variabel    | Default          | Keterangan                                                   |
|-------------|------------------|--------------------------------------------------------------|
| `PORT`      | `3000`           | Port server                                                  |
| `HOST`      | `127.0.0.1`      | Pakai `0.0.0.0` agar bisa dibuka dari HP di jaringan yang sama |
| `DATA_FILE` | `data/db.json`   | Lokasi file penyimpanan data                                 |

Contoh: `PORT=8080 npm start`

## Penyimpanan Data

Semua data disimpan di `data/db.json`. Untuk mencadangkan data, cukup salin file tersebut.
Folder `data/` tidak ikut di-commit ke git.

## Cara Perhitungan

- **Sisa uang** = Pemasukan − Pengeluaran − Setor Tabungan + Tarik Tabungan (bulan terpilih)
- **Ditabung bulan ini** = Setor Tabungan − Tarik Tabungan (bulan terpilih)
- **Total saldo tabungan** = akumulasi semua setoran dikurangi penarikan sampai akhir bulan terpilih

## Pengujian

```bash
npm test
```

## Struktur

```
server.js          # Server HTTP + REST API
public/            # Tampilan (HTML, CSS, JavaScript)
test/api.test.js   # Pengujian API
```
