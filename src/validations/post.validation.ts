import { z } from "zod";

const titleSchema = z
  .string()
  .trim()
  .min(3, "Title minimal 3 karakter")
  .max(255, "Maksimal 255 karakter");

const contentSchema = z
  .string()
  .trim()
  .min(10, "Minimal 10 karakter")
  .max(5000, "Konten maksimal 5000 karakter");

// ==========================================
// VALIDATION CREATE POST
// ==========================================
export const createPostSchema = z.object({
  userId: z.coerce.number().int().positive("userId tidak valid"),
  title: titleSchema,
  content: contentSchema,
});

// ==========================================
// VALIDATION UPDATE POST
// ==========================================
export const updatePostSchema = z.object({
  title: titleSchema.optional(),
  content: contentSchema.optional(),
});

// ==========================================
// VALIDATION PARAM :id (detail, update, delete, like)
// ==========================================
export const postIdParamSchema = z.object({
  id: z.coerce.number().int().positive("Post ID tidak valid"),
});

// ==========================================
// VALIDATION GET POSTS BY USER
// ==========================================
export const userIdSchema = z.object({
  userId: z.coerce.number().int().positive("userId tidak valid"),
});

// ==========================================
// VALIDATION GET USER POST
// ==========================================
export const userPostParamsSchema = z.object({
  userId: z.coerce.number().int().positive("userId tidak valid"),
  postId: z.coerce.number().int().positive("postId tidak valid"),
});

// ==========================================
// VALIDATION QUERY PAGINATION & PENCARIAN (?page=&limit=&q=)
// Nilai tidak wajar dijatuhkan ke default, jadi feed tidak pernah error
// hanya karena query string aneh. Batas atas mencegah permintaan data raksasa.
//
// `q` bersifat opsional dan dipakai halaman pencarian: server yang menyaring
// judul, isi, atau nama penulis, sehingga hasilnya menjangkau seluruh artikel —
// bukan hanya yang sedang tampil di layar.
// ==========================================
export const postQuerySchema = z.object({
  page: z.coerce.number().int().positive().max(10_000).catch(1),
  limit: z.coerce.number().int().positive().max(50).catch(20),
  // Terlalu panjang / bukan teks → dianggap tidak ada kata kunci (feed biasa),
  // bukan 400, karena query string berasal dari kolom pencarian yang diketik bebas.
  q: z
    .string()
    .trim()
    .max(100)
    .optional()
    .catch(undefined)
    .transform((value) => (value && value.length > 0 ? value : undefined)),
});
