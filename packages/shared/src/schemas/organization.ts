import { z } from "zod";
import { EmailSchema } from "./auth";

export const RoleSchema = z.enum(["ADMIN", "PRICING_ANALYST"]);

export const OrgSettingsPatchSchema = z
  .object({
    name: z.string().min(2).max(120).trim().optional(),
    // Floor of 0.50 is deliberate: below that almost everything auto-executes,
    // which is effectively full autonomy and not a posture we offer by accident.
    confidenceThreshold: z.number().min(0.5).max(1).optional(),
    maxPriceDeltaPct: z.number().min(0.01).max(1).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "At least one field must be provided");

export const InviteCreateSchema = z.object({
  email: EmailSchema,
  role: RoleSchema,
});

export const CategoryRuleSchema = z.object({
  category: z.string().min(1).max(64),
  marginFloorPct: z.number().min(0).max(0.95),
  maxDeltaPct: z.number().min(0.01).max(1),
});

export type OrgSettingsPatch = z.infer<typeof OrgSettingsPatchSchema>;
export type InviteCreate = z.infer<typeof InviteCreateSchema>;
export type CategoryRuleInput = z.infer<typeof CategoryRuleSchema>;
export type Role = z.infer<typeof RoleSchema>;
