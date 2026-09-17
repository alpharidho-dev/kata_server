# Struktur database `blog_app`

Dihasilkan `node db/report.js` pada 2026-09-16. Isinya dibaca dari `information_schema`, jadi mencerminkan database yang benar-benar berjalan.

## 1) Kolom tiap tabel: urutan, tipe, NULL, key, referensi, default, extra.

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

## 2) Relasi antar tabel beserta aturan ON DELETE / ON UPDATE.

| Tabel | Kolom | Nama Constraint | Referensi Tabel | Referensi Kolom | ON DELETE | ON UPDATE |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| comments | post_id | comments_post_id_posts_id_fk | posts | id | CASCADE | NO ACTION |
| comments | user_id | comments_user_id_users_id_fk | users | id | CASCADE | NO ACTION |
| likes | post_id | likes_post_id_posts_id_fk | posts | id | CASCADE | NO ACTION |
| likes | user_id | likes_user_id_users_id_fk | users | id | CASCADE | NO ACTION |
| posts | user_id | posts_user_id_users_id_fk | users | id | CASCADE | NO ACTION |

## 3) Index dan unique constraint.

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
