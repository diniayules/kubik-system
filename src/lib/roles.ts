// =============================================================
// roles.ts · Hak akses bertingkat (lihat migration 0042).
//
//   owner    — pemilik. Akses penuh, termasuk gaji per orang & kas.
//   manager  — manajer operasional. Semua hak pengelola KECUALI gaji & kas.
//   karyawan — staf operasional.
//
// Catatan: `role` di sini adalah HAK AKSES, berbeda dari `jabatan`
// (Operator/Kasir/Manajer) yang hanya label pekerjaan di slip gaji.
// =============================================================

export type Role = 'owner' | 'manager' | 'karyawan'

export const ROLE_LIST: Role[] = ['owner', 'manager', 'karyawan']

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Owner',
  manager: 'Manajer',
  karyawan: 'Karyawan',
}

export const ROLE_EMOJI: Record<Role, string> = {
  owner: '👑',
  manager: '🛡️',
  karyawan: '👤',
}

export const ROLE_DESKRIPSI: Record<Role, string> = {
  owner: 'Akses penuh — termasuk gaji karyawan & rekonsiliasi kas.',
  manager: 'Mengelola operasional & melihat Dashboard Manajemen. Tidak melihat gaji per orang maupun kas.',
  karyawan: 'Absensi, laporan harian, inventaris, dan slip gajinya sendiri.',
}

/**
 * Peran akun, dengan fallback aman untuk data lama.
 *
 * `'admin'` adalah nilai LAMA sebelum migration 0042 dan dipetakan ke `owner`
 * supaya aplikasi tetap benar kalau kode ini sempat tayang sebelum migrasinya
 * dijalankan. Setelah migrasi, nilai itu sudah tidak ada lagi di database.
 */
export function asRole(role?: string | null): Role {
  if (role === 'owner' || role === 'admin') return 'owner'
  if (role === 'manager') return 'manager'
  return 'karyawan'
}

/**
 * Pengelola = owner atau manager. Setara `is_admin()` di database, dan
 * dipakai di mana pun kode lama memakai flag `isAdmin`.
 */
export function isPengelola(role?: string | null): boolean {
  return asRole(role) !== 'karyawan'
}

/** Hanya owner: gaji per orang, kas & rekonsiliasi, mengubah hak akses. */
export function isOwner(role?: string | null): boolean {
  return asRole(role) === 'owner'
}
