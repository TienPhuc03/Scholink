import { z } from "zod";

export const CreateOpportunityDtoSchema = z
  .object({
    type: z.enum(["SCHOLARSHIP", "COMPETITION"]),
    title: z
      .string()
      .min(10, "Tiêu đề ít nhất 10 ký tự")
      .max(200, "Tiêu đề tối đa 200 ký tự"),
    slug: z.string().min(3).optional(),
    description: z.string().min(20, "Mô tả ít nhất 20 ký tự"),
    benefits: z.string().optional(),
    requirements: z.string().optional(),
    organizationId: z.string().optional(),
    organizerName: z.string().min(2),
    sourceUrl: z.string().url("URL không đúng định dạng").optional(),
    applyMode: z.enum(["IN_APP", "EXTERNAL"]).default("IN_APP"),

    // hạn UTC + timezone gốc
    registerDeadline: z
      .string()
      .datetime({ message: "Hạn đăng ký phải theo chuẩn ISO 8601 UTC" }),
    submitDeadline: z
      .string()
      .datetime({ message: "Hạn nộp bài phải theo chuẩn ISO 8601 UTC" })
      .optional(),
    timezone: z.string().default("Asia/Ho_Chi_Minh"),

    // bộ lọc + phân loại
    fundingLevel: z.enum(["FULL", "PARTIAL", "OTHER", "FREE_ENTRY"]).optional(),
    minGpa: z.number().min(0).max(4.0).optional().default(0),
    requiredIelts: z.number().min(0).max(9.0).optional().default(0),
    coverImageUrl: z.string().url("Link ảnh bìa không hợp lệ").optional(),
    isPromoted: z.boolean().optional().default(false),

    // cuộc thi
    competitionMode: z.enum(["INDIVIDUAL", "TEAM"]).optional(),
    minTeamSize: z.number().int().min(2).optional(),
    maxTeamSize: z.number().int().min(2).optional(),

    eligibilityRules: z.array(z.record(z.string(), z.any())).optional(),
    tags: z.array(z.string()).optional(),
  })
  .refine(
    (data) => {
      if (data.applyMode === "EXTERNAL") {
        return Boolean(data.sourceUrl && data.sourceUrl.trim().length > 0);
      }
      return true;
    },
    {
      message: "Hình thức EXTERNAL bắt buộc phải có sourceUrl hợp lệ",
      path: ["sourceUrl"],
    },
  )
  .refine(
    (data) => {
      if (data.type === "COMPETITION" && data.competitionMode === "TEAM") {
        if (data.minTeamSize && data.maxTeamSize) {
          return data.minTeamSize <= data.maxTeamSize;
        }
      }
      return true;
    },
    {
      message: "Số lượng thành viên tối thiểu không thể lớn hơn tối đa",
      path: ["minTeamSize"],
    },
  );

export type CreateOpportunityDto = z.infer<typeof CreateOpportunityDtoSchema>;

//query + bộ lọc danh sách
export const QueryOpportunityDtoSchema = z.object({
  type: z.enum(["SCHOLARSHIP", "COMPETITION"]).optional(),
  fundingLevel: z.enum(["FULL", "PARTIAL", "OTHER", "FREE_ENTRY"]).optional(),
  applyMode: z.enum(["IN_APP", "EXTERNAL"]).optional(),
  keyword: z.string().optional(),
  minGpa: z
    .string()
    .optional()
    .transform((v) => (v ? parseFloat(v) : undefined)),
  requiredIelts: z
    .string()
    .optional()
    .transform((v) => (v ? parseFloat(v) : undefined)),
  isPromoted: z
    .string()
    .optional()
    .transform((v) =>
      v === "true" ? true : v === "false" ? false : undefined,
    ),
  sortBy: z
    .enum(["registerDeadline", "createdAt", "isPromoted"])
    .optional()
    .default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
  page: z
    .string()
    .optional()
    .transform((v) => (v ? Math.max(1, parseInt(v, 10)) : 1)),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? Math.min(100, Math.max(1, parseInt(v, 10))) : 10)),
  cursor: z.string().optional(),
});

export type QueryOpportunityDto = z.infer<typeof QueryOpportunityDtoSchema>;

//ứng tuyển in-app
export const SubmitApplicationDtoSchema = z.object({
  opportunityId: z.string().min(1),
  submissionType: z.enum(["INDIVIDUAL", "TEAM"]).default("INDIVIDUAL"),
  teamId: z.string().optional(),
  previewId: z.string().min(1),
  snapshotId: z.string().min(1),
  profileVersion: z.number().int().min(1),
  payloadHash: z.string().min(64),
  consentId: z.string().min(1),
});

export type SubmitApplicationDto = z.infer<typeof SubmitApplicationDtoSchema>;

//data trả về
export interface OpportunitySummaryResponseDto {
  id: string;
  type: "SCHOLARSHIP" | "COMPETITION";
  title: string;
  slug: string;
  organizerName: string;
  applyMode: "IN_APP" | "EXTERNAL";
  sourceUrl?: string | null;
  coverImageUrl?: string | null;
  fundingLevel?: string | null;
  minGpa?: number;
  requiredIelts?: number;
  registerDeadline: string; // ISO 8601 UTC
  timezone: string;
  isPromoted: boolean;
  status: string;
  tags?: string[];
  createdAt: string;
}

export interface OpportunityDetailResponseDto extends OpportunitySummaryResponseDto {
  description: string;
  benefits?: string | null;
  requirements?: string | null;
  organizationId?: string | null;
  submitDeadline?: string | null;
  competitionMode?: "INDIVIDUAL" | "TEAM" | null;
  minTeamSize?: number | null;
  maxTeamSize?: number | null;
  eligibilityRules?: Record<string, any>[];
  version: number;
  updatedAt: string;
}

export interface PaginatedOpportunityResponseDto {
  items: OpportunitySummaryResponseDto[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    nextCursor?: string | null;
  };
}
