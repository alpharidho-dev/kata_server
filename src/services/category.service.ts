import { sql } from "drizzle-orm";
import { db } from "../config/db";
import { categoriesTable } from "../config/schema";

// Upsert: insert kalau belum ada, skip kalau udah
export async function upsertCategories(names: string[]) {
  if (!names.length) return;
  await db
    .insert(categoriesTable)
    .values(names.map((name) => ({ name })))
    .onDuplicateKeyUpdate({
      // No-op update biar gak error duplicate
      set: { name: sql`VALUES(name)` },
    });
}

// Autocomplete: cari category dengan prefix tertentu
export async function searchCategories(prefix: string, limit = 10) {
  const clean = prefix.toLowerCase();
  const [rows] = await db.execute(sql`
    SELECT 
      c.name,
      (SELECT COUNT(*) FROM posts p
       WHERE JSON_CONTAINS(p.categories, JSON_QUOTE(c.name))
         AND p.status = 'published') AS post_count
    FROM categories c
    WHERE c.name LIKE CONCAT(${clean}, '%')
    ORDER BY post_count DESC, c.name ASC
    LIMIT ${limit}
  `);
  return rows;
}

// Trending: top kategori dengan post_count terbanyak
export async function getTrendingCategories(limit = 10) {
  const [rows] = await db.execute(sql`
    SELECT 
      c.name,
      (SELECT COUNT(*) FROM posts p
       WHERE JSON_CONTAINS(p.categories, JSON_QUOTE(c.name))
         AND p.status = 'published') AS post_count
    FROM categories c
    ORDER BY post_count DESC, c.name ASC
    LIMIT ${limit}
  `);
  return rows;
}

// Ambil post berdasarkan kategori
export async function getPostsByCategory(name: string, limit = 20) {
  const clean = name.toLowerCase();
  const [rows] = await db.execute(sql`
    SELECT id, user_id, title, content, categories, image_url, created_at
    FROM posts
    WHERE JSON_CONTAINS(categories, JSON_QUOTE(${clean}))
      AND status = 'published'
    ORDER BY created_at DESC
    LIMIT ${limit}
  `);
  return rows;
}