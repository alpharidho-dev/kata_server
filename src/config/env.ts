import dotenv from "dotenv";

dotenv.config();

/**
 * Validasi konfigurasi environment saat server start (fail fast).
 * Server TIDAK boleh jalan dengan konfigurasi tidak lengkap, karena itu sumber
 * dari banyak masalah keamanan (mis. JWT tanpa secret, pool DB tanpa kredensial).
 */
const REQUIRED_ENV = [
  "DB_HOST",
  "DB_PORT",
  "DB_USER",
  "DB_NAME",
  "JWT_SECRET",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
] as const;

const missing = REQUIRED_ENV.filter((key) => !(process.env[key] ?? "").trim());

if (missing.length > 0) {
  console.error(`[config] Variabel .env wajib belum diisi: ${missing.join(", ")}`);
  console.error("[config] Lengkapi file server/.env lalu jalankan ulang server.");
  process.exit(1);
}

const jwtSecret = process.env.JWT_SECRET as string;

if (jwtSecret.length < 32) {
  console.warn(
    "[config] Peringatan keamanan: JWT_SECRET sebaiknya minimal 32 karakter acak.\n" +
      '           Contoh membuat: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"',
  );
}

const corsOrigins = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (corsOrigins.length === 0) {
  console.warn(
    "[config] Peringatan: CORS_ORIGINS belum diset, semua origin diizinkan.\n" +
      "           Untuk produksi isi daftar origin dipisah koma, mis. CORS_ORIGINS=https://kata.example.com",
  );
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  isProduction: process.env.NODE_ENV === "production",
  PORT: Number(process.env.PORT ?? 3006),

  // Auth
  JWT_SECRET: jwtSecret,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? "7d",
  BCRYPT_ROUNDS: Number(process.env.BCRYPT_ROUNDS ?? 10),

  // Jaringan
  TRUST_PROXY: process.env.TRUST_PROXY === "true",
  CORS_ORIGINS: corsOrigins,
  JSON_BODY_LIMIT: process.env.JSON_BODY_LIMIT ?? "100kb",

  // Batas rate limit (bisa disetel tanpa mengubah kode)
  RATE_LIMIT_GLOBAL: Number(process.env.RATE_LIMIT_GLOBAL ?? 120),
  RATE_LIMIT_AUTH: Number(process.env.RATE_LIMIT_AUTH ?? 10),
  RATE_LIMIT_WRITE: Number(process.env.RATE_LIMIT_WRITE ?? 60),

  // Cloudinary
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME as string,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY as string,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET as string,
} as const;
