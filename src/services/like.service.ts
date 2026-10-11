import { and, count, eq, inArray } from "drizzle-orm";

import { db } from "../config/db";
import { likesTable } from "../config/schema";

export interface LikeInfo {
  likesCount: number;
  isLiked: boolean;
}

/**
 * Ambil rekap like untuk banyak post sekaligus.
 *
 * Sengaja memakai satu query agregat (bukan satu query per post) supaya jumlah
 * query tidak ikut bertambah saat feed memuat 20 artikel — ini yang membuat
 * halaman feed tetap ringan.
 */
export const getLikeInfoByPostIds = async (
  postIds: number[],
  currentUserId?: number,
): Promise<Map<number, LikeInfo>> => {
  const result = new Map<number, LikeInfo>();

  if (postIds.length === 0) return result;

  for (const postId of postIds) {
    result.set(postId, { likesCount: 0, isLiked: false });
  }

  const totals = await db
    .select({ postId: likesTable.postId, total: count() })
    .from(likesTable)
    .where(inArray(likesTable.postId, postIds))
    .groupBy(likesTable.postId);

  for (const row of totals) {
    const postId = Number(row.postId);
    const info = result.get(postId);
    if (info) info.likesCount = Number(row.total);
  }

  // Like milik pengguna yang sedang login hanya ditanyakan bila userId diketahui.
  if (currentUserId !== undefined) {
    const mine = await db
      .select({ postId: likesTable.postId })
      .from(likesTable)
      .where(
        and(
          inArray(likesTable.postId, postIds),
          eq(likesTable.userId, currentUserId),
        ),
      );

    for (const row of mine) {
      const info = result.get(Number(row.postId));
      if (info) info.isLiked = true;
    }
  }

  return result;
};

/** Tempelkan `likesCount` & `isLiked` ke daftar post (feed maupun detail). */
export const withLikeInfo = async <T extends { id?: number | null }>(
  posts: T[],
  currentUserId?: number,
): Promise<Array<T & LikeInfo>> => {
  const postIds = posts
    .map((post) => Number(post.id))
    .filter((id) => Number.isInteger(id) && id > 0);

  const likeInfo = await getLikeInfoByPostIds(postIds, currentUserId);

  return posts.map((post) => ({
    ...post,
    ...(likeInfo.get(Number(post.id)) ?? { likesCount: 0, isLiked: false }),
  }));
};
