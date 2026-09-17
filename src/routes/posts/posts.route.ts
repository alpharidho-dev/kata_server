import { Router } from "express";

import PostsController from "../../controllers/auth/posts/posts.controller";

import { uploadSingleImage } from "../../controllers/middleware/upload.middleware";
import {
  authenticate,
  optionalAuth,
} from "../../controllers/middleware/auth.middleware";
import { cachePublic } from "../../controllers/middleware/security.middleware";
import { writeLimiter } from "../../controllers/middleware/rateLimit.middleware";

import LikesController from "../../controllers/likes/likes.controller";

const router = Router();

// ==========================================
// GET ALL POSTS
// ==========================================
// Cache 15 detik: feed dibaca banyak orang dan isinya sama -> server lebih ringan.
// optionalAuth: kalau request membawa token valid, tiap artikel ditandai `isLiked`
// milik pengguna tersebut; tanpa token tetap boleh diakses sebagai pengunjung.
router.get("/", optionalAuth, cachePublic(15, 30), PostsController.getAllPosts);

// ==========================================
// GET POST DETAIL
// ==========================================
router.get("/:id", optionalAuth, cachePublic(10), PostsController.getPostById);

// ==========================================
// LIKE / UNLIKE POST
// ==========================================
// Satu endpoint untuk dua aksi (toggle) supaya client tidak perlu memeriksa
// status sebelumnya. Wajib login dan dibatasi rate limit agar tidak di-spam.
router.post("/:id/like", authenticate, writeLimiter, LikesController.toggleLike);

// ==========================================
// CREATE POST
// ==========================================
router.post(
  "/",
  authenticate,
  writeLimiter,
  uploadSingleImage,
  PostsController.createPost,
);

// ==========================================
// UPDATE POST
// ==========================================
router.put("/:id", authenticate, writeLimiter, PostsController.updatePost);


// ==========================================
// DELETE POST
// ==========================================
router.delete("/:id", authenticate, writeLimiter, PostsController.deletePost);



export default router;
