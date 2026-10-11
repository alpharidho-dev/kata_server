import { z } from "zod";

/** Validasi komentar: wajib diisi, dibatasi panjangnya agar tidak dipakai untuk spam. */
export const createCommentSchema = z.object({
  userId: z.coerce.number("userId harus berupa angka").int().positive("userId tidak valid"),
  comment: z
    .string()
    .trim()
    .min(1, "Comment gak boleh kosong")
    .max(1000, "Komentar maksimal 1000 karakter"),
});
