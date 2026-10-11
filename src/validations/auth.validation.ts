import { z } from "zod";

/** Username: dibatasi pola aman (huruf, angka, titik, underscore, strip). */
export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username minimal 3 karakter")
  .max(50, "Username maksimal 50 karakter")
  .regex(
    /^[a-zA-Z0-9._-]+$/,
    "Username hanya boleh huruf, angka, titik, underscore, dan strip",
  );

export const emailSchema = z
  .email("Format email tidak valid")
  .max(100, "Email maksimal 100 karakter");

/** Password baru: minimal 8 karakter serta wajib memuat huruf dan angka. */
export const passwordSchema = z
  .string()
  .min(8, "Password minimal 8 karakter")
  .max(72, "Password maksimal 72 karakter") // batas aman bcrypt
  .regex(/[A-Za-z]/, "Password harus memuat huruf")
  .regex(/[0-9]/, "Password harus memuat angka");

/**
 * Register memakai aturan ketat di atas.
 */
export const registerSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
});

/**
 * Login: password TIDAK diberi aturan panjang minimal 8 agar akun lama
 * (dibuat sebelum aturan baru) tetap bisa masuk. Yang penting ukurannya dibatasi
 * supaya tidak ada payload raksasa yang diproses bcrypt.
 */
export const loginSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(1, "Password wajib diisi")
    .max(72, "Password maksimal 72 karakter"),
});
