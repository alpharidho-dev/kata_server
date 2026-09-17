import compression from "compression";
import express, { NextFunction, Request, Response } from "express";
import helmet from "helmet";
import hpp from "hpp";

import { env } from "../../config/env";

/**
 * Header keamanan (helmet).
 * - contentSecurityPolicy dimatikan karena server ini hanya mengirim JSON, bukan HTML.
 * - crossOriginResourcePolicy: cross-origin agar client Flutter (web) boleh membaca respons.
 * - HSTS hanya aktif di produksi (HTTPS), supaya tidak mengganggu pengembangan lokal.
 */
export const securityHeaders = helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: "no-referrer" },
  hsts: env.isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false,
});

/** Menolak parameter ganda (?tag=a&tag=b) yang dipakai untuk HTTP parameter pollution. */
export const parameterPollutionGuard = hpp();

/** Kompresi respons: respons JSON lebih kecil → lebih ringan untuk jaringan & perangkat. */
export const httpCompression = compression({ threshold: 1024 });

/**
 * Batas ukuran body request.
 * Menahan payload raksasa (salah satu varian serangan DoS) dan memaksa client
 * mengirim data wajar. Gambar tetap lewat multer (limit 5MB per file).
 */
export const jsonBodyParser = express.json({ limit: env.JSON_BODY_LIMIT });
export const urlencodedBodyParser = express.urlencoded({
  extended: false,
  limit: env.JSON_BODY_LIMIT,
});

/**
 * Cache-Control untuk endpoint publik yang isinya boleh agak basi.
 * Manfaat: mengurangi request berulang ke server (server lebih ringan).
 */
export const cachePublic =
  (seconds: number, staleWhileRevalidate = 0) =>
  (req: Request, res: Response, next: NextFunction) => {
    const swr =
      staleWhileRevalidate > 0 ? `, stale-while-revalidate=${staleWhileRevalidate}` : "";
    // Data publik yang sama untuk semua pengguna → boleh di-cache
    res.setHeader("Cache-Control", `public, max-age=${seconds}${swr}`);
    next();
  };

/** Endpoint berisi data pribadi (mis. /users/me) tidak boleh disimpan di cache mana pun. */
export const noStore = (req: Request, res: Response, next: NextFunction) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  next();
};

/** 404 selalu JSON, tanpa membocorkan struktur folder/route internal. */
export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json({ success: false, message: "Endpoint tidak ditemukan" });
};
