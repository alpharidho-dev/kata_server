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