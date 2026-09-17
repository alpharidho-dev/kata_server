import { Request, Response } from "express";

import {
  userIdSchema,
  userPostParamsSchema,
} from "../../../validations/post.validation";

import { db } from "../../../config/db";

import { postsTable, usersTable } from "../../../config/schema";

import { and, desc, eq } from "drizzle-orm";

import { AuthRequest } from "../../middleware/auth.middleware";

import {
  deleteFromCloudinary,
  uploadToCloudinary,
} from "../../../services/cloudinary.service";

import {
  changePasswordSchema,
  deleteAccountSchema,
  updateProfileSchema,
} from "../../../validations/user.validation";

import { env } from "../../../config/env";
import bcrypt from "bcryptjs";

/** Kolom user yang aman dikirim ke client (tanpa password). */
const PUBLIC_USER_COLUMNS = {
  id: true,
  username: true,
  email: true,
  role: true,
  avatarUrl: true,
  avatarPublicId: true,
  createdAt: true,
  updatedAt: true,
} as const;

export class UsersController {
  // ==========================================
  // GET CURRENT USER / USER YANG SEDANG LOGIN
  // ==========================================
  getCurrentUser = async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "User belum login",
        });
      }

      const [user] = await db
        .select({
          id: usersTable.id,
          username: usersTable.username,
          email: usersTable.email,
          role: usersTable.role,
          avatarUrl: usersTable.avatarUrl,
          avatarPublicId: usersTable.avatarPublicId,
          createdAt: usersTable.createdAt,
          updatedAt: usersTable.updatedAt,
        })
        .from(usersTable)
        .where(eq(usersTable.id, req.user.id));

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User tidak ditemukan",
        });
      }

      return res.status(200).json({
        success: true,
        message: "User retrieved successfully",
        data: {
          user,
        },
      });
    } catch (error: any) {
      console.error("Get current user error:", error);

      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  };

  // ==========================================
  // GET ALL POSTS BY USER ID
  // ==========================================
  getPostsByUserId = async (req: Request, res: Response) => {
    try {
      const validateParams = userIdSchema.parse(req.params);
      const { userId } = validateParams;

      const posts = await db
        .select()
        .from(postsTable)
        .where(
          and(
            eq(postsTable.userId, userId),
            eq(postsTable.status, "published"),
          ),
        )
        .orderBy(desc(postsTable.createdAt));

      return res.status(200).json({
        success: true,
        message: "Retrieving post succesfully",
        data: {
          posts,
        },
      });
    } catch (error: any) {
      console.error("Read post by user ID error:", error);

      // Parameter tidak valid (Zod) → 400, bukan 500
      if (error?.name === "ZodError") {
        return res.status(400).json({
          success: false,
          message: "Invalid request data",
          errors: error.issues ?? error.errors,
        });
      }

      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  };

  // ==========================================
  // GET SPECIFIC POST BY USER ID & POST ID
  // ==========================================
  getUserPost = async (req: Request, res: Response) => {
    try {
      const validatedParams = userPostParamsSchema.parse(req.params);
      const { userId, postId } = validatedParams;

      const [post] = await db
        .select()
        .from(postsTable)
        .where(
          and(
            eq(postsTable.id, postId),
            eq(postsTable.userId, userId),
            eq(postsTable.status, "published"),
          ),
        );

      if (!post) {
        return res.status(404).json({
          success: false,
          message: "Post not found",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Post retrieved successfully",
        data: {
          post,
        },
      });
    } catch (error: any) {
      console.error("Get user post error:", error);

      // Parameter tidak valid (Zod) → 400, bukan 500
      if (error?.name === "ZodError") {
        return res.status(400).json({
          success: false,
          message: "Invalid request data",
          errors: error.issues ?? error.errors,
        });
      }

      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  };

  // ==========================================
  // UPDATE AVATAR (BARU)
  // ==========================================
  updateAvatar = async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "User belum login",
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "File gambar wajib diupload",
        });
      }

      const user = await db.query.usersTable.findFirst({
        where: eq(usersTable.id, req.user.id),
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User tidak ditemukan",
        });
      }

      // Upload ke Cloudinary (folder khusus avatar)
      const uploadResult = await uploadToCloudinary(req.file.buffer, "avatars");

      // Hapus file avatar lama supaya kuota Cloudinary tidak terbuang oleh
      // file yang sudah tidak dipakai lagi.
      if (user.avatarPublicId) {
        await deleteFromCloudinary(user.avatarPublicId);
      }

      // Update DB
      await db
        .update(usersTable)
        .set({
          avatarUrl: uploadResult.secure_url,
          avatarPublicId: uploadResult.public_id,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, req.user.id));

      const updatedUser = await db.query.usersTable.findFirst({
        where: eq(usersTable.id, req.user.id),
        columns: PUBLIC_USER_COLUMNS,
      });

      return res.status(200).json({
        success: true,
        message: "Avatar updated successfully",
        data: { user: updatedUser },
      });
    } catch (error: any) {
      console.error("Update avatar error:", error);

      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  };

  // ==========================================
  // UPDATE PROFIL — username & email
  // ==========================================
  updateProfile = async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res
          .status(401)
          .json({ success: false, message: "User belum login" });
      }

      const { username, email } = updateProfileSchema.parse(req.body);

      // Email dipakai untuk login, jadi harus tetap unik antar pengguna.
      const emailOwner = await db.query.usersTable.findFirst({
        where: eq(usersTable.email, email),
        columns: { id: true },
      });

      if (emailOwner && emailOwner.id !== req.user.id) {
        return res.status(409).json({
          success: false,
          message: "Email sudah digunakan akun lain",
        });
      }

      await db
        .update(usersTable)
        .set({ username, email, updatedAt: new Date() })
        .where(eq(usersTable.id, req.user.id));

      const updatedUser = await db.query.usersTable.findFirst({
        where: eq(usersTable.id, req.user.id),
        columns: PUBLIC_USER_COLUMNS,
      });

      return res.status(200).json({
        success: true,
        message: "Profil berhasil diperbarui",
        data: { user: updatedUser },
      });
    } catch (error: any) {
      console.error("Update profile error:", error);

      if (error?.name === "ZodError") {
        return res.status(400).json({
          success: false,
          message: "Invalid request data",
          errors: error.issues ?? error.errors,
        });
      }

      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  };

  // ==========================================
  // GANTI PASSWORD
  // ==========================================
  changePassword = async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res
          .status(401)
          .json({ success: false, message: "User belum login" });
      }

      const { currentPassword, newPassword } = changePasswordSchema.parse(
        req.body,
      );

      const user = await db.query.usersTable.findFirst({
        where: eq(usersTable.id, req.user.id),
      });

      if (!user) {
        return res
          .status(404)
          .json({ success: false, message: "User tidak ditemukan" });
      }

      // Password lama wajib benar: token yang bocor saja tidak cukup untuk
      // mengambil alih akun orang lain.
      const isCurrentValid = await bcrypt.compare(
        currentPassword,
        user.password,
      );

      if (!isCurrentValid) {
        return res
          .status(401)
          .json({ success: false, message: "Password lama salah" });
      }

      if (await bcrypt.compare(newPassword, user.password)) {
        return res.status(400).json({
          success: false,
          message: "Password baru tidak boleh sama dengan password lama",
        });
      }

      const hashedPassword = await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS);

      await db
        .update(usersTable)
        .set({ password: hashedPassword, updatedAt: new Date() })
        .where(eq(usersTable.id, req.user.id));

      return res.status(200).json({
        success: true,
        message: "Password berhasil diganti",
      });
    } catch (error: any) {
      console.error("Change password error:", error);

      if (error?.name === "ZodError") {
        return res.status(400).json({
          success: false,
          message: "Invalid request data",
          errors: error.issues ?? error.errors,
        });
      }

      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  };

  // ==========================================
  // HAPUS AVATAR
  // ==========================================
  deleteAvatar = async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res
          .status(401)
          .json({ success: false, message: "User belum login" });
      }

      const user = await db.query.usersTable.findFirst({
        where: eq(usersTable.id, req.user.id),
        columns: { id: true, avatarPublicId: true },
      });

      if (!user) {
        return res
          .status(404)
          .json({ success: false, message: "User tidak ditemukan" });
      }

      await deleteFromCloudinary(user.avatarPublicId);

      await db
        .update(usersTable)
        .set({ avatarUrl: null, avatarPublicId: null, updatedAt: new Date() })
        .where(eq(usersTable.id, req.user.id));

      const updatedUser = await db.query.usersTable.findFirst({
        where: eq(usersTable.id, req.user.id),
        columns: PUBLIC_USER_COLUMNS,
      });

      return res.status(200).json({
        success: true,
        message: "Avatar dihapus",
        data: { user: updatedUser },
      });
    } catch (error) {
      console.error("Delete avatar error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  };

  // ==========================================
  // HAPUS AKUN
  // ==========================================
  deleteAccount = async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res
          .status(401)
          .json({ success: false, message: "User belum login" });
      }

      const { password } = deleteAccountSchema.parse(req.body);

      const user = await db.query.usersTable.findFirst({
        where: eq(usersTable.id, req.user.id),
      });

      if (!user) {
        return res
          .status(404)
          .json({ success: false, message: "User tidak ditemukan" });
      }

      // Konfirmasi password: menghapus akun permanen tidak boleh bisa dilakukan
      // hanya karena token masih aktif (mis. HP yang tertinggal terbuka).
      const isValid = await bcrypt.compare(password, user.password);

      if (!isValid) {
        return res
          .status(401)
          .json({ success: false, message: "Password salah" });
      }

      // Bersihkan aset gambar di Cloudinary lebih dulu: baris database akan
      // terhapus permanen lewat cascade, sehingga public_id-nya tidak bisa
      // ditelusuri lagi setelah proses ini.
      const ownPosts = await db
        .select({ imagePublicId: postsTable.imagePublicId })
        .from(postsTable)
        .where(eq(postsTable.userId, req.user.id));

      await deleteFromCloudinary(user.avatarPublicId);
      for (const post of ownPosts) {
        await deleteFromCloudinary(post.imagePublicId);
      }

      // posts, comments, dan likes terhapus otomatis (ON DELETE CASCADE).
      await db.delete(usersTable).where(eq(usersTable.id, req.user.id));

      return res.status(200).json({
        success: true,
        message: "Akun berhasil dihapus",
      });
    } catch (error: any) {
      console.error("Delete account error:", error);

      if (error?.name === "ZodError") {
        return res.status(400).json({
          success: false,
          message: "Invalid request data",
          errors: error.issues ?? error.errors,
        });
      }

      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  };
}

export default new UsersController();