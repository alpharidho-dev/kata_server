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