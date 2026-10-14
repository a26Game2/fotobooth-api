import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { migrateServiceCatalog } from "./migrate-service-catalog.js";

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminEmail && adminPassword) {
    await prisma.adminUser.upsert({
      where: { email: adminEmail },
      update: {},
      create: {
        email: adminEmail,
        passwordHash: await bcrypt.hash(adminPassword, 12),
        name: "T-RED Admin",
        role: "ADMIN"
      }
    });
  }

  await prisma.appConfiguration.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      value: {
        currency: "VND",
        vatRate: 8,
        booking: {
          minNoticeHours: 24,
          successMessage: "T-RED đã nhận yêu cầu. Chuyên viên sẽ xác nhận lịch và báo giá cuối cùng.",
          defaultNote: "Giá tạm tính chưa gồm hạng mục setup riêng theo yêu cầu."
        }
      }
    }
  });

  await Promise.all([
    prisma.city.upsert({ where: { slug: "da-nang" }, update: {}, create: { name: "Đà Nẵng", slug: "da-nang", defaultTravelFee: 0, note: "Miễn phí vận chuyển trong nội thành.", sortOrder: 1 } }),
    prisma.city.upsert({ where: { slug: "ho-chi-minh" }, update: {}, create: { name: "Hồ Chí Minh", slug: "ho-chi-minh", defaultTravelFee: null, note: "Sales xác nhận theo lịch và hạng mục.", sortOrder: 2 } }),
    prisma.city.upsert({ where: { slug: "ha-noi" }, update: {}, create: { name: "Hà Nội", slug: "ha-noi", defaultTravelFee: null, note: "Sales xác nhận theo lịch và hạng mục.", sortOrder: 3 } }),
    prisma.city.upsert({ where: { slug: "khac" }, update: {}, create: { name: "Tỉnh/thành khác", slug: "khac", defaultTravelFee: null, note: "Liên hệ để xác nhận phí triển khai.", sortOrder: 4 } })
  ]);

  await migrateServiceCatalog(prisma);
}

main().then(() => prisma.$disconnect()).catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exit(1); });
