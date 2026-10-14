import { z } from "zod";

export const addonSelectionSchema = z.object({
  serviceId: z.string().min(1),
  quantity: z.coerce.number().int().min(50).max(100_000)
    .refine((value) => value % 50 === 0, "Số lượng addon phải là bội số của 50")
});

export const quoteSchema = z.object({
  serviceSlug: z.string().min(1),
  mainPackageId: z.string().min(1),
  citySlug: z.string().min(1),
  extraHours: z.coerce.number().int().min(0).max(24).default(0),
  addons: z.array(addonSelectionSchema).max(20).default([])
}).superRefine((input, context) => {
  const ids = input.addons.map((item) => item.serviceId);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["addons"], message: "Không được chọn trùng addon" });
  }
});

export const bookingSchema = quoteSchema.and(z.object({
  eventDate: z.coerce.date(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Thời gian phải có dạng HH:mm"),
  location: z.string().min(3).max(500),
  eventType: z.string().min(2).max(100),
  guestCount: z.coerce.number().int().positive().max(100000),
  customerName: z.string().min(2).max(100),
  phone: z.string().min(8).max(30),
  companyName: z.string().max(150).optional(),
  customerNote: z.string().max(2000).optional()
}));
