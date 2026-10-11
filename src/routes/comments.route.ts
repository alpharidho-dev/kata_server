import { Router } from "express";
import CommentsController from "../controllers/comments/comments.controller";
import { authenticate } from "../controllers/middleware/auth.middleware";
import { writeLimiter } from "../controllers/middleware/rateLimit.middleware";
import { cachePublic } from "../controllers/middleware/security.middleware";

const router = Router();

// GET  /api/v1/posts/:postId/comments
router.get("/posts/:postId/comments", cachePublic(10), CommentsController.getCommentsByPost);

// POST /api/v1/posts/:postId/comments
router.post(
  "/posts/:postId/comments",
  authenticate,
  writeLimiter,
  CommentsController.createComment,
);

// DELETE /api/v1/comments/:id
router.delete(
  "/comments/:id",
  authenticate,
  writeLimiter,
  CommentsController.deleteComment,
);

export default router;