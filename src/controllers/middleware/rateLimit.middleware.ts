import { Request, Response } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import { slowDown } from "express-slow-down";

import { env } from "../../config/env";
import { AuthRequest } from "./auth.middleware";

/** Handler seragam saat limit terlampaui — selalu JSON dan tanpa detail internal. */
const tooManyRequests = (message: string) => (req: Request, res: Response) => {
  res.status(429).json({ success: false, message });
};

/**
 * 1. LIMITER GLOBAL — lapisan pertama anti DDoS / banjir request.
 *    Semua endpoint dibatasi per IP: 120 request / menit (bisa diubah lewat RATE_LIMIT_GLOBAL).
 */
export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: env.RATE_LIMIT_GLOBAL,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: tooManyRequests(
    "Terlalu banyak permintaan dari perangkat ini. Coba lagi sebentar lagi.",
  ),
});

/**
 * 2. SLOW-DOWN AUTH — setiap percobaan setelah batas normal semakin lambat.
 *    Ini membuat serangan bruteforce tidak ekonomis walaupun limit belum tercapai.
 */
export const authSlowDown = slowDown({
  windowMs: 15 * 60 * 1000,
  delayAfter: 5, // 5 percobaan pertama normal
  delayMs: 500, // +0,5 detik per percobaan berikutnya
  maxDelayMs: 10 * 1000, // maksimal 10 detik
});

/**
 * 3. LIMITER AUTH (login & register) — anti bruteforce.
 *    Hanya percobaan GAGAL yang dihitung, dan kuncinya IP + email sehingga
 *    satu akun tidak bisa digempur berkali-kali dari banyak kombinasi.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.RATE_LIMIT_AUTH, // 10 percobaan gagal / 15 menit
  skipSuccessfulRequests: true,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req, _res) => {
    const email = String((req.body as { email?: unknown })?.email ?? "").toLowerCase();
    return `${ipKeyGenerator(req.ip ?? "unknown")}:${email}`;
  },
  handler: tooManyRequests(
    "Terlalu banyak percobaan login/registrasi. Coba lagi 15 menit lagi.",
  ),
});

/**
 * 4. LIMITER ENDPOINT TULIS — mencegah spam artikel & komentar.
 *    60 request tulis / 10 menit per IP (bisa diubah lewat RATE_LIMIT_WRITE).
 */
export const writeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: env.RATE_LIMIT_WRITE,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: tooManyRequests(
    "Terlalu banyak aksi menulis data. Coba lagi beberapa saat lagi.",
  ),
});

/**
 * 5. LIMITER AKSI SENSITIF (ganti password, hapus akun).
 *    Dipasang SETELAH `authenticate` sehingga kuncinya bisa memakai id pengguna —
 *    percobaan pada akun sendiri tidak menghukum pengguna lain yang kebetulan
 *    memakai jaringan/Wi-Fi yang sama.
 */
export const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.RATE_LIMIT_AUTH,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => {
    const userId = (req as AuthRequest).user?.id;
    return userId ? `user:${userId}` : ipKeyGenerator(req.ip ?? "unknown");
  },
  handler: tooManyRequests(
    "Terlalu banyak percobaan pada akun ini. Coba lagi 15 menit lagi.",
  ),
});
