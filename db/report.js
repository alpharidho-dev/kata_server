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
