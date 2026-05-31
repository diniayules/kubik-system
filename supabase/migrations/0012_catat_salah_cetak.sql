-- 0012_catat_salah_cetak.sql
-- Operasi salah cetak atomik: kurangi stok kertas + catat salah_cetak dalam 1 transaksi.
-- Sebelumnya klien mengirim 2 request terpisah (insert salah_cetak + update stok_kertas);
-- jika salah satu gagal/ter-revert, baris salah cetak tersimpan tapi stok tidak berkurang.

create or replace function public.catat_salah_cetak(
  p_kertas_id uuid,
  p_jumlah    int,
  p_tanggal   date default current_date,
  p_alasan    text default ''
) returns public.salah_cetak
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.salah_cetak;
begin
  if auth.uid() is null then
    raise exception 'Harus login untuk mencatat salah cetak' using errcode = '28000';
  end if;
  if p_jumlah is null or p_jumlah <= 0 then
    raise exception 'Jumlah lembar harus lebih dari 0';
  end if;

  update public.stok_kertas
    set stok = greatest(0, stok - p_jumlah)
    where id = p_kertas_id;
  if not found then
    raise exception 'Jenis kertas tidak ditemukan';
  end if;

  insert into public.salah_cetak (tanggal, kertas_id, jumlah, alasan, created_by)
    values (coalesce(p_tanggal, current_date), p_kertas_id, p_jumlah, coalesce(p_alasan, ''), auth.uid())
    returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.catat_salah_cetak(uuid, int, date, text) from public, anon;
grant execute on function public.catat_salah_cetak(uuid, int, date, text) to authenticated;

-- Hapus salah cetak + kembalikan stok (juga atomik).
create or replace function public.hapus_salah_cetak(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kertas uuid;
  v_jumlah int;
begin
  if auth.uid() is null then
    raise exception 'Harus login' using errcode = '28000';
  end if;
  delete from public.salah_cetak where id = p_id
    returning kertas_id, jumlah into v_kertas, v_jumlah;
  if not found then
    return;
  end if;
  if v_kertas is not null then
    update public.stok_kertas set stok = stok + v_jumlah where id = v_kertas;
  end if;
end;
$$;

revoke all on function public.hapus_salah_cetak(uuid) from public, anon;
grant execute on function public.hapus_salah_cetak(uuid) to authenticated;
