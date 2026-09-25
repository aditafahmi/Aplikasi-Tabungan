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

1. Pasang [Node.js](https://nodejs.org) versi 18 atau lebih baru (pilih versi **LTS**).
   Setelah memasang, **tutup lalu buka ulang** Terminal/Command Prompt (atau restart komputer).
2. Unduh aplikasi ini: tombol hijau **Code → Download ZIP** di GitHub, lalu **ekstrak** ZIP-nya
   (jangan dijalankan dari dalam ZIP).
3. Jalankan server, pilih salah satu:
   - **Windows:** klik dua kali `start.bat`
   - **macOS:** klik dua kali `start.command` (pertama kali: klik kanan → *Open*)
   - **Terminal (semua sistem):** buka terminal *di folder aplikasi* lalu jalankan `npm start`
4. Browser akan terbuka otomatis. Jika tidak, buka alamat yang tertulis di jendela server,
   biasanya **http://localhost:3000**.

> Jendela server (hitam) harus **tetap terbuka** selama aplikasi dipakai.
> Tidak perlu `npm install` karena aplikasi hanya memakai modul bawaan Node.js.

### Jika localhost tidak bisa dibuka

| Gejala | Penyebab & solusi |
|---|---|
| `'node' is not recognized` / `command not found: node` | Node.js belum terdeteksi. Tutup dan buka ulang terminal atau restart komputer setelah memasang Node.js. Cek dengan `node -v`. |
| `npm ERR! enoent ... package.json` | Terminal tidak berada di folder aplikasi. Masuk dulu ke foldernya: `cd Aplikasi-Tabungan`, lalu `npm start`. |
| Browser: *This site can't be reached* / *ERR_CONNECTION_REFUSED* | Server belum berjalan atau jendelanya ditutup. Jalankan lagi `start.bat` / `npm start`, dan pastikan tidak ada pesan error di jendela itu. |
| Muncul kotak kuning "Aplikasi belum terhubung ke server" | `index.html` dibuka langsung (alamatnya diawali `file://`). Jalankan server lalu buka `http://localhost:3000`. |
| Jendela server menulis "Port 3000 sedang dipakai" | Aplikasi lain memakai port 3000; server otomatis pindah ke 3001, 3002, dst. Buka alamat yang tertulis di jendela server. |
| Masih gagal | Coba `http://127.0.0.1:3000`. |

### Pengaturan (opsional)

| Variabel    | Default                  | Keterangan                                                        |
|-------------|--------------------------|-------------------------------------------------------------------|
| `PORT`      | `3000`                   | Port server                                                       |
| `HOST`      | `127.0.0.1` dan `::1`    | Pakai `0.0.0.0` agar bisa dibuka dari HP di jaringan yang sama    |
| `DATA_FILE` | `data/db.json`           | Lokasi file penyimpanan data                                      |

Contoh mengganti port:
- macOS/Linux: `PORT=8080 npm start`
- Windows (Command Prompt): `set PORT=8080 && npm start`
- Windows (PowerShell): `$env:PORT=8080; npm start`

`npm run serve` menjalankan server tanpa membuka browser otomatis.

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
start.bat          # Peluncur untuk Windows (klik dua kali)
start.command      # Peluncur untuk macOS (klik dua kali)
public/            # Tampilan (HTML, CSS, JavaScript)
test/api.test.js   # Pengujian API
```
