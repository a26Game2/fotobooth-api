import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import bcrypt from "bcryptjs";
import jwt, { type SignOptions } from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { requireAuth } from "../middleware/auth.js";

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút." }
});

authRouter.post("/login", loginLimiter, async (request, response, next) => {
  try {
    if (!config.jwtSecret) return response.status(503).json({ error: "JWT_SECRET chưa được cấu hình" });
    const input = z.object({ email: z.string().email(), password: z.string().min(8).max(200) }).parse(request.body);
    const user = await prisma.adminUser.findUnique({ where: { email: input.email.trim().toLowerCase() } });
    if (!user || !user.isActive || !(await bcrypt.compare(input.password, user.passwordHash))) {
      return response.status(401).json({ error: "Email hoặc mật khẩu không đúng" });
    }
    const accessToken = jwt.sign(
      { email: user.email, name: user.name, role: user.role },
      config.jwtSecret,
      { subject: user.id, expiresIn: config.jwtExpiresIn as SignOptions["expiresIn"] }
    );
    return response.json({
      accessToken,
      tokenType: "Bearer",
      expiresIn: config.jwtExpiresIn,
      user: { id: user.id, email: user.email, name: user.name, role: user.role }
    });
  } catch (error) { next(error); }
});

authRouter.get("/me", requireAuth, async (request, response) => {
  if (request.auth?.type === "api-key") return response.json({ authType: "api-key", name: request.auth.name, role: request.auth.role });
  const user = await prisma.adminUser.findFirst({
    where: { id: request.auth?.userId, isActive: true },
    select: { id: true, email: true, name: true, role: true, isActive: true }
  });
  if (!user) return response.status(401).json({ error: "Tài khoản không còn hoạt động" });
  return response.json({ authType: "jwt", ...user });
});
