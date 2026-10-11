import { env } from "./config/env"; // validasi .env dijalankan paling awal (fail fast)
import express from "express";
import cors from "cors";
import os from "os";

import authRoute from "./controllers/auth/auth.route";
import postsRoute from "./routes/posts/posts.route";
import usersRoute from "./routes/users.route";
import categoriesRoute from "./routes/categories/categories.route";
import commentsRoute from "./routes/comments.route";
import likesRoute from "./routes/likes.route";

import {
  cachePublic,
  httpCompression,
  jsonBodyParser,
  notFoundHandler,
  parameterPollutionGuard,
  securityHeaders,
  urlencodedBodyParser,
} from "./controllers/middleware/security.middleware";
import { globalLimiter } from "./controllers/middleware/rateLimit.middleware";

const app = express();

// Di belakang reverse proxy / load balancer (nginx, Cloudflare) set TRUST_PROXY=true
// supaya rate limit membaca IP asli pengguna, bukan IP proxy.
app.set("trust proxy", env.TRUST_PROXY ? 1 : false);
app.disable("x-powered-by");

// ==========================================
// 1. LAPISAN KEAMANAN & PERFORMA
// ==========================================
app.use(securityHeaders); // header keamanan (helmet)
app.use(httpCompression); // kompresi respons -> lebih hemat bandwidth

// CORS hanya untuk origin yang terdaftar. Aplikasi mobile tidak mengirim header
// Origin sehingga tidak terpengaruh; ini penting untuk client versi web.
app.use(
  cors({
    origin: env.CORS_ORIGINS.length > 0 ? env.CORS_ORIGINS : true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false,
    maxAge: 600,
  }),
);

// Batas ukuran body + proteksi HTTP parameter pollution
app.use(jsonBodyParser);
app.use(urlencodedBodyParser);
app.use(parameterPollutionGuard);

// Rate limit global: lapisan pertama anti DDoS / request flood
app.use(globalLimiter);

// ==========================================
// 2. ROUTES
// ==========================================
app.use("/api/v1/auth", authRoute);
app.use("/api/v1/posts", postsRoute);
app.use("/api/v1/users", usersRoute);
app.use("/api/v1/categories", categoriesRoute);
app.use("/api/v1/likes", likesRoute);
app.use("/api/v1", commentsRoute);

app.get("/", cachePublic(30), (req, res) => {
  res.status(200).json({
    success: true,
    message: "KATA API is running",
    data: { version: "v1", basePath: "/api/v1" },
  });
});

// ==========================================
// 3. ERROR HANDLER
// ==========================================
app.use(
  (
    err: any,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    const message = String(err?.message ?? "Unknown error");

    // Detail lengkap hanya masuk log server, tidak dikirim ke client
    console.error(`[error] ${req.method} ${req.originalUrl} - ${message}`);

    if (err?.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "File terlalu besar (max 5MB)",
      });
    }

    if (message.includes("Hanya file gambar")) {
      return res.status(400).json({
        success: false,
        message: "Hanya file gambar yang diperbolehkan",
      });
    }

    // Payload melebihi batas (JSON > 100kb)
    if (err?.type === "entity.too.large") {
      return res.status(413).json({
        success: false,
        message: "Ukuran data terlalu besar (maksimal 100kb untuk JSON)",
      });
    }

    // Error dari parser body (mis. JSON tidak valid) tetap 4xx, pesan generik
    const status = Number(err?.status ?? err?.statusCode ?? 0);
    if (status >= 400 && status < 500) {
      return res.status(status).json({
        success: false,
        message: "Request tidak valid",
      });
    }

    // Pesan generik: mencegah kebocoran struktur database/internal ke client
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  },
);

// 404 selalu JSON
app.use(notFoundHandler);

// ==========================================
// 4. START SERVER
// ==========================================
const server = app.listen(env.PORT, () => {
  const ipaddress =
    Object.values(os.networkInterfaces())
      .flat()
      .find(
        (address) => address && !address.internal && address.family === "IPv4",
      )?.address ?? "localhost";

  console.log(`[server]: server is running at http://localhost:${env.PORT}`);
  console.log(`[server]: server is running at http://${ipaddress}:${env.PORT}`);
});

// Batas waktu request: koneksi menggantung tidak boleh menghabiskan resource
// (mitigasi slowloris / koneksi setengah terbuka).
server.requestTimeout = 30_000;
server.headersTimeout = 35_000;
server.keepAliveTimeout = 10_000;
