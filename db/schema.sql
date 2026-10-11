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
