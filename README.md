# KATA — Server (Express + TypeScript + Drizzle + MySQL)

REST API untuk aplikasi KATA: autentikasi JWT, artikel, komentar, like, kategori/hashtag, dan unggah gambar ke Cloudinary. Semua endpoint berada di bawah `/api/v1`.

> **Berkas ini adalah README repositori server.** Seluruh path di dalamnya ditulis relatif terhadap root repositori ini, jadi perintahnya tetap benar baik dibaca dari repositori server yang berdiri sendiri maupun dari monorepo KATA.

## Ringkasan teknis

| Bagian | Keterangan |
| :--- | :--- |
| Runtime | Node.js, TypeScript, Express 5 |
| Database | MySQL 8 + Drizzle ORM (`drizzle-orm/mysql2`) |
| Validasi | Zod di setiap payload & query string |
| Auth | JWT (`jsonwebtoken`), password di-hash `bcryptjs` |
| Unggah gambar | Multer (memory storage) → Cloudinary |
| Keamanan | Helmet, CORS, HPP, compression, rate limit + slow down |

## Struktur folder

```text
kata-server/  (root repositori ini)
├── .env                       # Kredensial (TIDAK di-commit)
├── .gitignore                 # Berkas yang tidak ikut di-commit
├── drizzle.config.ts          # Konfigurasi drizzle-kit
├── package.json               # Dependency & script (npm run dev)
├── package-lock.json          # Versi dependency yang terkunci
├── tsconfig.json
├── README.md                  # Dokumen ini
├── db/
│   ├── schema.sql             # DDL: buat database + 5 tabel
│   ├── inspect.sql            # Query pemeriksa struktur database
│   ├── report.js              # Cetak struktur database sebagai tabel Markdown
│   └── schema-report.md       # Hasil query pada database berjalan (opsional)
└── src/
    ├── index.ts               # Entry point Express (port 3006)
    ├── config/
    │   ├── db.ts              # Pool MySQL + instance Drizzle
    │   ├── env.ts             # Validasi & pembacaan .env (fail fast)
    │   ├── schema.ts          # Definisi tabel + relasi
    │   └── cloudinary.ts
    ├── controllers/
    │   ├── auth/              # auth, posts, users
    │   ├── categories/
    │   ├── comments/
    │   ├── likes/
    │   └── middleware/        # auth, rateLimit, security, upload
    ├── routes/                # posts, categories, users, comments, likes
    ├── services/              # category, cloudinary, like
    ├── utils/hashtag.ts       # Parser hashtag
    └── validations/           # Skema Zod
```

## Cara membuat database

### 1. Siapkan MySQL

Butuh MySQL 8 (XAMPP/Laragon/Docker juga bisa). Pastikan server MySQL jalan dan kamu punya akun yang boleh membuat database.

```bash
mysql -u root -p
```

### 2. Buat database dan tabelnya

Ada dua cara. Pilih salah satu — hasilnya sama, strukturnya mengikuti `src/config/schema.ts`.

**Cara A — pakai SQL langsung** (cocok kalau tidak mau memasang drizzle-kit):

DDL-nya sudah disimpan sebagai file, jadi cukup dijalankan sekali:

```bash
# dijalankan dari root repositori ini
mysql -u root -p < db/schema.sql

# atau tanpa menyentuh password di riwayat shell
mysql -u root -p -e "source db/schema.sql"
```

Isi `db/schema.sql` sama dengan blok berikut:

```sql
-- Membuat database KATA. Jalankan sekali di MySQL yang sudah terpasang.
-- Nama database harus sama dengan DB_NAME di server/.env.
CREATE DATABASE IF NOT EXISTS blog_app
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE blog_app;

CREATE TABLE IF NOT EXISTS `users` (
  `id` INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `username` VARCHAR(50) NOT NULL,
  `email` VARCHAR(100) NOT NULL,
  `password` VARCHAR(255) NOT NULL,
  `role` ENUM('user','admin') NOT NULL DEFAULT 'user',
  `created_at` TIMESTAMP NULL DEFAULT (now()),
  `updated_at` TIMESTAMP NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  `avatar_url` TEXT NULL,
  `avatar_public_id` VARCHAR(255) NULL,
  UNIQUE KEY `users_email_unique` (`email`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `categories` (
  `id` INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT (now()),
  `updated_at` TIMESTAMP NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `categories_name_unique` (`name`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `posts` (
  `id` INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `user_id` INT NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `content` TEXT NOT NULL,
  `categories` JSON NULL,
  `image_url` TEXT NULL,
  `image_public_id` VARCHAR(255) NULL,
  `status` ENUM('delete','published') NOT NULL DEFAULT 'published',
  `created_at` TIMESTAMP NULL DEFAULT (now()),
  `updated_at` TIMESTAMP NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `posts_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `comments` (
  `id` INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `post_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `comment` TEXT NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT (now()),
  `updated_at` TIMESTAMP NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `comments_post_id_posts_id_fk` FOREIGN KEY (`post_id`) REFERENCES `posts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `comments_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `likes` (
  `id` INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `post_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `likes_post_user_unique` (`post_id`, `user_id`),
  CONSTRAINT `likes_post_id_posts_id_fk` FOREIGN KEY (`post_id`) REFERENCES `posts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `likes_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;
```

DDL di atas sengaja ditulis supaya **sama persis** dengan database yang sedang dipakai: nama constraint-nya mengikuti pola Drizzle (`<tabel>_<kolom>_<tabel tujuan>_<kolom tujuan>_fk`, `<tabel>_<kolom>_unique`, `likes_post_user_unique`), default kolom waktu memakai bentuk ekspresi `(now())`, dan kolom `avatar_*` di tabel `users` berada di urutan terakhir karena ditambahkan belakangan lewat `ALTER TABLE`.

**Cara B — pakai drizzle-kit** (mengikuti `schema.ts` secara otomatis):

```bash
npm install
npx drizzle-kit push          # membuat/menyamakan tabel dengan schema.ts
```

Perintah `drizzle-kit push` hanya butuh kredensial database dari `.env`, jadi lengkapi dulu langkah 3.

### 3. Isi berkas `.env`

| Variabel | Wajib | Keterangan |
| :--- | :--- | :--- |
| `DB_HOST` | ya | host MySQL, mis. `localhost` |
| `DB_PORT` | ya | port MySQL, biasanya `3306` |
| `DB_USER` | ya | user MySQL |
| `DB_PASSWORD` | tidak | password user MySQL (boleh kosong di lokal) |
| `DB_NAME` | ya | nama database, mis. `blog_app` |
| `JWT_SECRET` | ya | minimal 32 karakter acak; server menolak jalan kalau kosong |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | ya | kredensial Cloudinary untuk unggah gambar |
| `DATABASE_URL` | tidak | alternatif satu-baris koneksi (opsional) |
| `PORT` | tidak | default `3006` |
| `CORS_ORIGINS` | tidak | daftar origin dipisah koma; kalau kosong, semua origin diizinkan (khusus pengembangan) |
| `JWT_EXPIRES_IN`, `BCRYPT_ROUNDS`, `RATE_LIMIT_*` | tidak | punya nilai default yang aman |

Contoh membuat `JWT_SECRET` acak:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 4. Jalankan server

```bash
npm install
npm run dev            # nodemon + ts-node, http://localhost:3006
```

`npm run dev` memantau perubahan berkas `.ts` dan `.json` di dalam `src/`, jadi setiap perubahan langsung memuat ulang server tanpa perlu dihentikan.

Kalau ada variabel wajib yang kosong, server sengaja berhenti dan menyebutkan mana yang belum diisi (`src/config/env.ts`).

## Cara memeriksa struktur database

Query berikut membaca `information_schema`, jadi selalu menampilkan kondisi database yang sebenarnya — bukan salinan `schema.ts`. Ketiganya sudah tersimpan di `db/inspect.sql`, dan hasilnya bisa dicetak sebagai tabel Markdown supaya mudah ditempel ke laporan:

```bash
mysql -u root -p blog_app < db/inspect.sql   # jalankan langsung di MySQL
node db/report.js                         # cetak & simpan sebagai db/schema-report.md
node db/report.js db/schema-report.md      # menyimpan ke berkas yang sama secara eksplisit
```

Ganti `blog_app` pada `table_schema` kalau nama database kamu berbeda.

**Kolom tiap tabel** (termasuk tipe, NULL, key, referensi, default, dan auto increment):

```sql
SELECT
    c.table_name                                          AS 'Nama Tabel',
    c.ordinal_position                                    AS 'Urutan',
    c.column_name                                         AS 'Nama Kolom',
    c.column_type                                         AS 'Tipe Data',
    c.is_nullable                                         AS 'Bisa Kosong (NULL)',
    CASE
        WHEN c.column_key = 'PRI' THEN 'PRIMARY KEY'
        WHEN kcu.referenced_table_name IS NOT NULL THEN 'FOREIGN KEY'
        WHEN c.column_key = 'UNI' THEN 'UNIQUE'
        WHEN c.column_key = 'MUL' THEN 'INDEX'
        ELSE '-'
    END                                                   AS 'Key',
    CASE
        WHEN kcu.referenced_table_name IS NOT NULL
        THEN CONCAT(kcu.referenced_table_name, '.', kcu.referenced_column_name)
        ELSE '-'
    END                                                   AS 'Referensi',
    COALESCE(c.column_default, '-')                       AS 'Default',
    CASE
        WHEN c.extra = '' THEN '-'
        ELSE c.extra
    END                                                   AS 'Extra'
FROM information_schema.columns c
LEFT JOIN information_schema.key_column_usage kcu
    ON  c.table_schema = kcu.table_schema
    AND c.table_name   = kcu.table_name
    AND c.column_name  = kcu.column_name
    AND kcu.referenced_table_name IS NOT NULL
WHERE c.table_schema = 'blog_app'
  AND c.table_name IN ('users', 'categories', 'posts', 'comments', 'likes')
ORDER BY FIELD(c.table_name, 'users', 'categories', 'posts', 'comments', 'likes'),
         c.ordinal_position;
```

**Relasi antar tabel** (termasuk aturan `ON DELETE`):

```sql
SELECT
    kcu.table_name              AS 'Tabel',
    kcu.column_name             AS 'Kolom',
    kcu.constraint_name         AS 'Nama Constraint',
    kcu.referenced_table_name   AS 'Referensi Tabel',
    kcu.referenced_column_name  AS 'Referensi Kolom',
    rc.delete_rule              AS 'ON DELETE',
    rc.update_rule              AS 'ON UPDATE'
FROM information_schema.key_column_usage kcu
JOIN information_schema.referential_constraints rc
    ON  rc.constraint_schema = kcu.constraint_schema
    AND rc.constraint_name   = kcu.constraint_name
WHERE kcu.table_schema = 'blog_app'
ORDER BY kcu.table_name, kcu.column_name;
```

**Index & unique constraint:**

```sql
SELECT
    table_name                  AS 'Tabel',
    index_name                  AS 'Nama Index',
    GROUP_CONCAT(column_name ORDER BY seq_in_index) AS 'Kolom',
    CASE non_unique WHEN 0 THEN 'UNIQUE' ELSE 'INDEX' END AS 'Jenis'
FROM information_schema.statistics
WHERE table_schema = 'blog_app'
GROUP BY table_name, index_name, non_unique
ORDER BY table_name, index_name;
```

## Dokumentasi skema database

## 1. Tabel: `users`
Menyimpan data pengguna aplikasi.

| Nama Kolom | Tipe Data | Bisa Kosong (NULL) | Key | Referensi | Default |
| :--- | :--- | :--- | :--- | :--- | :--- |
| id | INT AUTO_INCREMENT | NO | PRIMARY KEY | - | - |
| username | VARCHAR(50) | NO | - | - | - |
| email | VARCHAR(100) | NO | UNIQUE | - | - |
| password | VARCHAR(255) | NO | - | - | - |
| role | ENUM('user','admin') | NO | - | - | 'user' |
| created_at | TIMESTAMP | YES | - | - | CURRENT_TIMESTAMP |
| updated_at | TIMESTAMP | YES | - | - | CURRENT_TIMESTAMP |
| avatar_url | TEXT | YES | - | - | - |
| avatar_public_id | VARCHAR(255) | YES | - | - | - |

## 2. Tabel: `categories`
Master hashtag untuk autocomplete dan trending. Relasi ke `posts.categories` bersifat logis (JSON), bukan Foreign Key.

| Nama Kolom | Tipe Data | Bisa Kosong (NULL) | Key | Referensi | Default |
| :--- | :--- | :--- | :--- | :--- | :--- |
| id | INT AUTO_INCREMENT | NO | PRIMARY KEY | - | - |
| name | VARCHAR(100) | NO | UNIQUE | - | - |
| created_at | TIMESTAMP | YES | - | - | CURRENT_TIMESTAMP |
| updated_at | TIMESTAMP | YES | - | - | CURRENT_TIMESTAMP |

## 3. Tabel: `posts`
Menyimpan artikel atau postingan.

| Nama Kolom | Tipe Data | Bisa Kosong (NULL) | Key | Referensi | Default |
| :--- | :--- | :--- | :--- | :--- | :--- |
| id | INT AUTO_INCREMENT | NO | PRIMARY KEY | - | - |
| user_id | INT | NO | FOREIGN KEY | users.id (ON DELETE CASCADE) | - |
| title | VARCHAR(255) | NO | - | - | - |
| content | TEXT | NO | - | - | - |
| categories | JSON | YES | - | - | - |
| image_url | TEXT | YES | - | - | - |
| image_public_id | VARCHAR(255) | YES | - | - | - |
| status | ENUM('delete','published') | NO | - | - | 'published' |
| created_at | TIMESTAMP | YES | - | - | CURRENT_TIMESTAMP |
| updated_at | TIMESTAMP | YES | - | - | CURRENT_TIMESTAMP |

## 4. Tabel: `comments`
Menyimpan komentar pada artikel.

| Nama Kolom | Tipe Data | Bisa Kosong (NULL) | Key | Referensi | Default |
| :--- | :--- | :--- | :--- | :--- | :--- |
| id | INT AUTO_INCREMENT | NO | PRIMARY KEY | - | - |
| post_id | INT | NO | FOREIGN KEY | posts.id (ON DELETE CASCADE) | - |
| user_id | INT | NO | FOREIGN KEY | users.id (ON DELETE CASCADE) | - |
| comment | TEXT | NO | - | - | - |
| created_at | TIMESTAMP | YES | - | - | CURRENT_TIMESTAMP |
| updated_at | TIMESTAMP | YES | - | - | CURRENT_TIMESTAMP |

## 5. Tabel: `likes`
Satu baris = satu pengguna menyukai satu artikel.
unik: likes_post_user_unique (post_id, user_id) — dijaga di level database.

| Nama Kolom | Tipe Data | Bisa Kosong (NULL) | Key | Referensi | Default |
| :--- | :--- | :--- | :--- | :--- | :--- |
| id | INT AUTO_INCREMENT | NO | PRIMARY KEY | - | - |
| post_id | INT | NO | FOREIGN KEY | posts.id (ON DELETE CASCADE) | - |
| user_id | INT | NO | FOREIGN KEY | users.id (ON DELETE CASCADE) | - |
| created_at | TIMESTAMP | YES | - | - | CURRENT_TIMESTAMP |

---

### Relasi antar tabel

1. **Users -> Posts** (One-to-Many): satu user punya banyak artikel — `posts.user_id` → `users.id`, `ON DELETE CASCADE`.
2. **Users -> Comments** (One-to-Many): satu user punya banyak komentar — `comments.user_id` → `users.id`, `ON DELETE CASCADE`.
3. **Posts -> Comments** (One-to-Many): satu artikel punya banyak komentar — `comments.post_id` → `posts.id`, `ON DELETE CASCADE`.
4. **Users -> Likes** (One-to-Many): satu user bisa menyukai banyak artikel — `likes.user_id` → `users.id`, `ON DELETE CASCADE`.
5. **Posts -> Likes** (One-to-Many): satu artikel bisa disukai banyak user — `likes.post_id` → `posts.id`, `ON DELETE CASCADE`.

Di sisi Drizzle, relasinya juga didefinisikan sebagai berikut:

- `usersRelations` — user punya banyak `posts`, `comments`, dan `likes`.
- `postsRelations` — post punya satu `author`, banyak `comments`, dan banyak `likes`.
- `commentsRelations` — comment punya satu `post` dan satu `user`.
- `likesRelations` — like punya satu `post` dan satu `user`.

### Catatan implementasi

- Seluruh tipe data, nilai ENUM, `NULL`/`NOT NULL`, dan default diambil dari `server/src/config/schema.ts` (Drizzle ORM).
- `role` = `ENUM('user','admin')` default `'user'`; `status` = `ENUM('delete','published')` default `'published'`.
- `updated_at` memakai `onUpdateNow()`, jadi nilainya berubah otomatis setiap baris diperbarui.
- `defaultNow()` menghasilkan default ekspresi `(now())`; tabel `likes` yang dibuat lebih dulu masih memakai bentuk lama `CURRENT_TIMESTAMP`. Keduanya berperilaku sama.
- Di tabel `users`, kolom `avatar_url` dan `avatar_public_id` berada di urutan terakhir karena ditambahkan lewat `ALTER TABLE` setelah tabelnya dibuat.
- Tabel `likes` punya `UNIQUE (post_id, user_id)` bernama `likes_post_user_unique`, sehingga satu pengguna tidak mungkin menyukai artikel yang sama dua kali walaupun dua request datang hampir bersamaan.
- Semua Foreign Key memakai `ON DELETE CASCADE`: menghapus artikel atau akun otomatis menghapus komentar dan like-nya, jadi tidak ada baris yatim.
- Kolom `posts.categories` bertipe JSON berisi array nama hashtag. Tabel `categories` hanya master list untuk autocomplete & trending — relasinya logis, bukan Foreign Key fisik.

## Catatan alur data

- Hashtag diekstrak dari isi tulisan (`src/utils/hashtag.ts`) lalu nama topiknya ikut dicatat ke tabel `categories`; itulah sumber halaman topik populer dan saran autocomplete di client.
- `GET /posts` memakai `optionalAuth`, jadi pengunjung tanpa token tetap menerima jumlah suka, sedangkan pengguna yang login juga menerima penanda `isLiked`.
- Endpoint `GET /posts` menerima `?page=&limit=&q=` (default 20, maksimum 50). Bila `q` diisi, server menyaring judul, isi artikel, dan nama penulis pada satu kondisi yang sama dengan hitungan total, sehingga `pagination.total` dan `hasMore` tetap konsisten dengan isi halaman. Hashtag ikut terjaring karena hashtag ditulis di dalam caption (`content`).

## Lampiran — Hasil query pada database yang berjalan

Lampiran ini disalin dari `db/schema-report.md`. Jalankan `node db/report.js` kapan pun untuk memperbaruinya.

Dihasilkan `node db/report.js` pada 2026-09-16. Isinya dibaca dari `information_schema`, jadi mencerminkan database yang benar-benar berjalan.

### 1) Kolom tiap tabel: urutan, tipe, NULL, key, referensi, default, extra.

| Nama Tabel | Urutan | Nama Kolom | Tipe Data | Bisa Kosong (NULL) | Key | Referensi | Default | Extra |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| users | 1 | id | int | NO | PRIMARY KEY | - | - | auto_increment |
| users | 2 | username | varchar(50) | NO | - | - | - | - |
| users | 3 | email | varchar(100) | NO | UNIQUE | - | - | - |
| users | 4 | password | varchar(255) | NO | - | - | - | - |
| users | 5 | role | enum('user','admin') | NO | - | - | user | - |
| users | 6 | created_at | timestamp | YES | - | - | now() | DEFAULT_GENERATED |
| users | 7 | updated_at | timestamp | YES | - | - | now() | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |
| users | 8 | avatar_url | text | YES | - | - | - | - |
| users | 9 | avatar_public_id | varchar(255) | YES | - | - | - | - |
| categories | 1 | id | int | NO | PRIMARY KEY | - | - | auto_increment |
| categories | 2 | name | varchar(100) | NO | UNIQUE | - | - | - |
| categories | 3 | created_at | timestamp | YES | - | - | now() | DEFAULT_GENERATED |
| categories | 4 | updated_at | timestamp | YES | - | - | now() | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |
| posts | 1 | id | int | NO | PRIMARY KEY | - | - | auto_increment |
| posts | 2 | user_id | int | NO | FOREIGN KEY | users.id | - | - |
| posts | 3 | title | varchar(255) | NO | - | - | - | - |
| posts | 4 | content | text | NO | - | - | - | - |
| posts | 5 | categories | json | YES | - | - | - | - |
| posts | 6 | image_url | text | YES | - | - | - | - |
| posts | 7 | image_public_id | varchar(255) | YES | - | - | - | - |
| posts | 8 | status | enum('delete','published') | NO | - | - | published | - |
| posts | 9 | created_at | timestamp | YES | - | - | now() | DEFAULT_GENERATED |
| posts | 10 | updated_at | timestamp | YES | - | - | now() | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |
| comments | 1 | id | int | NO | PRIMARY KEY | - | - | auto_increment |
| comments | 2 | post_id | int | NO | FOREIGN KEY | posts.id | - | - |
| comments | 3 | user_id | int | NO | FOREIGN KEY | users.id | - | - |
| comments | 4 | comment | text | NO | - | - | - | - |
| comments | 5 | created_at | timestamp | YES | - | - | now() | DEFAULT_GENERATED |
| comments | 6 | updated_at | timestamp | YES | - | - | now() | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |
| likes | 1 | id | int | NO | PRIMARY KEY | - | - | auto_increment |
| likes | 2 | post_id | int | NO | FOREIGN KEY | posts.id | - | - |
| likes | 3 | user_id | int | NO | FOREIGN KEY | users.id | - | - |
| likes | 4 | created_at | timestamp | YES | - | - | CURRENT_TIMESTAMP | DEFAULT_GENERATED |

### 2) Relasi antar tabel beserta aturan ON DELETE / ON UPDATE.

| Tabel | Kolom | Nama Constraint | Referensi Tabel | Referensi Kolom | ON DELETE | ON UPDATE |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| comments | post_id | comments_post_id_posts_id_fk | posts | id | CASCADE | NO ACTION |
| comments | user_id | comments_user_id_users_id_fk | users | id | CASCADE | NO ACTION |
| likes | post_id | likes_post_id_posts_id_fk | posts | id | CASCADE | NO ACTION |
| likes | user_id | likes_user_id_users_id_fk | users | id | CASCADE | NO ACTION |
| posts | user_id | posts_user_id_users_id_fk | users | id | CASCADE | NO ACTION |

### 3) Index dan unique constraint.

| Tabel | Nama Index | Kolom | Jenis |
| :--- | :--- | :--- | :--- |
| categories | categories_name_unique | name | UNIQUE |
| categories | PRIMARY | id | UNIQUE |
| comments | comments_post_id_posts_id_fk | post_id | INDEX |
| comments | comments_user_id_users_id_fk | user_id | INDEX |
| comments | PRIMARY | id | UNIQUE |
| likes | likes_post_user_unique | post_id,user_id | UNIQUE |
| likes | likes_user_id_users_id_fk | user_id | INDEX |
| likes | PRIMARY | id | UNIQUE |
| posts | posts_user_id_users_id_fk | user_id | INDEX |
| posts | PRIMARY | id | UNIQUE |
| users | PRIMARY | id | UNIQUE |
| users | users_email_unique | email | UNIQUE |

## Source code

Berikut isi asli 38 file pada folder ini, dikutip apa adanya. Isi `.env` dikosongkan (nama variabel dipertahankan) dan `package-lock.json` dilewati karena isinya hanya hash dependency.

### `src/config/cloudinary.ts`

```ts
import { v2 as cloudinary } from "cloudinary";

import { env } from "./env";

/**
 * Konfigurasi Cloudinary.
 * Catatan keamanan: kredensial TIDAK boleh dicetak ke log/console — nilainya
 * hanya dibaca dari environment yang sudah divalidasi di `config/env.ts`.
 */
cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
  secure: true,
});

export default cloudinary;
```

### `src/config/db.ts`

```ts
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import * as schema from "./schema";
import dotenv from "dotenv";

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST!,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER!,
  password: process.env.DB_PASSWORD || undefined, 
  database: process.env.DB_NAME!,
});

export const db = drizzle(pool, { schema, mode: "default" });
```

### `src/config/env.ts`

```ts
import dotenv from "dotenv";

dotenv.config();

/**
 * Validasi konfigurasi environment saat server start (fail fast).
 * Server TIDAK boleh jalan dengan konfigurasi tidak lengkap, karena itu sumber
 * dari banyak masalah keamanan (mis. JWT tanpa secret, pool DB tanpa kredensial).
 */
const REQUIRED_ENV = [
  "DB_HOST",
  "DB_PORT",
  "DB_USER",
  "DB_NAME",
  "JWT_SECRET",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
] as const;

const missing = REQUIRED_ENV.filter((key) => !(process.env[key] ?? "").trim());

if (missing.length > 0) {
  console.error(`[config] Variabel .env wajib belum diisi: ${missing.join(", ")}`);
  console.error("[config] Lengkapi file server/.env lalu jalankan ulang server.");
  process.exit(1);
}

const jwtSecret = process.env.JWT_SECRET as string;

if (jwtSecret.length < 32) {
  console.warn(
    "[config] Peringatan keamanan: JWT_SECRET sebaiknya minimal 32 karakter acak.\n" +
      '           Contoh membuat: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"',
  );
}

const corsOrigins = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (corsOrigins.length === 0) {
  console.warn(
    "[config] Peringatan: CORS_ORIGINS belum diset, semua origin diizinkan.\n" +
      "           Untuk produksi isi daftar origin dipisah koma, mis. CORS_ORIGINS=https://kata.example.com",
  );
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  isProduction: process.env.NODE_ENV === "production",
  PORT: Number(process.env.PORT ?? 3006),

  // Auth
  JWT_SECRET: jwtSecret,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? "7d",
  BCRYPT_ROUNDS: Number(process.env.BCRYPT_ROUNDS ?? 10),

  // Jaringan
  TRUST_PROXY: process.env.TRUST_PROXY === "true",
  CORS_ORIGINS: corsOrigins,
  JSON_BODY_LIMIT: process.env.JSON_BODY_LIMIT ?? "100kb",

  // Batas rate limit (bisa disetel tanpa mengubah kode)
  RATE_LIMIT_GLOBAL: Number(process.env.RATE_LIMIT_GLOBAL ?? 120),
  RATE_LIMIT_AUTH: Number(process.env.RATE_LIMIT_AUTH ?? 10),
  RATE_LIMIT_WRITE: Number(process.env.RATE_LIMIT_WRITE ?? 60),

  // Cloudinary
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME as string,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY as string,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET as string,
} as const;
```

### `src/config/schema.ts`

```ts
import { relations } from "drizzle-orm";
import {
  mysqlTable,
  mysqlEnum,
  int,
  varchar,
  text,
  timestamp,
  json,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

export const USER_ROLES = ["user", "admin"] as const;
export const POST_STATUS = ["delete", "published"] as const;

/** Nilai status artikel yang tampil di feed publik. */
export const PUBLISHED_STATUS = "published" as const;

// USERS — tambah avatar
export const usersTable = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  username: varchar("username", { length: 50 }).notNull(),
  email: varchar("email", { length: 100 }).notNull().unique(),
  password: varchar("password", { length: 255 }).notNull(),
  role: mysqlEnum("role", USER_ROLES).notNull().default("user"),
  avatarUrl: text("avatar_url"),
  avatarPublicId: varchar("avatar_public_id", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// CATEGORIES
export const categoriesTable = mysqlTable("categories", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// POSTS
export const postsTable = mysqlTable("posts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  categories: json("categories").$type<string[]>(),
  imageUrl: text("image_url"),
  imagePublicId: varchar("image_public_id", { length: 255 }),
  status: mysqlEnum("status", POST_STATUS).notNull().default("published"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// COMMENTS
export const commentsTable = mysqlTable("comments", {
  id: int("id").autoincrement().primaryKey(),
  postId: int("post_id")
    .notNull()
    .references(() => postsTable.id, { onDelete: "cascade" }),
  userId: int("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  comment: text("comment").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// LIKES — satu baris per pasangan (post, user).
// Index UNIQUE (post_id, user_id) di level database membuat "like ganda" mustahil,
// jadi walaupun dua request datang hampir bersamaan tetap hanya tersimpan sekali.
export const likesTable = mysqlTable(
  "likes",
  {
    id: int("id").autoincrement().primaryKey(),
    postId: int("post_id")
      .notNull()
      .references(() => postsTable.id, { onDelete: "cascade" }),
    userId: int("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    uniqueIndex("likes_post_user_unique").on(table.postId, table.userId),
  ],
);

// Relations
export const usersRelations = relations(usersTable, ({ many }) => ({
  posts: many(postsTable),
  comments: many(commentsTable),
  likes: many(likesTable),
}));

export const postsRelations = relations(postsTable, ({ one, many }) => ({
  author: one(usersTable, {
    fields: [postsTable.userId],
    references: [usersTable.id],
  }),
  comments: many(commentsTable),
  likes: many(likesTable),
}));

export const likesRelations = relations(likesTable, ({ one }) => ({
  post: one(postsTable, {
    fields: [likesTable.postId],
    references: [postsTable.id],
  }),
  user: one(usersTable, {
    fields: [likesTable.userId],
    references: [usersTable.id],
  }),
}));

export const commentsRelations = relations(commentsTable, ({ one }) => ({
  post: one(postsTable, {
    fields: [commentsTable.postId],
    references: [postsTable.id],
  }),
  user: one(usersTable, {
    fields: [commentsTable.userId],
    references: [usersTable.id],
  }),
}));
```

### `src/controllers/auth/auth.controller.ts`

```ts
import { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { AuthRequest } from "../middleware/auth.middleware";
import { env } from "../../config/env";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import { registerSchema, loginSchema } from "../../validations/auth.validation";
import { db } from "../../config/db";
import { usersTable } from "../../config/schema";

export class AuthController {
  register = async (req: Request, res: Response) => {
    try {
      // 1. VALIDATION
      const validatedData = registerSchema.parse(req.body);

      const { username, email, password } = validatedData;

      // 2. CHECK EXISTING EMAIL
      const existingUser = await db.query.usersTable.findFirst({
        where: eq(usersTable.email, email),
      });

      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: "Email already exists",
        });
      }

      // 3. HASH PASSWORD
      const hashedPassword = await bcrypt.hash(password, env.BCRYPT_ROUNDS);

      // 4. INSERT USER
      const [insertedUser] = await db
        .insert(usersTable)
        .values({
          username,
          email,
          password: hashedPassword,
        })
        .$returningId();

      // 5. GET NEW USER
      const newUser = await db.query.usersTable.findFirst({
        where: eq(usersTable.id, insertedUser.id),
      });

      if (!newUser) {
        return res.status(500).json({
          success: false,
          message: "Failed to create user",
        });
      }

      // 6. RESPONSE
      return res.status(201).json({
        success: true,
        message: "Register successful",
        data: {
          user: {
            id: newUser.id,
            username: newUser.username,
            email: newUser.email,
            role: newUser.role,
          },
        },
      });
    } catch (error: any) {
      console.error("Register error:", error);

      // Zod validation error
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

  login = async (req: Request, res: Response) => {
    try {
      // 1. VALIDATION
      const validatedData = loginSchema.parse(req.body);

      const { email, password } = validatedData;

      // 2. FIND USER
      const user = await db.query.usersTable.findFirst({
        where: eq(usersTable.email, email),
      });

      if (!user) {
        return res.status(401).json({
          success: false,
          message: "Email or password incorrect",
        });
      }

      // 3. CHECK PASSWORD
      const isPasswordValid = await bcrypt.compare(password, user.password);

      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          message: "Email or password incorrect",
        });
      }

      // 4. CREATE JWT
      //    Secret sudah dipastikan ada saat boot oleh config/env.ts (fail fast),
      //    jadi tidak ada lagi nilai cadangan yang bisa dipakai untuk memalsukan token.
      const token = jwt.sign(
        {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
        },
        env.JWT_SECRET,
        {
          expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
        },
      );

      // 6. RESPONSE
      return res.status(200).json({
        success: true,
        message: "Login successful",
        data: {
          token,
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
          },
        },
      });
    } catch (error: any) {
      console.error("Login error:", error);

      // Zod validation error
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

  logout = async (req: AuthRequest, res: Response) => {
    // Token JWT stateless, jadi tidak ada data sesi yang perlu dihapus di server.
    // Client menghapus token dari memory + SharedPreferences setelah response ini.
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "User belum login",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Logout successful",
      data: { userId: req.user.id },
    });
  };
}

export default new AuthController();
```

### `src/controllers/auth/auth.route.ts`

```ts
import { Router } from "express";
import AuthController  from "./auth.controller";
import { authenticate } from "../middleware/auth.middleware";
import { authLimiter, authSlowDown } from "../middleware/rateLimit.middleware";

const router = Router();


// Anti bruteforce: percobaan setelah batas normal makin lambat (slow-down) dan
// percobaan GAGAL dibatasi 10x / 15 menit per IP + email (authLimiter).
router.post('/register', authSlowDown, authLimiter, AuthController.register);
router.post('/login', authSlowDown, authLimiter, AuthController.login);

// LOGOUT — JWT bersifat stateless: server memverifikasi sesi, client menghapus token lokal
router.post('/logout', authenticate, AuthController.logout);




export default router;
```

### `src/controllers/auth/posts/posts.controller.ts`

```ts
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
```

### `src/controllers/auth/users/users.controller.ts`

```ts
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
```

### `src/controllers/categories/categories.controller.ts`

```ts
import { Request, Response } from "express";
import {
  searchCategories,
  getTrendingCategories,
  getPostsByCategory,
} from "../../services/category.service";

export class CategoryController {
  // GET /categories/search?q=kul
  search = async (req: Request, res: Response) => {
    try {
      const q = String(req.query.q || "").toLowerCase();
      if (!q) {
        return res.status(200).json({ success: true, data: { categories: [] } });
      }
      const categories = await searchCategories(q);
      return res.status(200).json({ success: true, data: { categories } });
    } catch (error) {
      console.error("Search categories error:", error);
      return res.status(500).json({
        success: false,
        message: "Terjadi kesalahan pada server",
      });
    }
  };

  // GET /categories/trending
  trending = async (req: Request, res: Response) => {
    try {
      const categories = await getTrendingCategories();
      return res.status(200).json({ success: true, data: { categories } });
    } catch (error) {
      console.error("Trending categories error:", error);
      return res.status(500).json({
        success: false,
        message: "Terjadi kesalahan pada server",
      });
    }
  };

  // GET /categories/:name/posts
  postsByCategory = async (req: Request, res: Response) => {
    try {
      const name = String(req.params.name || "").toLowerCase();
      const posts = await getPostsByCategory(name);
      return res.status(200).json({ success: true, data: { posts } });
    } catch (error) {
      console.error("Posts by category error:", error);
      return res.status(500).json({
        success: false,
        message: "Terjadi kesalahan pada server",
      });
    }
  };
}

export default new CategoryController();
```

### `src/controllers/comments/comments.controller.ts`

```ts
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
```

### `src/controllers/likes/likes.controller.ts`

```ts
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
```

### `src/controllers/middleware/auth.middleware.ts`

```ts
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

import { env } from "../../config/env";

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  role: string;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

/**
 * Middleware autentikasi JWT.
 * Catatan keamanan:
 * - Tidak ada secret cadangan. Secret wajib dari environment (divalidasi saat boot).
 * - Algoritma dibatasi HS256 agar token tidak bisa dipalsukan lewat algoritma lain.
 * - Isi token diperiksa (harus punya `id` angka) sebelum dipakai controller.
 */
export const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({
      message: "Sesi habis, silakan login kembali",
    });
  }

  const token = authHeader.slice("Bearer ".length).trim();

  if (!token) {
    return res.status(401).json({
      message: "Sesi habis, silakan login kembali",
    });
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ["HS256"],
    }) as AuthUser | string;

    if (typeof decoded === "string" || typeof decoded?.id !== "number") {
      return res.status(403).json({ message: "Token tidak valid" });
    }

    req.user = {
      id: decoded.id,
      username: decoded.username,
      email: decoded.email,
      role: decoded.role,
    };

    next();
  } catch (error) {
    return res.status(403).json({
      message: "Token tidak valid",
    });
  }
};

/**
 * Middleware autentikasi OPSIONAL untuk endpoint publik.
 * - Tanpa token  → request tetap dilanjutkan sebagai pengunjung (guest).
 * - Token valid  → req.user diisi, sehingga response bisa menandai data milik
 *                  pengguna sendiri (mis. `isLiked` pada daftar artikel).
 * - Token rusak  → diabaikan (tidak error), karena endpoint ini memang publik.
 */
export const optionalAuth = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) return next();

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return next();

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ["HS256"],
    }) as AuthUser | string;

    if (typeof decoded !== "string" && typeof decoded?.id === "number") {
      req.user = {
        id: decoded.id,
        username: decoded.username,
        email: decoded.email,
        role: decoded.role,
      };
    }
  } catch (error) {
    // Token tidak valid pada endpoint publik: cukup lanjut sebagai guest
  }

  next();
};
```

### `src/controllers/middleware/rateLimit.middleware.ts`

```ts
import { Request, Response } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import { slowDown } from "express-slow-down";

import { env } from "../../config/env";
import { AuthRequest } from "./auth.middleware";

/** Handler seragam saat limit terlampaui — selalu JSON dan tanpa detail internal. */
const tooManyRequests = (message: string) => (req: Request, res: Response) => {
  res.status(429).json({ success: false, message });
};

/**
 * 1. LIMITER GLOBAL — lapisan pertama anti DDoS / banjir request.
 *    Semua endpoint dibatasi per IP: 120 request / menit (bisa diubah lewat RATE_LIMIT_GLOBAL).
 */
export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: env.RATE_LIMIT_GLOBAL,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: tooManyRequests(
    "Terlalu banyak permintaan dari perangkat ini. Coba lagi sebentar lagi.",
  ),
});

/**
 * 2. SLOW-DOWN AUTH — setiap percobaan setelah batas normal semakin lambat.
 *    Ini membuat serangan bruteforce tidak ekonomis walaupun limit belum tercapai.
 */
export const authSlowDown = slowDown({
  windowMs: 15 * 60 * 1000,
  delayAfter: 5, // 5 percobaan pertama normal
  delayMs: 500, // +0,5 detik per percobaan berikutnya
  maxDelayMs: 10 * 1000, // maksimal 10 detik
});

/**
 * 3. LIMITER AUTH (login & register) — anti bruteforce.
 *    Hanya percobaan GAGAL yang dihitung, dan kuncinya IP + email sehingga
 *    satu akun tidak bisa digempur berkali-kali dari banyak kombinasi.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.RATE_LIMIT_AUTH, // 10 percobaan gagal / 15 menit
  skipSuccessfulRequests: true,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req, _res) => {
    const email = String((req.body as { email?: unknown })?.email ?? "").toLowerCase();
    return `${ipKeyGenerator(req.ip ?? "unknown")}:${email}`;
  },
  handler: tooManyRequests(
    "Terlalu banyak percobaan login/registrasi. Coba lagi 15 menit lagi.",
  ),
});

/**
 * 4. LIMITER ENDPOINT TULIS — mencegah spam artikel & komentar.
 *    60 request tulis / 10 menit per IP (bisa diubah lewat RATE_LIMIT_WRITE).
 */
export const writeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: env.RATE_LIMIT_WRITE,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: tooManyRequests(
    "Terlalu banyak aksi menulis data. Coba lagi beberapa saat lagi.",
  ),
});

/**
 * 5. LIMITER AKSI SENSITIF (ganti password, hapus akun).
 *    Dipasang SETELAH `authenticate` sehingga kuncinya bisa memakai id pengguna —
 *    percobaan pada akun sendiri tidak menghukum pengguna lain yang kebetulan
 *    memakai jaringan/Wi-Fi yang sama.
 */
export const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.RATE_LIMIT_AUTH,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => {
    const userId = (req as AuthRequest).user?.id;
    return userId ? `user:${userId}` : ipKeyGenerator(req.ip ?? "unknown");
  },
  handler: tooManyRequests(
    "Terlalu banyak percobaan pada akun ini. Coba lagi 15 menit lagi.",
  ),
});
```

### `src/controllers/middleware/security.middleware.ts`

```ts
import compression from "compression";
import express, { NextFunction, Request, Response } from "express";
import helmet from "helmet";
import hpp from "hpp";

import { env } from "../../config/env";

/**
 * Header keamanan (helmet).
 * - contentSecurityPolicy dimatikan karena server ini hanya mengirim JSON, bukan HTML.
 * - crossOriginResourcePolicy: cross-origin agar client Flutter (web) boleh membaca respons.
 * - HSTS hanya aktif di produksi (HTTPS), supaya tidak mengganggu pengembangan lokal.
 */
export const securityHeaders = helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: "no-referrer" },
  hsts: env.isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false,
});

/** Menolak parameter ganda (?tag=a&tag=b) yang dipakai untuk HTTP parameter pollution. */
export const parameterPollutionGuard = hpp();

/** Kompresi respons: respons JSON lebih kecil → lebih ringan untuk jaringan & perangkat. */
export const httpCompression = compression({ threshold: 1024 });

/**
 * Batas ukuran body request.
 * Menahan payload raksasa (salah satu varian serangan DoS) dan memaksa client
 * mengirim data wajar. Gambar tetap lewat multer (limit 5MB per file).
 */
export const jsonBodyParser = express.json({ limit: env.JSON_BODY_LIMIT });
export const urlencodedBodyParser = express.urlencoded({
  extended: false,
  limit: env.JSON_BODY_LIMIT,
});

/**
 * Cache-Control untuk endpoint publik yang isinya boleh agak basi.
 * Manfaat: mengurangi request berulang ke server (server lebih ringan).
 */
export const cachePublic =
  (seconds: number, staleWhileRevalidate = 0) =>
  (req: Request, res: Response, next: NextFunction) => {
    const swr =
      staleWhileRevalidate > 0 ? `, stale-while-revalidate=${staleWhileRevalidate}` : "";
    // Data publik yang sama untuk semua pengguna → boleh di-cache
    res.setHeader("Cache-Control", `public, max-age=${seconds}${swr}`);
    next();
  };

/** Endpoint berisi data pribadi (mis. /users/me) tidak boleh disimpan di cache mana pun. */
export const noStore = (req: Request, res: Response, next: NextFunction) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  next();
};

/** 404 selalu JSON, tanpa membocorkan struktur folder/route internal. */
export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json({ success: false, message: "Endpoint tidak ditemukan" });
};
```

### `src/controllers/middleware/upload.middleware.ts`

```ts
import multer from "multer";

const storage = multer.memoryStorage();

/**
 * Daftar tipe gambar yang diizinkan (allowlist).
 * Sengaja TIDAK memakai `file.mimetype.startsWith("image/")` saja, karena
 * dengan cara itu `image/svg+xml` ikut lolos — SVG bisa memuat script.
 */
const ALLOWED_IMAGE_MIME = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
];

export const uploadSingleImage = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // Maksimal 5MB per file
    files: 1, // hanya satu file
    fields: 10, // batasi jumlah field teks
  },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_IMAGE_MIME.includes(file.mimetype.toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error("Hanya file gambar yang diperbolehkan!"));
    }
  },
}).single("image"); // "image" adalah nama key/field saat upload file
 
```

### `src/index.ts`

```ts
import { env } from "./config/env"; // validasi .env dijalankan paling awal (fail fast)
import express from "express";
import cors from "cors";
import os from "os";

import authRoute from "./controllers/auth/auth.route";
import postsRoute from "./routes/posts/posts.route";
import usersRoute from "./routes/users.route";
import categoriesRoute from "./routes/categories/categories.route";
import commentsRoute from "./routes/comments.route";
import likesRoute from "./routes/likes.route";

import {
  cachePublic,
  httpCompression,
  jsonBodyParser,
  notFoundHandler,
  parameterPollutionGuard,
  securityHeaders,
  urlencodedBodyParser,
} from "./controllers/middleware/security.middleware";
import { globalLimiter } from "./controllers/middleware/rateLimit.middleware";

const app = express();

// Di belakang reverse proxy / load balancer (nginx, Cloudflare) set TRUST_PROXY=true
// supaya rate limit membaca IP asli pengguna, bukan IP proxy.
app.set("trust proxy", env.TRUST_PROXY ? 1 : false);
app.disable("x-powered-by");

// ==========================================
// 1. LAPISAN KEAMANAN & PERFORMA
// ==========================================
app.use(securityHeaders); // header keamanan (helmet)
app.use(httpCompression); // kompresi respons -> lebih hemat bandwidth

// CORS hanya untuk origin yang terdaftar. Aplikasi mobile tidak mengirim header
// Origin sehingga tidak terpengaruh; ini penting untuk client versi web.
app.use(
  cors({
    origin: env.CORS_ORIGINS.length > 0 ? env.CORS_ORIGINS : true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false,
    maxAge: 600,
  }),
);

// Batas ukuran body + proteksi HTTP parameter pollution
app.use(jsonBodyParser);
app.use(urlencodedBodyParser);
app.use(parameterPollutionGuard);

// Rate limit global: lapisan pertama anti DDoS / request flood
app.use(globalLimiter);

// ==========================================
// 2. ROUTES
// ==========================================
app.use("/api/v1/auth", authRoute);
app.use("/api/v1/posts", postsRoute);
app.use("/api/v1/users", usersRoute);
app.use("/api/v1/categories", categoriesRoute);
app.use("/api/v1/likes", likesRoute);
app.use("/api/v1", commentsRoute);

app.get("/", cachePublic(30), (req, res) => {
  res.status(200).json({
    success: true,
    message: "KATA API is running",
    data: { version: "v1", basePath: "/api/v1" },
  });
});

// ==========================================
// 3. ERROR HANDLER
// ==========================================
app.use(
  (
    err: any,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    const message = String(err?.message ?? "Unknown error");

    // Detail lengkap hanya masuk log server, tidak dikirim ke client
    console.error(`[error] ${req.method} ${req.originalUrl} - ${message}`);

    if (err?.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "File terlalu besar (max 5MB)",
      });
    }

    if (message.includes("Hanya file gambar")) {
      return res.status(400).json({
        success: false,
        message: "Hanya file gambar yang diperbolehkan",
      });
    }

    // Payload melebihi batas (JSON > 100kb)
    if (err?.type === "entity.too.large") {
      return res.status(413).json({
        success: false,
        message: "Ukuran data terlalu besar (maksimal 100kb untuk JSON)",
      });
    }

    // Error dari parser body (mis. JSON tidak valid) tetap 4xx, pesan generik
    const status = Number(err?.status ?? err?.statusCode ?? 0);
    if (status >= 400 && status < 500) {
      return res.status(status).json({
        success: false,
        message: "Request tidak valid",
      });
    }

    // Pesan generik: mencegah kebocoran struktur database/internal ke client
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  },
);

// 404 selalu JSON
app.use(notFoundHandler);

// ==========================================
// 4. START SERVER
// ==========================================
const server = app.listen(env.PORT, () => {
  const ipaddress =
    Object.values(os.networkInterfaces())
      .flat()
      .find(
        (address) => address && !address.internal && address.family === "IPv4",
      )?.address ?? "localhost";

  console.log(`[server]: server is running at http://localhost:${env.PORT}`);
  console.log(`[server]: server is running at http://${ipaddress}:${env.PORT}`);
});

// Batas waktu request: koneksi menggantung tidak boleh menghabiskan resource
// (mitigasi slowloris / koneksi setengah terbuka).
server.requestTimeout = 30_000;
server.headersTimeout = 35_000;
server.keepAliveTimeout = 10_000;
```

### `src/routes/categories/categories.route.ts`

```ts
import { Router } from "express";
import CategoriesController from "../../controllers/categories/categories.controller";
import { cachePublic } from "../../controllers/middleware/security.middleware";

const router = Router();

// GET /categories/search?q=kul
router.get("/search", cachePublic(30), CategoriesController.search);

// GET /categories/trending
router.get("/trending", cachePublic(60), CategoriesController.trending);

// GET /categories/:name/posts
router.get("/:name/posts", cachePublic(30), CategoriesController.postsByCategory);

export default router;
```

### `src/routes/comments.route.ts`

```ts
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
```

### `src/routes/likes.route.ts`

```ts
import { Router } from "express";

import LikesController from "../controllers/likes/likes.controller";
import { authenticate } from "../controllers/middleware/auth.middleware";
import { noStore } from "../controllers/middleware/security.middleware";

const router = Router();

// GET /api/v1/likes/me — daftar id post yang disukai pengguna yang login.
// Data ini pribadi, jadi tidak boleh disimpan di cache mana pun (noStore).
router.get("/me", authenticate, noStore, LikesController.getMyLikedPostIds);

export default router;
```

### `src/routes/posts/posts.route.ts`

```ts
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
```

### `src/routes/users.route.ts`

```ts
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
```

### `src/services/category.service.ts`

```ts
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
```

### `src/services/cloudinary.service.ts`

```ts
import cloudinary from "../config/cloudinary";

export interface CloudinaryUploadResult {
  secure_url: string;
  public_id: string;
}

/**
 * Upload buffer ke Cloudinary.
 *
 * `folder` dipisah antara "posts" dan "avatars" supaya file bisa dikelola
 * sendiri-sendiri (mis. kebijakan transformasi berbeda untuk foto profil).
 */
export const uploadToCloudinary = (
  fileBuffer: Buffer,
  folder: "posts" | "avatars" = "posts",
): Promise<CloudinaryUploadResult> => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "image",
      },
      (error, result) => {
        if (error || !result) return reject(error);
        resolve({
          secure_url: result.secure_url,
          public_id: result.public_id,
        });
      },
    );
    uploadStream.end(fileBuffer);
  });
};

/**
 * Hapus gambar dari Cloudinary.
 * Dipakai saat avatar diganti/dihapus agar file lama tidak menumpuk memenuhi kuota.
 * Kegagalan di sini tidak boleh menggagalkan permintaan pengguna, jadi error
 * cukup dicatat di log dan fungsi tetap selesai.
 */
export const deleteFromCloudinary = async (publicId?: string | null) => {
  if (!publicId) return;

  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
  } catch (error) {
    console.error("Delete Cloudinary asset error:", error);
  }
};
```

### `src/services/like.service.ts`

```ts
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
```

### `src/utils/hashtag.ts`

```ts
// Parse hashtag dari text
export function extractHashtags(text: string | null | undefined): string[] {
  if (!text) return [];
  const regex = /#([a-zA-Z0-9_]+)/g;
  const matches = [...text.matchAll(regex)];
  const tags = matches.map((m) => m[1].toLowerCase());
  return [...new Set(tags)]; // hapus duplikat
}

// Normalize satu tag (buat input manual dari FE)
export function normalizeTag(input: string): string {
  return input.toLowerCase().replace(/^#/, "").trim();
}
```

### `src/validations/auth.validation.ts`

```ts
import { z } from "zod";

/** Username: dibatasi pola aman (huruf, angka, titik, underscore, strip). */
export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username minimal 3 karakter")
  .max(50, "Username maksimal 50 karakter")
  .regex(
    /^[a-zA-Z0-9._-]+$/,
    "Username hanya boleh huruf, angka, titik, underscore, dan strip",
  );

export const emailSchema = z
  .email("Format email tidak valid")
  .max(100, "Email maksimal 100 karakter");

/** Password baru: minimal 8 karakter serta wajib memuat huruf dan angka. */
export const passwordSchema = z
  .string()
  .min(8, "Password minimal 8 karakter")
  .max(72, "Password maksimal 72 karakter") // batas aman bcrypt
  .regex(/[A-Za-z]/, "Password harus memuat huruf")
  .regex(/[0-9]/, "Password harus memuat angka");

/**
 * Register memakai aturan ketat di atas.
 */
export const registerSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
});

/**
 * Login: password TIDAK diberi aturan panjang minimal 8 agar akun lama
 * (dibuat sebelum aturan baru) tetap bisa masuk. Yang penting ukurannya dibatasi
 * supaya tidak ada payload raksasa yang diproses bcrypt.
 */
export const loginSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(1, "Password wajib diisi")
    .max(72, "Password maksimal 72 karakter"),
});
```

### `src/validations/comment.validation.ts`

```ts
import { z } from "zod";

/** Validasi komentar: wajib diisi, dibatasi panjangnya agar tidak dipakai untuk spam. */
export const createCommentSchema = z.object({
  userId: z.coerce.number("userId harus berupa angka").int().positive("userId tidak valid"),
  comment: z
    .string()
    .trim()
    .min(1, "Comment gak boleh kosong")
    .max(1000, "Komentar maksimal 1000 karakter"),
});
```

### `src/validations/post.validation.ts`

```ts
import { z } from "zod";

const titleSchema = z
  .string()
  .trim()
  .min(3, "Title minimal 3 karakter")
  .max(255, "Maksimal 255 karakter");

const contentSchema = z
  .string()
  .trim()
  .min(10, "Minimal 10 karakter")
  .max(5000, "Konten maksimal 5000 karakter");

// ==========================================
// VALIDATION CREATE POST
// ==========================================
export const createPostSchema = z.object({
  userId: z.coerce.number().int().positive("userId tidak valid"),
  title: titleSchema,
  content: contentSchema,
});

// ==========================================
// VALIDATION UPDATE POST
// ==========================================
export const updatePostSchema = z.object({
  title: titleSchema.optional(),
  content: contentSchema.optional(),
});

// ==========================================
// VALIDATION PARAM :id (detail, update, delete, like)
// ==========================================
export const postIdParamSchema = z.object({
  id: z.coerce.number().int().positive("Post ID tidak valid"),
});

// ==========================================
// VALIDATION GET POSTS BY USER
// ==========================================
export const userIdSchema = z.object({
  userId: z.coerce.number().int().positive("userId tidak valid"),
});

// ==========================================
// VALIDATION GET USER POST
// ==========================================
export const userPostParamsSchema = z.object({
  userId: z.coerce.number().int().positive("userId tidak valid"),
  postId: z.coerce.number().int().positive("postId tidak valid"),
});

// ==========================================
// VALIDATION QUERY PAGINATION & PENCARIAN (?page=&limit=&q=)
// Nilai tidak wajar dijatuhkan ke default, jadi feed tidak pernah error
// hanya karena query string aneh. Batas atas mencegah permintaan data raksasa.
//
// `q` bersifat opsional dan dipakai halaman pencarian: server yang menyaring
// judul, isi, atau nama penulis, sehingga hasilnya menjangkau seluruh artikel —
// bukan hanya yang sedang tampil di layar.
// ==========================================
export const postQuerySchema = z.object({
  page: z.coerce.number().int().positive().max(10_000).catch(1),
  limit: z.coerce.number().int().positive().max(50).catch(20),
  // Terlalu panjang / bukan teks → dianggap tidak ada kata kunci (feed biasa),
  // bukan 400, karena query string berasal dari kolom pencarian yang diketik bebas.
  q: z
    .string()
    .trim()
    .max(100)
    .optional()
    .catch(undefined)
    .transform((value) => (value && value.length > 0 ? value : undefined)),
});
```

### `src/validations/user.validation.ts`

```ts
import { z } from "zod";

import { emailSchema, passwordSchema, usernameSchema } from "./auth.validation";

/** Ubah profil: username & email memakai aturan yang sama dengan register. */
export const updateProfileSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
});

/**
 * Ganti password: wajib menyertakan password lama sebagai bukti pemilik akun,
 * sehingga token yang bocor saja tidak cukup untuk mengunci pemilik asli.
 */
export const changePasswordSchema = z.object({
  currentPassword: z
    .string()
    .min(1, "Password lama wajib diisi")
    .max(72, "Password maksimal 72 karakter"),
  newPassword: passwordSchema,
});

/** Hapus akun: dikonfirmasi dengan password agar tidak terhapus karena salah klik/token bocor. */
export const deleteAccountSchema = z.object({
  password: z
    .string()
    .min(1, "Password wajib diisi untuk menghapus akun")
    .max(72, "Password maksimal 72 karakter"),
});
```

### `drizzle.config.ts`

```ts
import { defineConfig } from "drizzle-kit";
import dotenv from "dotenv";

dotenv.config();

export default defineConfig({
  schema: "./src/config/schema.ts",
  dialect: "mysql",
  dbCredentials: {
    host: process.env.DB_HOST!,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER!,
    database: process.env.DB_NAME!,
    password: process.env.DB_PASSWORD || undefined,
  },
});
```

### `package.json`

```json
{
  "name": "server",
  "version": "1.0.0",
  "description": "",
  "license": "ISC",
  "author": "alpharidho",
  "type": "commonjs",
  "main": "index.js",
  "scripts": {
    "dev": "nodemon --ext ts,json --watch src --exec ts-node src/index.ts",
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "dependencies": {
    "bcryptjs": "^3.0.3",
    "cloudinary": "^2.10.1",
    "compression": "^1.8.2",
    "cors": "^2.8.6",
    "dotenv": "^17.4.2",
    "drizzle-orm": "^0.44.7",
    "express": "^5.2.1",
    "express-rate-limit": "^8.7.0",
    "express-slow-down": "^3.1.1",
    "helmet": "^8.3.0",
    "hpp": "^0.2.3",
    "jsonwebtoken": "^9.0.3",
    "multer": "^2.2.0",
    "mysql2": "^3.23.2",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@types/compression": "^1.8.1",
    "@types/cors": "^2.8.19",
    "@types/express": "^5.0.6",
    "@types/hpp": "^0.2.7",
    "@types/jsonwebtoken": "^9.0.10",
    "@types/multer": "^2.2.0",
    "@types/node": "^26.2.0",
    "drizzle-kit": "^0.31.10",
    "nodemon": "^3.1.14",
    "ts-node": "^10.9.2",
    "tsx": "^4.23.13",
    "typescript": "^6.0.3"
  }
}
```

### `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "outDir": "./dist", // Folder hasil compile ke JS
    "rootDir": "./src", // Folder tempat kode TS kamu
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
}
```

### `.gitignore`

```text
# ==========================================================
# KATA — Server: berkas yang TIDAK ikut di-commit
# ==========================================================

# Dependency
node_modules/
npm-debug.log*

# Kredensial — jangan pernah di-commit
.env
.env.*
!.env.example

# Hasil kompilasi TypeScript
*.tsbuildinfo
dist/

# Editor
.idea/
.vscode/
*.iml

# Sistem operasi
.DS_Store
Thumbs.db

# Berkas sementara
*.log
*.tmp
```

### `.env.example`

```text
# ==========================================================
# Contoh konfigurasi server KATA.
# Salin berkas ini menjadi `.env` lalu isi nilainya:
#   cp .env.example .env
#
# Berkas `.env` yang berisi kredensial TIDAK boleh di-commit.
# ==========================================================

# --- Server ---
PORT=3006
# Daftar origin yang diizinkan, dipisah koma (kosong = semua origin, khusus pengembangan)
CORS_ORIGINS=
TRUST_PROXY=false

# --- Database MySQL ---
DB_HOST=
DB_PORT=
DB_USER=
DB_PASSWORD=
DB_NAME=

# --- Autentikasi ---
# Wajib minimal 32 karakter. Buat yang acak dengan:
#   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
JWT_SECRET=
JWT_EXPIRES_IN=7d
BCRYPT_ROUNDS=10

# --- Penyimpanan gambar (Cloudinary) ---
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# --- Batas beban (opsional, sudah punya nilai default) ---
JSON_BODY_LIMIT=100kb
RATE_LIMIT_GLOBAL=120
RATE_LIMIT_AUTH=10
RATE_LIMIT_WRITE=60
```

### `db/schema.sql`

```sql
-- Membuat database KATA. Jalankan sekali di MySQL yang sudah terpasang.
-- Nama database harus sama dengan DB_NAME di server/.env.
CREATE DATABASE IF NOT EXISTS blog_app
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE blog_app;

CREATE TABLE IF NOT EXISTS `users` (
  `id` INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `username` VARCHAR(50) NOT NULL,
  `email` VARCHAR(100) NOT NULL,
  `password` VARCHAR(255) NOT NULL,
  `role` ENUM('user','admin') NOT NULL DEFAULT 'user',
  `created_at` TIMESTAMP NULL DEFAULT (now()),
  `updated_at` TIMESTAMP NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  `avatar_url` TEXT NULL,
  `avatar_public_id` VARCHAR(255) NULL,
  UNIQUE KEY `users_email_unique` (`email`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `categories` (
  `id` INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT (now()),
  `updated_at` TIMESTAMP NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `categories_name_unique` (`name`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `posts` (
  `id` INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `user_id` INT NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `content` TEXT NOT NULL,
  `categories` JSON NULL,
  `image_url` TEXT NULL,
  `image_public_id` VARCHAR(255) NULL,
  `status` ENUM('delete','published') NOT NULL DEFAULT 'published',
  `created_at` TIMESTAMP NULL DEFAULT (now()),
  `updated_at` TIMESTAMP NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `posts_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `comments` (
  `id` INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `post_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `comment` TEXT NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT (now()),
  `updated_at` TIMESTAMP NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `comments_post_id_posts_id_fk` FOREIGN KEY (`post_id`) REFERENCES `posts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `comments_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `likes` (
  `id` INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `post_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `likes_post_user_unique` (`post_id`, `user_id`),
  CONSTRAINT `likes_post_id_posts_id_fk` FOREIGN KEY (`post_id`) REFERENCES `posts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `likes_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;
```

### `db/inspect.sql`

```sql
-- Pemeriksa struktur database KATA.
-- Semua query membaca information_schema, jadi yang tampil adalah kondisi
-- database yang sebenarnya (bukan salinan schema.ts).
--
-- Cara pakai:
--   mysql -u root -p blog_app < server/db/inspect.sql
-- atau tampilkan sebagai tabel Markdown:
--   node tools/db_report.js
--
-- Ganti 'blog_app' bila nama database kamu berbeda.

-- 1) Kolom tiap tabel: urutan, tipe, NULL, key, referensi, default, extra.
SELECT
    c.table_name                                          AS 'Nama Tabel',
    c.ordinal_position                                    AS 'Urutan',
    c.column_name                                         AS 'Nama Kolom',
    c.column_type                                         AS 'Tipe Data',
    c.is_nullable                                         AS 'Bisa Kosong (NULL)',
    CASE
        WHEN c.column_key = 'PRI' THEN 'PRIMARY KEY'
        WHEN kcu.referenced_table_name IS NOT NULL THEN 'FOREIGN KEY'
        WHEN c.column_key = 'UNI' THEN 'UNIQUE'
        WHEN c.column_key = 'MUL' THEN 'INDEX'
        ELSE '-'
    END                                                   AS 'Key',
    CASE
        WHEN kcu.referenced_table_name IS NOT NULL
        THEN CONCAT(kcu.referenced_table_name, '.', kcu.referenced_column_name)
        ELSE '-'
    END                                                   AS 'Referensi',
    COALESCE(c.column_default, '-')                       AS 'Default',
    CASE
        WHEN c.extra = '' THEN '-'
        ELSE c.extra
    END                                                   AS 'Extra'
FROM information_schema.columns c
LEFT JOIN information_schema.key_column_usage kcu
    ON  c.table_schema = kcu.table_schema
    AND c.table_name   = kcu.table_name
    AND c.column_name  = kcu.column_name
    AND kcu.referenced_table_name IS NOT NULL
WHERE c.table_schema = 'blog_app'
  AND c.table_name IN ('users', 'categories', 'posts', 'comments', 'likes')
ORDER BY FIELD(c.table_name, 'users', 'categories', 'posts', 'comments', 'likes'),
         c.ordinal_position;

-- 2) Relasi antar tabel beserta aturan ON DELETE / ON UPDATE.
SELECT
    kcu.table_name              AS 'Tabel',
    kcu.column_name             AS 'Kolom',
    kcu.constraint_name         AS 'Nama Constraint',
    kcu.referenced_table_name   AS 'Referensi Tabel',
    kcu.referenced_column_name  AS 'Referensi Kolom',
    rc.delete_rule              AS 'ON DELETE',
    rc.update_rule              AS 'ON UPDATE'
FROM information_schema.key_column_usage kcu
JOIN information_schema.referential_constraints rc
    ON  rc.constraint_schema = kcu.constraint_schema
    AND rc.constraint_name   = kcu.constraint_name
WHERE kcu.table_schema = 'blog_app'
ORDER BY kcu.table_name, kcu.column_name;

-- 3) Index dan unique constraint.
SELECT
    table_name                  AS 'Tabel',
    index_name                  AS 'Nama Index',
    GROUP_CONCAT(column_name ORDER BY seq_in_index) AS 'Kolom',
    CASE non_unique WHEN 0 THEN 'UNIQUE' ELSE 'INDEX' END AS 'Jenis'
FROM information_schema.statistics
WHERE table_schema = 'blog_app'
GROUP BY table_name, index_name, non_unique
ORDER BY table_name, index_name;
```

### `db/report.js`

```js
/**
 * Mencetak struktur database KATA yang sedang berjalan sebagai tabel Markdown.
 *
 * Skrip ini berada di dalam folder server, jadi perintahnya sama saja baik
 * dijalankan dari monorepo maupun setelah folder ini menjadi repositori sendiri:
 *
 *   node db/report.js                              # tampilkan di terminal
 *   node db/report.js db/schema-report.md          # simpan sebagai berkas
 *
 * Query-nya dibaca langsung dari `db/inspect.sql` (dihasilkan oleh generator
 * dokumentasi), jadi tidak ada query kedua yang perlu dijaga kesamaannya.
 * Kredensial diambil dari `.env` di root folder ini.
 *
 * Kalau `db/schema-report.md` ada, isinya ikut ditempel sebagai lampiran pada
 * berkas README saat dokumentasi dibangun ulang.
 */
const fs = require("fs");
const path = require("path");

// __dirname = folder `db/`, sehingga serverRoot = folder `server/`
// (atau root repositori bila folder ini berdiri sendiri).
const serverRoot = path.resolve(__dirname, "..");

const INSPECT_SQL = path.join(__dirname, "inspect.sql");
const DEFAULT_TARGET = path.join("db", "schema-report.md");

const dotenv = require("dotenv");
dotenv.config({ path: path.join(serverRoot, ".env"), quiet: true });

const mysql = require("mysql2/promise");

/** Memecah berkas SQL menjadi blok per-query + judulnya dari komentar terakhir. */
const parseStatements = (text) =>
  text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const comments = [];
      const sqlLines = [];

      for (const line of block.split(/\r?\n/)) {
        if (/^\s*--/.test(line)) comments.push(line.replace(/^\s*--\s?/, ""));
        else sqlLines.push(line);
      }

      return {
        // Komentar terakhir sebelum query dijadikan judul bagian.
        title: comments.length ? comments[comments.length - 1] : "Query",
        sql: sqlLines.join("\n").trim(),
      };
    })
    .filter((b) => b.sql.length > 0);

const cell = (value) => {
  if (value === null || value === undefined) return "NULL";
  return String(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
};

const toMarkdownTable = (rows) => {
  if (!rows.length) return "_Tidak ada baris._";

  const columns = Object.keys(rows[0]);
  const lines = [
    `| ${columns.join(" | ")} |`,
    `| ${columns.map(() => ":---").join(" | ")} |`,
  ];

  for (const row of rows) {
    lines.push(`| ${columns.map((c) => cell(row[c])).join(" | ")} |`);
  }

  return lines.join("\n");
};

const main = async () => {
  if (!fs.existsSync(INSPECT_SQL)) {
    console.error("db/inspect.sql belum ada. Jalankan dulu generator dokumentasi.");
    process.exit(1);
  }

  const statements = parseStatements(fs.readFileSync(INSPECT_SQL, "utf8"));
  const dbName = process.env.DB_NAME || "(tidak diisi)";

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || undefined,
    database: dbName,
  });

  const out = [
    `# Struktur database \`${dbName}\``,
    "",
    `Dihasilkan \`node db/report.js\` pada ${new Date()
      .toISOString()
      .slice(0, 10)}. ` +
      "Isinya dibaca dari `information_schema`, jadi mencerminkan database yang benar-benar berjalan.",
    "",
  ];

  const sections = [];
  for (const statement of statements) {
    const [rows] = await connection.query(statement.sql);
    sections.push({ title: statement.title, table: toMarkdownTable(rows) });
  }

  await connection.end();

  sections.forEach((section) => {
    out.push(`## ${section.title}`);
    out.push("");
    out.push(section.table);
    out.push("");
  });

  const target = process.argv[2] || DEFAULT_TARGET;
  const full = path.resolve(serverRoot, target);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, out.join("\n"), "utf8");
  console.log(
    `${path.relative(serverRoot, full)} ditulis (${sections.length} bagian)`,
  );
};

main().catch((error) => {
  console.error(`Gagal membaca struktur database: ${error.message}`);
  console.error(
    "Pastikan MySQL sudah jalan dan nilai DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME di .env benar.",
  );
  process.exit(1);
});
```

### `.env`

```text
DB_HOST=
DB_PORT=
DB_USER=
DB_PASSWORD=
DB_NAME=
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=


JWT_SECRET=
DATABASE_URL=
```
