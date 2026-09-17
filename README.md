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
