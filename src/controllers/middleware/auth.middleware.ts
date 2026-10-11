import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

import { env } from "../../config/env";

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  role: string;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

/**
 * Middleware autentikasi JWT.
 * Catatan keamanan:
 * - Tidak ada secret cadangan. Secret wajib dari environment (divalidasi saat boot).
 * - Algoritma dibatasi HS256 agar token tidak bisa dipalsukan lewat algoritma lain.
 * - Isi token diperiksa (harus punya `id` angka) sebelum dipakai controller.
 */
export const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({
      message: "Sesi habis, silakan login kembali",
    });
  }

  const token = authHeader.slice("Bearer ".length).trim();

  if (!token) {
    return res.status(401).json({
      message: "Sesi habis, silakan login kembali",
    });
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ["HS256"],
    }) as AuthUser | string;

    if (typeof decoded === "string" || typeof decoded?.id !== "number") {
      return res.status(403).json({ message: "Token tidak valid" });
    }

    req.user = {
      id: decoded.id,
      username: decoded.username,
      email: decoded.email,
      role: decoded.role,
    };

    next();
  } catch (error) {
    return res.status(403).json({
      message: "Token tidak valid",
    });
  }
};

/**
 * Middleware autentikasi OPSIONAL untuk endpoint publik.
 * - Tanpa token  → request tetap dilanjutkan sebagai pengunjung (guest).
 * - Token valid  → req.user diisi, sehingga response bisa menandai data milik
 *                  pengguna sendiri (mis. `isLiked` pada daftar artikel).
 * - Token rusak  → diabaikan (tidak error), karena endpoint ini memang publik.
 */
export const optionalAuth = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) return next();

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return next();

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ["HS256"],
    }) as AuthUser | string;

    if (typeof decoded !== "string" && typeof decoded?.id === "number") {
      req.user = {
        id: decoded.id,
        username: decoded.username,
        email: decoded.email,
        role: decoded.role,
      };
    }
  } catch (error) {
    // Token tidak valid pada endpoint publik: cukup lanjut sebagai guest
  }

  next();
};
