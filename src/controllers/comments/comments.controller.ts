import { Request, Response } from "express";
import { eq, desc } from "drizzle-orm";
import { db } from "../../config/db";
import { commentsTable, postsTable } from "../../config/schema";
import { createCommentSchema } from "../../validations/comment.validation";

export class CommentsController {
  // ==========================================
  // GET COMMENTS BY POST
  // ==========================================
  getCommentsByPost = async (req: Request, res: Response) => {
    try {
      const postId = Number(req.params.postId);
      if (isNaN(postId)) {
        return res.status(400).json({
          success: false,
          message: "Post ID harus berupa angka",
        });
      }

      const comments = await db.query.commentsTable.findMany({
        where: eq(commentsTable.postId, postId),
        with: {
          user: {
            columns: {
              id: true,
              username: true,
              avatarUrl: true,
            },
          },
        },
        orderBy: [desc(commentsTable.createdAt)],
      });

      return res.status(200).json({
        success: true,
        message: "Get comments successfully",
        data: { comments },
      });
    } catch (error) {
      console.error("Get comments error:", error);
      return res.status(500).json({
        success: false,
        message: "Terjadi kesalahan pada server",
      });
    }
  };

  // ==========================================
  // CREATE COMMENT
  // ==========================================
  createComment = async (req: Request, res: Response) => {
    try {
      const postId = Number(req.params.postId);

      if (isNaN(postId)) {
        return res.status(400).json({
          success: false,
          message: "Post ID harus berupa angka",
        });
      }

      // Validasi body dengan Zod: userId wajib angka positif, comment wajib isi
      // dan dibatasi panjangnya supaya tidak bisa dipakai mengirim payload besar.
      const { userId, comment } = createCommentSchema.parse(req.body);

      // Cek post ada
      const post = await db.query.postsTable.findFirst({
        where: eq(postsTable.id, postId),
      });
      if (!post) {
        return res.status(404).json({
          success: false,
          message: "Post tidak ditemukan",
        });
      }

      const [inserted] = await db
        .insert(commentsTable)
        .values({
          postId,
          userId: Number(userId),
          comment: String(comment).trim(),
        })
        .$returningId();

      const newComment = await db.query.commentsTable.findFirst({
        where: eq(commentsTable.id, inserted.id),
        with: {
          user: {
            columns: {
              id: true,
              username: true,
              avatarUrl: true,
            },
          },
        },
      });

      return res.status(201).json({
        success: true,
        message: "Comment created successfully",
        data: { comment: newComment },
      });
    } catch (error: any) {
      console.error("Create comment error:", error);

      if (error?.name === "ZodError") {
        return res.status(400).json({
          success: false,
          message: "Invalid request data",
          errors: error.issues ?? error.errors,
        });
      }
      return res.status(500).json({
        success: false,
        message: "Terjadi kesalahan pada server",
      });
    }
  };

  // ==========================================
  // DELETE COMMENT
  // ==========================================
  deleteComment = async (req: Request, res: Response) => {
    try {
      const commentId = Number(req.params.id);
      if (isNaN(commentId)) {
        return res.status(400).json({
          success: false,
          message: "Comment ID harus berupa angka",
        });
      }

      const existing = await db.query.commentsTable.findFirst({
        where: eq(commentsTable.id, commentId),
      });
      if (!existing) {
        return res.status(404).json({
          success: false,
          message: "Comment tidak ditemukan",
        });
      }

      await db.delete(commentsTable).where(eq(commentsTable.id, commentId));

      return res.status(200).json({
        success: true,
        message: "Comment deleted successfully",
      });
    } catch (error) {
      console.error("Delete comment error:", error);
      return res.status(500).json({
        success: false,
        message: "Terjadi kesalahan pada server",
      });
    }
  };
}

export default new CommentsController();