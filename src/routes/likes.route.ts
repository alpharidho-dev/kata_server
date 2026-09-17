import { Router } from "express";

import LikesController from "../controllers/likes/likes.controller";
import { authenticate } from "../controllers/middleware/auth.middleware";
import { noStore } from "../controllers/middleware/security.middleware";

const router = Router();

// GET /api/v1/likes/me — daftar id post yang disukai pengguna yang login.
// Data ini pribadi, jadi tidak boleh disimpan di cache mana pun (noStore).
router.get("/me", authenticate, noStore, LikesController.getMyLikedPostIds);

export default router;
