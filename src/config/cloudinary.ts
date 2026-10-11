import { v2 as cloudinary } from "cloudinary";

import { env } from "./env";

/**
 * Konfigurasi Cloudinary.
 * Catatan keamanan: kredensial TIDAK boleh dicetak ke log/console — nilainya
 * hanya dibaca dari environment yang sudah divalidasi di `config/env.ts`.
 */
cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
  secure: true,
});

export default cloudinary;
