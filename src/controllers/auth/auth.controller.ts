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
