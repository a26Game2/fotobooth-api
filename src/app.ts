import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import multer from "multer";
import swaggerUi from "swagger-ui-express";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { config } from "./config.js";
import { PricingError } from "./lib/pricing.js";
import { publicRouter } from "./routes/public.js";
import { adminRouter } from "./routes/admin.js";
import { authRouter } from "./routes/auth.js";
import { openApiDocument } from "./openapi.js";
import { cacheStatus } from "./cache.js";
import { StorageConfigurationError } from "./storage.js";
import { requireSwaggerBasicAuth } from "./middleware/auth.js";

fs.mkdirSync(path.join(config.uploadDir, "booking-requests"), { recursive: true });
const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const upload = multer({
  storage: multer.diskStorage({
    destination: (_request, _file, callback) => callback(null, path.join(config.uploadDir, "booking-requests")),
    filename: (_request, file, callback) => callback(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`)
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 10 },
  fileFilter: (_request, file, callback) => callback(null, allowedMimeTypes.has(file.mimetype))
});

export const app = express();
app.disable("x-powered-by");
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use("/uploads", express.static(config.uploadDir));
app.get("/", (_request, response) => response.redirect("/docs"));
app.get("/openapi.json", requireSwaggerBasicAuth, (_request, response) => response.json(openApiDocument));
app.use("/docs", requireSwaggerBasicAuth, swaggerUi.serve, swaggerUi.setup(openApiDocument, { customSiteTitle: "T-RED Booking API Docs" }));
app.get("/health", async (_request, response) => response.json({ ok: true, cache: await cacheStatus() }));
app.use("/api/public", upload.array("files", 10), publicRouter);
app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);

const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof PricingError) return response.status(422).json({ error: error.message });
  if (error instanceof StorageConfigurationError) return response.status(503).json({ error: error.message });
  if (error instanceof ZodError) return response.status(400).json({ error: "Dữ liệu không hợp lệ", details: error.flatten() });
  if (error instanceof multer.MulterError) return response.status(400).json({ error: error.code === "LIMIT_FILE_SIZE" ? "Mỗi file tối đa 10 MB" : error.message });
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return response.status(503).json({ error: "Tạm thời không kết nối được database, vui lòng thử lại" });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const status = error.code === "P2025" ? 404 : error.code === "P2002" ? 409 : 400;
    return response.status(status).json({ error: "Dữ liệu không thể xử lý", code: error.code });
  }
  console.error(error);
  return response.status(500).json({ error: "Đã có lỗi xảy ra" });
};
app.use(errorHandler);
