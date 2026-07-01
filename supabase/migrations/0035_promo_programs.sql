-- =============================================================
-- 0035_promo_programs.sql · Papan Promosi (kanban marketing)
--
-- Satu ruang untuk tim marketing menampung program promosi. Dua sumbu:
--   tahap  : ide → rencana → comingsoon → berjalan → selesai (kolom kanban)
--   status : menunggu / disetujui (persetujuan, pola sama seperti absensi 0018)
--
-- Visibilitas ke karyawan diturunkan dari keduanya (bukan kolom terpisah):
--   karyawan lihat kalau status='disetujui' DAN tahap tayang
--   (comingsoon/berjalan/selesai), ATAU kartu itu miliknya sendiri.
--
-- Kurasi ide: karyawan boleh mengusulkan (masuk 'menunggu' + 'ide'); tidak
-- tampil ke karyawan lain sampai admin menyetujui/mengeditnya. Trigger
-- protect_promo_status mencegah karyawan menyetujui idenya sendiri
-- (replikasi protect_absen_status di 0018).
-- =============================================================

create table if not exists public.promo_programs (
  id              uuid primary key default gen_random_uuid(),
  judul           text not null default '',
  deskripsi       text not null default '',
  tahap           text not null default 'ide'
                    check (tahap in ('ide','rencana','comingsoon','berjalan','selesai')),
  status          text not null default 'menunggu'
                    check (status in ('menunggu','disetujui')),
  tanggal_mulai   date,
  tanggal_selesai date,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists promo_programs_tahap_idx
  on public.promo_programs (tahap);

-- Sentuh updated_at otomatis (fungsi dari 0001_init.sql).
drop trigger if exists promo_touch on public.promo_programs;
create trigger promo_touch before update on public.promo_programs
  for each row execute function public.touch_updated_at();

alter table public.promo_programs enable row level security;

-- SELECT: admin semua; karyawan lihat yang sudah tayang atau miliknya sendiri.
create policy "Promo dibaca"
  on public.promo_programs for select
  using (
    public.is_admin()
    or created_by = auth.uid()
    or (status = 'disetujui' and tahap in ('comingsoon','berjalan','selesai'))
  );

-- INSERT: siapa pun yang login, tapi harus menstempel dirinya sendiri.
create policy "Promo insert"
  on public.promo_programs for insert
  with check (created_by = auth.uid());

-- UPDATE karyawan: hanya ide miliknya yang masih menunggu.
create policy "Karyawan edit ide sendiri"
  on public.promo_programs for update
  using (created_by = auth.uid() and status = 'menunggu')
  with check (created_by = auth.uid());

-- DELETE karyawan: hanya ide miliknya yang masih menunggu.
create policy "Karyawan hapus ide sendiri"
  on public.promo_programs for delete
  using (created_by = auth.uid() and status = 'menunggu');

-- Admin kelola penuh.
create policy "Admin manage promo"
  on public.promo_programs for all
  using (public.is_admin())
  with check (public.is_admin());

-- Anti self-approval: non-admin selalu dipaksa status 'menunggu' + tahap 'ide',
-- dan tidak bisa mengganti pemilik. Admin bebas (itulah persetujuan).
create or replace function public.protect_promo_status()
returns trigger as $$
begin
  if not public.is_admin() then
    new.status := 'menunggu';
    new.tahap := 'ide';
    new.created_by := coalesce(old.created_by, auth.uid());
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = '';

drop trigger if exists promo_protect_status_ins on public.promo_programs;
create trigger promo_protect_status_ins before insert on public.promo_programs
  for each row execute function public.protect_promo_status();

drop trigger if exists promo_protect_status_upd on public.promo_programs;
create trigger promo_protect_status_upd before update on public.promo_programs
  for each row execute function public.protect_promo_status();

-- Fungsi trigger tidak boleh dipanggil sebagai RPC (pola 0007). Trigger tetap
-- jalan sebagai owner tabel meski execute dicabut dari role publik.
revoke execute on function public.protect_promo_status() from public, anon, authenticated;
