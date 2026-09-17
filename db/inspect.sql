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
