-- =============================================================
-- 0051_ritme_konten.sql · Denyut mingguan produksi konten
-- -------------------------------------------------------------
-- Sebuah kartu konten baru punya SATU tenggat (`deadline`), jadi
-- keterlambatannya baru ketahuan setelah tenggat itu lewat. Padahal
-- produksi konten sosmed adalah rantai dalam satu minggu — take video
-- Senin, editing Selasa, tayang paling lambat Rabu — dan macetnya sudah
-- terlihat Senin sore. Dua kolom di bawah membuat rantai itu tercatat:
--
--  1. `app_config.ritme_konten` — KONTRAK owner–manajer, diisi sekali,
--     bukan tiap minggu:
--       { "jumlah": 2,
--         "hari": { "take": 1, "edit": 2, "tayang": 3 },   -- 1=Senin … 7=Minggu
--         "disetujui": true, "disetujuiPada": "..." }
--     Menempel di `app_config` mengikuti pola `target_bulanan` (0043):
--     satu baris, selalu dibaca bersama-sama, dan hak aksesnya sudah benar
--     (boleh DIBACA semua user login, hanya boleh DIUBAH pengelola).
--
--     Dari `jumlah` lahir slot kosong pada papan mingguan. Itu disengaja:
--     tanpa slot yang digambar dari ritme, manajer bisa "lolos" dengan cara
--     tidak membuat kartu sama sekali — nol kartu = nol telat.
--
--  2. `promo_programs.tahapan` — centang tiap tahap pada satu kartu:
--       [{ "kunci": "take", "selesaiPada": "2026-09-08", "oleh": "…" }]
--     Tahapannya DIPATOK di aplikasi (take → edit → tayang); yang boleh
--     diatur owner hanyalah hari targetnya, lewat `ritme_konten`.
--
-- Sama seperti `selesai_pada` (0046), TANGGAL TIAP TAHAP DISTEMPEL DATABASE,
-- bukan dikirim dari layar — kalau tidak, tahap yang dicentang menyusul tak
-- terbedakan dari yang dikerjakan tepat waktu.
-- =============================================================

alter table public.app_config
  add column if not exists ritme_konten jsonb not null default '{}'::jsonb;

alter table public.promo_programs
  add column if not exists tahapan jsonb not null default '[]'::jsonb;

-- ---------- Stempel tanggal tiap tahap ----------
-- Aturannya dua baris saja:
--   tahap yang SUDAH punya tanggal  → tanggalnya dipertahankan apa adanya,
--   tahap yang BARU muncul          → distempel current_date.
-- Yang pertama membuat penyuntingan kartu (ganti judul, ganti PIC) tidak
-- me-refresh centang lama; yang kedua membuat tanggal tidak bisa dikarang.
-- Menghapus entri = mengurungkan centang, dan mencentangnya lagi akan
-- distempel hari ini — itu memang jawaban yang jujur.
create or replace function public.stamp_promo_tahapan()
returns trigger as $$
declare
  hasil jsonb := '[]'::jsonb;
  item  jsonb;
  kunci text;
  tgl   text;
begin
  if jsonb_typeof(new.tahapan) is distinct from 'array' then
    new.tahapan := '[]'::jsonb;
    return new;
  end if;

  for item in select value from jsonb_array_elements(new.tahapan) loop
    kunci := item->>'kunci';
    -- Entri tanpa kunci tidak bisa dinilai apa pun; buang.
    if kunci is null then
      continue;
    end if;

    tgl := null;
    if tg_op = 'UPDATE' then
      select e->>'selesaiPada'
        into tgl
        from jsonb_array_elements(coalesce(old.tahapan, '[]'::jsonb)) e
       where e->>'kunci' = kunci
       limit 1;
    end if;

    hasil := hasil || jsonb_build_object(
      'kunci',       kunci,
      'oleh',        item->>'oleh',
      'selesaiPada', coalesce(tgl, current_date::text)
    );
  end loop;

  new.tahapan := hasil;
  return new;
end;
$$ language plpgsql security definer set search_path = '';

revoke execute on function public.stamp_promo_tahapan() from public, anon, authenticated;

-- PENTING — urutan nama trigger menentukan urutan eksekusi (Postgres
-- menjalankan BEFORE trigger secara alfabetis):
--   promo_protect_status_*  →  promo_stamp_selesai  →  promo_stamp_tahapan
--   →  promo_touch
-- Stempel tahapan tidak bergantung pada `tahap` maupun `selesai_pada`, jadi
-- posisinya bebas — tapi namanya sengaja dipilih agar tetap berada di dalam
-- rantai `promo_stamp_*` yang sudah didokumentasikan di 0046.
drop trigger if exists promo_stamp_tahapan on public.promo_programs;
create trigger promo_stamp_tahapan before insert or update on public.promo_programs
  for each row execute function public.stamp_promo_tahapan();
