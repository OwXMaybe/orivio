import { z } from "zod";

export const investigateRequestSchema = z.object({
  input: z
    .string()
    .trim()
    .min(8, "input_too_short")
    .max(4000, "input_too_long")
    // Strip control characters other than newline and tab.
    .transform((s) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")),
  researchLanguage: z.enum(["tr", "en"]).default("en"),
});

export type InvestigateRequest = z.infer<typeof investigateRequestSchema>;
