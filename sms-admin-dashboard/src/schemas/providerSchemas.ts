import { z } from "zod";

// ---------------------------------------------------------------------------
// Twilio Credentials
// ---------------------------------------------------------------------------

export const TwilioCredentialsSchema = z.object({
  accountSid: z
    .string()
    .refine(
      (val) => val.startsWith("AC") && val.length === 34,
      "Account SID must start with 'AC' and be 34 characters long.",
    ),
  authToken: z
    .string()
    .regex(
      /^[0-9a-fA-F]{32}$/,
      "Auth Token must be 32 hexadecimal characters.",
    ),
  fromNumber: z.string().min(1),
});

export type TwilioCredentials = z.infer<typeof TwilioCredentialsSchema>;

// ---------------------------------------------------------------------------
// AWS SNS Credentials
// ---------------------------------------------------------------------------

export const AwsSnsCredentialsSchema = z.object({
  accessKeyId: z.string().min(1),
  secretAccessKey: z.string().min(1),
  region: z.string().min(1),
  topicArn: z.string().min(1),
});

export type AwsSnsCredentials = z.infer<typeof AwsSnsCredentialsSchema>;

// ---------------------------------------------------------------------------
// Provider Config
// ---------------------------------------------------------------------------

export const ProviderConfigSchema = z.object({
  activeProvider: z.enum(["twilio", "aws_sns"]),
  twilio: TwilioCredentialsSchema,
  awsSns: AwsSnsCredentialsSchema,
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
