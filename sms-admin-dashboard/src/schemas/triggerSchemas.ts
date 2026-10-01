import { z } from "zod";

// ---------------------------------------------------------------------------
// DelayStep schema
// ---------------------------------------------------------------------------

export const DelayStepSchema = z
  .object({
    order: z.number().int().positive(),
    delayAmount: z
      .number()
      .int({ message: "Delay must be a positive integer." })
      .positive({ message: "Delay must be a positive integer." }),
    delayUnit: z.enum(["hours", "days"]),
    messageTemplate: z
      .string()
      .min(1, { message: "Message template is required." })
      .max(480, { message: "Message exceeds 3 SMS segments (480 characters)." }),
  })
  .superRefine((data, ctx) => {
    if (data.delayUnit === "days" && data.delayAmount > 365) {
      ctx.addIssue({
        code: z.ZodIssueCode.too_big,
        maximum: 365,
        type: "number",
        inclusive: true,
        message: "Delay in days must not exceed 365.",
        path: ["delayAmount"],
      });
    }
    if (data.delayUnit === "hours" && data.delayAmount > 8760) {
      ctx.addIssue({
        code: z.ZodIssueCode.too_big,
        maximum: 8760,
        type: "number",
        inclusive: true,
        message: "Delay in hours must not exceed 8760 (365 days).",
        path: ["delayAmount"],
      });
    }
  });

export type DelayStep = z.infer<typeof DelayStepSchema>;

// Form variant — omits `order` because it is assigned programmatically
// after the user fills in the rest of the step fields.
export const DelayStepFormSchema = DelayStepSchema.omit({ order: true });

export type DelayStepForm = z.infer<typeof DelayStepFormSchema>;

// ---------------------------------------------------------------------------
// Helper: validate deepLinkPattern
// ---------------------------------------------------------------------------

/**
 * Replaces every `{...}` placeholder in a URL template with the literal string
 * "placeholder", then attempts to construct a URL object.  Returns true when
 * the result is a valid absolute URL.
 */
function isValidDeepLinkPattern(pattern: string): boolean {
  const substituted = pattern.replace(/\{[^}]+\}/g, "placeholder");
  try {
    new URL(substituted);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// TriggerDefinition schema
// ---------------------------------------------------------------------------

export const TriggerDefinitionSchema = z.object({
  id: z.string().uuid(),
  name: z
    .string()
    .min(1, { message: "Name is required." })
    .max(100, { message: "Name must be 100 characters or fewer." }),
  funnelStep: z.string().min(1, { message: "Funnel step is required." }),
  isActive: z.boolean(),
  schedule: z.array(DelayStepSchema),
  deepLinkPattern: z
    .string()
    .min(1, { message: "Deep-link pattern is required." })
    .refine((val) => val.includes("{investor_id}"), {
      message: "Pattern must include {investor_id}.",
    })
    .refine(isValidDeepLinkPattern, {
      message:
        "Deep-link pattern must be a valid URL (placeholders are substituted before validation).",
    }),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type TriggerDefinition = z.infer<typeof TriggerDefinitionSchema>;

// Form variant — used with react-hook-form; `id`, `createdAt`, `updatedAt` are
// managed by the server and therefore excluded from the user-facing form.
export const TriggerFormSchema = TriggerDefinitionSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  // Replace the full DelayStepSchema array with the form-friendly variant
  // (no `order` field — order is derived from array position on submit).
  schedule: z.array(DelayStepFormSchema),
});

export type TriggerForm = z.infer<typeof TriggerFormSchema>;
