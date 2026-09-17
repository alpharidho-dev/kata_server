import { z } from "zod";

import { emailSchema, passwordSchema, usernameSchema } from "./auth.validation";

/** Ubah profil: username & email memakai aturan yang sama dengan register. */
export const updateProfileSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
});

/**
 * Ganti password: wajib menyertakan password lama sebagai bukti pemilik akun,
 * sehingga token yang bocor saja tidak cukup untuk mengunci pemilik asli.
 */
export const changePasswordSchema = z.object({
  currentPassword: z
    .string()
    .min(1, "Password lama wajib diisi")
    .max(72, "Password maksimal 72 karakter"),
  newPassword: passwordSchema,
});

/** Hapus akun: dikonfirmasi dengan password agar tidak terhapus karena salah klik/token bocor. */
export const deleteAccountSchema = z.object({
  password: z
    .string()
    .min(1, "Password wajib diisi untuk menghapus akun")
    .max(72, "Password maksimal 72 karakter"),
});
