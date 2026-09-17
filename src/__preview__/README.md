# Preview lokal — Dashboard Manajemen, Home, & Jadwal

Merender `screens/Manajemen.tsx`, `screens/Home.tsx`, & `screens/Jadwal.tsx`
dengan **data contoh**,
tanpa Supabase dan tanpa login. Gunanya melihat perubahan tata letak dengan
mata sendiri; `tsc` & `vite build` tidak menangkap badge yang meluber, kartu
yang kehilangan gaya, atau kalimat yang tertulis dua kali.

```bash
npm run dev
# lalu buka:
#   http://localhost:5173/preview.html        → Dashboard Manajemen
#   http://localhost:5173/home-preview.html   → layar Home (strip lapor kendala)
#   http://localhost:5173/jadwal-preview.html → layar Jadwal (baris giliran Live)
```

Tombol di pojok kiri atas menukar sudut pandang **Owner ↔ Manajer** — dipakai
memastikan scorecard benar-benar tidak bocor ke manajer.

Sakelar `masalahTeknisSiap` di `data.ts` mensimulasikan keadaan **sebelum
migrasi 0055 dijalankan**: panel Masalah Teknis jadi baca-saja dan strip lapor
di Home hilang sama sekali.

**Bukan bagian aplikasi.** `vite build` hanya memakai `index.html` sebagai
entry, jadi `preview.html`/`home-preview.html` tidak pernah ikut ke bundel
produksi. Data di `data.ts` fiktif — jangan pernah menaruh data asli di sini.
