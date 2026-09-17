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