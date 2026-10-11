import { Request, Response } from "express";
import { extractHashtags } from "../../../utils/hashtag";
import { upsertCategories } from "../../../services/category.service";
import {
  createPostSchema,
  updatePostSchema,
  postQuerySchema,
} from "../../../validations/post.validation";
import { withLikeInfo } from "../../../services/like.service";
import { db } from "../../../config/db";
import {
  postsTable,
  usersTable,
  PUBLISHED_STATUS,
} from "../../../config/schema";
import { and, count, eq, inArray, like, or } from "drizzle-orm";
import { uploadToCloudinary } from "../../../services/cloudinary.service";
import { AuthRequest } from "../../middleware/auth.middleware";

/** Kolom penulis yang boleh dibuka ke publik (tanpa email/password). */
const AUTHOR_COLUMNS = {
  id: true,
  username: true,
  avatarUrl: true,
} as const;

export class PostController {
  // ==========================================
  // CREATE POST
  // ==========================================
  createPost = async (req: Request, res: Response) => {
    try {
      const validatedData = createPostSchema.parse(req.body);
      const { userId, title, content } = validatedData;

      const hashtags = extractHashtags(content);

      let imageUrl: string | undefined;
      let imagePublicId: string | undefined;

      if (req.file) {
        const uploadResult = await uploadToCloudinary(req.file.buffer);
        imageUrl = uploadResult.secure_url;
        imagePublicId = uploadResult.public_id;
      }

      if (hashtags.length) {
        await upsertCategories(hashtags);
      }

      const [insertedPost] = await db
        .insert(postsTable)
        .values({
          userId,
          title,
          content,
          categories: hashtags,
          imageUrl,
          imagePublicId,
        })
        .$returningId();

      const newPost = await db.query.postsTable.findFirst({
        where: eq(postsTable.id, insertedPost.id),
        with: { author: { columns: AUTHOR_COLUMNS } },
      });

      // Artikel baru belum mungkin punya like, tapi bentuk responsnya disamakan
      // dengan endpoint lain supaya client tidak perlu menebak struktur data.
      const postWithLikes = newPost
        ? (await withLikeInfo([newPost], userId))[0]
        : newPost;

      return res.status(201).json({
        success: true,
        message: "Post created successfully",
        data: { post: postWithLikes },
      });
    } catch (error: any) {
      console.error("Create post error:", error);

      // Validasi Zod → 400, bukan 500
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
  // GET ALL POSTS
  // ==========================================
  getAllPosts = async (req: AuthRequest, res: Response) => {
    try {
      // Query string ?page=&limit=&q= divalidasi Zod; nilai tidak wajar otomatis
      // kembali ke default (page 1, limit 20, maksimum 50) agar tidak ada
      // permintaan data raksasa yang membebani server.
      const { page, limit, q } = postQuerySchema.parse(req.query);
      const offset = (page - 1) * limit;

      // Satu kondisi dipakai untuk daftar maupun hitungan total, supaya
      // `pagination.total` dan `hasMore` tidak pernah bertentangan dengan isi
      // halaman yang sedang dikirim.
      const filters = [eq(postsTable.status, PUBLISHED_STATUS)];

      if (q) {
        const pattern = `%${q}%`;

        // Nama penulis dicari lewat satu query kecil ke tabel `users`, bukan
        // subquery yang mengacu ke tabel `posts`. Query builder di atas memakai
        // alias (`postsTable`), sehingga acuan ke tabel induk dari dalam
        // subquery akan salah tabel; daftar id hasilnya dipakai lewat `IN`.
        const matchedAuthors = await db
          .select({ id: usersTable.id })
          .from(usersTable)
          .where(like(usersTable.username, pattern))
          .limit(200);

        const authorIds = matchedAuthors.map((author) => author.id);

        filters.push(
          or(
            like(postsTable.title, pattern),
            // Hashtag ikut terjaring lewat isi caption, karena hashtag ditulis
            // di dalam caption dan disimpan apa adanya di kolom content.
            like(postsTable.content, pattern),
            ...(authorIds.length
              ? [inArray(postsTable.userId, authorIds)]
              : []),
          )!,
        );
      }

      const where = and(...filters);

      const posts = await db.query.postsTable.findMany({
        where,
        with: { author: { columns: AUTHOR_COLUMNS } },
        orderBy: (posts, { desc }) => [desc(posts.createdAt)],
        limit,
        offset,
      });

      const [totalRow] = await db
        .select({ total: count() })
        .from(postsTable)
        .where(where);

      const total = Number(totalRow?.total ?? 0);

      // `isLiked` hanya terisi kalau request membawa token valid (optionalAuth),
      // jadi pengunjung biasa tetap menerima jumlah like tanpa data pribadi.
      const postsWithLikes = await withLikeInfo(posts, req.user?.id);

      return res.status(200).json({
        success: true,
        message: "Get all posts successfully",
        data: {
          posts: postsWithLikes,
          // `q` dikembalikan apa adanya supaya client bisa memastikan hasil yang
          // diterima memang untuk kata kunci yang sedang diketik.
          search: { q: q ?? null },
          pagination: { page, limit, total, hasMore: page * limit < total },
        },
      });
    } catch (error) {
      console.error("Get all posts error:", error);
      return res.status(500).json({
        success: false,
        message: "Terjadi kesalahan pada server",
      });
    }
  };

  // ==========================================
  // GET POST DETAIL
  // ==========================================
  getPostById = async (req: AuthRequest, res: Response) => {
    try {
      const postId = Number(req.params.id);
      if (isNaN(postId)) {
        return res.status(400).json({
          success: false,
          message: "Post ID harus berupa angka",
        });
      }

      const post = await db.query.postsTable.findFirst({
        where: eq(postsTable.id, postId),
        with: { author: { columns: AUTHOR_COLUMNS } },
      });

      if (!post) {
        return res.status(404).json({
          success: false,
          message: "Post tidak ditemukan",
        });
      }

      const postWithLikes = (await withLikeInfo([post], req.user?.id))[0];

      return res.status(200).json({
        success: true,
        message: "Get post detail successfully",
        data: { post: postWithLikes },
      });
    } catch (error) {
      console.error("Get post detail error:", error);
      return res.status(500).json({
        success: false,
        message: "Terjadi kesalahan pada server",
      });
    }
  };

  // ==========================================
  // UPDATE POST
  // ==========================================
  updatePost = async (req: AuthRequest, res: Response) => {
    try {
      const postId = Number(req.params.id);
      if (isNaN(postId)) {
        return res
          .status(400)
          .json({ success: false, message: "Post ID harus berupa angka" });
      }

      const existingPost = await db.query.postsTable.findFirst({
        where: eq(postsTable.id, postId),
      });
      if (!existingPost) {
        return res
          .status(404)
          .json({ success: false, message: "Post tidak ditemukan" });
      }

      const validatedData = updatePostSchema.parse(req.body);
      const { title, content } = validatedData;

      const hashtags = extractHashtags(content);

      if (hashtags.length) {
        await upsertCategories(hashtags);
      }

      await db
        .update(postsTable)
        .set({
          title,
          content,
          categories: hashtags,
          updatedAt: new Date(),
        })
        .where(eq(postsTable.id, postId));

      const updatedPost = await db.query.postsTable.findFirst({
        where: eq(postsTable.id, postId),
        with: { author: { columns: AUTHOR_COLUMNS } },
      });

      const postWithLikes = updatedPost
        ? (await withLikeInfo([updatedPost], existingPost.userId))[0]
        : updatedPost;

      return res.status(200).json({
        success: true,
        message: "Post updated successfully",
        data: { post: postWithLikes },
      });
    } catch (error: any) {
      console.error("Update post error:", error);

      // Validasi Zod → 400, bukan 500
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
  // DELETE POST
  // ==========================================
  deletePost = async (req: Request, res: Response) => {
    try {
      const postId = Number(req.params.id);
      if (isNaN(postId)) {
        return res.status(400).json({
          success: false,
          message: "Post ID harus berupa angka",
        });
      }

      const existingPost = await db.query.postsTable.findFirst({
        where: eq(postsTable.id, postId),
      });

      if (!existingPost) {
        return res.status(404).json({
          success: false,
          message: "Post tidak ditemukan",
        });
      }

      await db.delete(postsTable).where(eq(postsTable.id, postId));

      return res.status(200).json({
        success: true,
        message: "Post deleted successfully",
      });
    } catch (error) {
      console.error("Delete post error:", error);
      return res.status(500).json({
        success: false,
        message: "Terjadi kesalahan pada server",
      });
    }
  };
}

export default new PostController();
