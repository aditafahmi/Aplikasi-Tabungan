#!/bin/bash
# Klik dua kali file ini di macOS untuk menjalankan aplikasi.
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js belum terpasang. Pasang dari https://nodejs.org lalu coba lagi."
  read -r -p "Tekan Enter untuk menutup..."
  exit 1
fi
node server.js --open
