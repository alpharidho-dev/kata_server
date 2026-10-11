import { Router } from "express";

import { authenticate } from "../controllers/middleware/auth.middleware";
import { uploadSingleImage } from "../controllers/middleware/upload.middleware";
import { noStore } from "../controllers/middleware/security.middleware";
import {
  sensitiveLimiter,
  writeLimiter,
} from "../controllers/middleware/rateLimit.middleware";

import UsersController from "../controllers/auth/users/users.controller";

const router = Router();

// ==========================================
// GET CURRENT LOGGED-IN USER
// ==========================================
router.get("/me", authenticate, noStore, UsersController.getCurrentUser);

// ==========================================
// PENGATURAN AKUN (halaman Setting di aplikasi)
// ==========================================
// Ubah username & email
router.put(
  "/me",
  authenticate,
  writeLimiter,
  noStore,
  UsersController.updateProfile,
);

// Ganti password (wajib menyertakan password lama)
router.put(
  "/me/password",
  authenticate,
  sensitiveLimiter,
  noStore,
  UsersController.changePassword,
);

// Hapus avatar (tanpa mengunggah file pengganti)
router.delete(
  "/me/avatar",
  authenticate,
  writeLimiter,
  noStore,
  UsersController.deleteAvatar,
);

// Hapus akun permanen (dikonfirmasi dengan password)
router.delete(
  "/me",
  authenticate,
  sensitiveLimiter,
  noStore,
  UsersController.deleteAccount,
);

// ==========================================
// UPDATE AVATAR
// ==========================================
router.put(
  "/avatar",
  authenticate,
  writeLimiter,
  noStore,
  uploadSingleImage,
  UsersController.updateAvatar,
);

// ==========================================
// GET ALL POSTS BY USER ID
// ==========================================
router.get("/:userId", authenticate, noStore, UsersController.getPostsByUserId);

// ==========================================
// GET SPECIFIC POST BY USER ID & POST ID
// ==========================================
router.get("/:userId/posts/:postId", authenticate, noStore, UsersController.getUserPost);

export default router;