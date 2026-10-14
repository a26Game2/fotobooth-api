import type { MediaType } from "@prisma/client";

export type CatalogPackage = {
  code: string;
  name: string;
  durationHours: number | null;
  isFullDay?: boolean;
  price: number | null;
  includedMediaCount?: number | null;
};

export type MainCatalogService = {
  sourceSlug: string;
  slug: string;
  name: string;
  mediaType: MediaType;
  packageName: string;
  extraHourPrice: number;
  note: string;
  packages: CatalogPackage[];
};

const packages = (
  oneHour: number | null,
  twoHours: number | null,
  fourHours: number | null,
  fullDay: number | null,
  included: Array<number | null> = [null, null, null, null]
): CatalogPackage[] => [
  { code: "ONE_HOUR", name: "1 giờ", durationHours: 1, price: oneHour, includedMediaCount: included[0] },
  { code: "TWO_HOURS", name: "2 giờ", durationHours: 2, price: twoHours, includedMediaCount: included[1] },
  { code: "FOUR_HOURS", name: "4 giờ", durationHours: 4, price: fourHours, includedMediaCount: included[2] },
  { code: "FULL_DAY", name: "Full ngày", durationHours: 8, isFullDay: true, price: fullDay, includedMediaCount: included[3] }
];

// Snapshot from the source Google Sheet tab "Bảng giá video" on 2026-10-13.
// The separate "Full ngày (HCM, HN)" column is intentionally not imported:
// location-dependent costs remain controlled by City/ServiceCityPricing settings.
export const mainCatalog: MainCatalogService[] = [
  {
    sourceSlug: "glambot",
    slug: "glambot-filming-booth",
    name: "Glambot Filming Booth",
    mediaType: "VIDEO",
    packageName: "Gói Glambot Booth trọn gói",
    extraHourPrice: 4_000_000,
    note: "Quay video slow motion bằng camera chuyên nghiệp. Giá chưa gồm VAT 8%.",
    packages: packages(null, 20_000_000, 28_000_000, 35_000_000)
  },
  {
    sourceSlug: "photobooth-360",
    slug: "booth-360",
    name: "Booth 360",
    mediaType: "VIDEO",
    packageName: "Gói 360 Booth trọn gói",
    extraHourPrice: 1_000_000,
    note: "Giá chưa gồm VAT 8%.",
    packages: packages(null, 7_800_000, 9_000_000, 12_000_000)
  },
  {
    sourceSlug: "butterfly-drone",
    slug: "booth-360-overhead",
    name: "Booth 360 Overhead",
    mediaType: "VIDEO",
    packageName: "Gói 360 Booth trọn gói",
    extraHourPrice: 1_000_000,
    note: "Giá chưa gồm VAT 8%.",
    packages: packages(null, 8_500_000, 9_500_000, 13_000_000)
  },
  {
    sourceSlug: "video-guestbook",
    slug: "video-guestbook",
    name: "Video Guestbook",
    mediaType: "VIDEO",
    packageName: "Gói tiêu chuẩn",
    extraHourPrice: 1_000_000,
    note: "Cột 2 giờ là giá cho 02 giờ đầu tiên. Giá chưa gồm VAT 8%.",
    packages: packages(null, 4_000_000, 6_000_000, 9_000_000)
  },
  {
    sourceSlug: "video-sign-box",
    slug: "video-sign-box",
    name: "Video Sign Box",
    mediaType: "VIDEO",
    packageName: "Gói Video Sign Box trọn gói",
    extraHourPrice: 1_000_000,
    note: "Bao gồm booth quay video, ký tên và xuất video qua QR Code. Giá chưa gồm VAT 8%.",
    packages: packages(null, 8_500_000, 10_000_000, 15_000_000)
  },
  {
    sourceSlug: "magic-mirror",
    slug: "minion-photobooth",
    name: "Minion Photobooth",
    mediaType: "IMAGE",
    packageName: "Gói Mirror Booth trọn gói",
    extraHourPrice: 1_200_000,
    note: "Màn hình 45 inch. Giá chưa gồm VAT 8%.",
    packages: packages(6_000_000, 6_500_000, 7_500_000, 12_000_000, [150, 250, 450, 800])
  },
  {
    sourceSlug: "iconic-photobooth",
    slug: "iconic-photobooth",
    name: "Iconic Photobooth",
    mediaType: "IMAGE",
    packageName: "Gói Photobooth trọn gói",
    extraHourPrice: 1_500_000,
    note: "Màn hình 65 inch. Giá chưa gồm VAT 8%.",
    packages: packages(8_500_000, 9_500_000, 11_500_000, 14_500_000, [150, 300, 600, 1000])
  },
  {
    sourceSlug: "photobooth-ai",
    slug: "baymax-photobooth-ai",
    name: "Baymax Photobooth AI",
    mediaType: "IMAGE",
    packageName: "Gói Baymax Photobooth AI trọn gói",
    extraHourPrice: 1_800_000,
    note: "Chưa bao gồm gói Gen ảnh AI. Giá chưa gồm VAT 8%.",
    packages: packages(8_500_000, 9_500_000, 12_000_000, 15_000_000, [100, 300, 600, 1000])
  }
];

export const addonCatalog = [
  { name: "Ảnh nam châm", slug: "anh-nam-cham" },
  { name: "Lịch", slug: "lich" },
  { name: "Sticker", slug: "sticker" },
  { name: "Ly thủy tinh", slug: "ly-thuy-tinh" }
] as const;
