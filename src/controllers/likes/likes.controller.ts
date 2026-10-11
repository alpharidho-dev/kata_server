import { Response } from "express";
import { and, count, desc, eq } from "drizzle-orm";

import { db } from "../../config/db";
import { likesTable, postsTable } from "../../config/schema";
import { postIdParamSchema } from "../../validations/post.validation";
import { AuthRequest } from "../middleware/auth.middleware";

export class LikesController {
  // ==========================================
  // TOGGLE LIKE  (POST /api/v1/posts/:id/like)
  // ==========================================
  // Satu endpoint untuk "suka" & "batal suka" supaya client tidak perlu tahu
  // status sebelumnya: server yang memutuskan berdasarkan isi tabel likes.
  toggleLike = async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res
          .status(401)
          .json({ success: false, message: "User belum login" });
      }

      const { id: postId } = postIdParamSchema.parse(req.params);

      const post = await db.query.postsTable.findFirst({
        where: eq(postsTable.id, postId),
        columns: { id: true, status: true },
      });

      if (!post || post.status !== "published") {
        return res
          .status(404)
          .json({ success: false, message: "Post tidak ditemukan" });
      }

      const existing = await db.query.likesTable.findFirst({
        where: and(
          eq(likesTable.postId, postId),
          eq(likesTable.userId, req.user.id),
        ),
        columns: { id: true },
      });

      let liked: boolean;

      if (existing) {
        await db.delete(likesTable).where(eq(likesTable.id, existing.id));
        liked = false;
      } else {
        await db
          .insert(likesTable)
          .values({ postId, userId: req.user.id })
          .onDuplicateKeyUpdate({ set: { userId: req.user.id } });
        liked = true;
      }

      const [totalRow] = await db
        .select({ total: count() })
        .from(likesTable)
        .where(eq(likesTable.postId, postId));

      return res.status(200).json({
        success: true,
        message: liked ? "Post disukai" : "Like dibatalkan",
        data: { postId, liked, likesCount: Number(totalRow?.total ?? 0) },
      });
    } catch (error: any) {
      console.error("Toggle like error:", error);

      if (error?.name === "ZodError") {
        return res.status(400).json({
          success: false,
          message: "Invalid request data",
          errors: error.issues ?? error.errors,
        });
      }

      return res
        .status(500)
        .json({ success: false, message: "Terjadi kesalahan pada server" });
    }
  };

  // ==========================================
  // POST YANG SAYA SUKAI  (GET /api/v1/likes/me)
  // ==========================================
  // Client memakainya sekali saat membuka feed, lalu menandai tombol suka
  // tanpa perlu memanggil endpoint detail satu per satu.
  getMyLikedPostIds = async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res
          .status(401)
          .json({ success: false, message: "User belum login" });
      }

      const rows = await db
        .select({ postId: likesTable.postId })
        .from(likesTable)
        .where(eq(likesTable.userId, req.user.id))
        .orderBy(desc(likesTable.createdAt));

      return res.status(200).json({
        success: true,
        message: "Get liked posts successfully",
        data: { postIds: rows.map((row) => Number(row.postId)) },
      });
    } catch (error) {
      console.error("Get liked posts error:", error);
      return res
        .status(500)
        .json({ success: false, message: "Terjadi kesalahan pada server" });
    }
  };
}

export default new LikesController();
