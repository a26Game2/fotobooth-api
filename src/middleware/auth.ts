import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { AdminRole } from "@prisma/client";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { config } from "../config.js";

function secureEqual(received: string, expected: string) {
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function requireSwaggerBasicAuth(request: Request, response: Response, next: NextFunction) {
  const authorization = request.header("authorization");
  if (authorization?.startsWith("Basic ") && config.swaggerUsername && config.swaggerPassword) {
    const credentials = Buffer.from(authorization.slice(6), "base64").toString("utf8");
    const separator = credentials.indexOf(":");
    if (separator >= 0) {
      const username = credentials.slice(0, separator);
      const password = credentials.slice(separator + 1);
      if (secureEqual(username, config.swaggerUsername) && secureEqual(password, config.swaggerPassword)) {
        response.set("Cache-Control", "private, no-store");
        return next();
      }
    }
  }

  response.set("WWW-Authenticate", 'Basic realm="Fotobooth API Docs", charset="UTF-8"');
  response.set("Cache-Control", "no-store");
  return response.status(401).send("Authentication required");
}

function authenticateApiKey(request: Request) {
  const apiKey = request.header("x-api-key");
  if (!apiKey || !config.adminApiKey || !secureEqual(apiKey, config.adminApiKey)) return false;
  request.auth = { type: "api-key", name: "API key", role: AdminRole.ADMIN };
  return true;
}

function authenticateBearer(request: Request) {
  const authorization = request.header("authorization");
  if (!authorization?.startsWith("Bearer ") || !config.jwtSecret) return false;
  const payload = jwt.verify(authorization.slice(7), config.jwtSecret) as JwtPayload;
  if (!payload.sub || !payload.email || !payload.name || !Object.values(AdminRole).includes(payload.role)) return false;
  request.auth = {
    type: "jwt",
    userId: payload.sub,
    email: String(payload.email),
    name: String(payload.name),
    role: payload.role
  };
  return true;
}

export function requireAuth(request: Request, response: Response, next: NextFunction) {
  try {
    if (authenticateApiKey(request) || authenticateBearer(request)) return next();
  } catch {
    // Return the same response for expired, malformed and otherwise invalid tokens.
  }
  return response.status(401).json({ error: "Email/password, Bearer token hoặc API key không hợp lệ" });
}

export function requireRole(...roles: AdminRole[]) {
  return (request: Request, response: Response, next: NextFunction) => {
    if (!request.auth) return response.status(401).json({ error: "Chưa đăng nhập" });
    if (!roles.includes(request.auth.role)) return response.status(403).json({ error: "Không đủ quyền thực hiện thao tác này" });
    return next();
  };
}
