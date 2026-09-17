import multer from "multer";

const storage = multer.memoryStorage();

/**
 * Daftar tipe gambar yang diizinkan (allowlist).
 * Sengaja TIDAK memakai `file.mimetype.startsWith("image/")` saja, karena
 * dengan cara itu `image/svg+xml` ikut lolos — SVG bisa memuat script.
 */
const ALLOWED_IMAGE_MIME = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
];

export const uploadSingleImage = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // Maksimal 5MB per file
    files: 1, // hanya satu file
    fields: 10, // batasi jumlah field teks
  },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_IMAGE_MIME.includes(file.mimetype.toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error("Hanya file gambar yang diperbolehkan!"));
    }
  },
}).single("image"); // "image" adalah nama key/field saat upload file
 