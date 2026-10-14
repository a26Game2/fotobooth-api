import type { AdminRole } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        type: "jwt" | "api-key";
        userId?: string;
        email?: string;
        name: string;
        role: AdminRole;
      };
    }
  }
}

export {};
