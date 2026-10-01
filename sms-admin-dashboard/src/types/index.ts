// ---------------------------------------------------------------------------
// Trigger Configuration
// ---------------------------------------------------------------------------

export interface DelayStep {
  order: number; // 1-based index
  delayAmount: number;
  delayUnit: "hours" | "days";
  messageTemplate: string; // May contain {name}, {investor_id}, {deep_link}
}

export interface TriggerDefinition {
  id: string; // UUID
  name: string; // Display name
  funnelStep: string; // Engine step key, e.g. "kyc_incomplete"
  isActive: boolean;
  schedule: DelayStep[]; // Ordered list of delay steps
  deepLinkPattern: string; // URL template with {investor_id}
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

// ---------------------------------------------------------------------------
// Campaign Monitor
// ---------------------------------------------------------------------------

export interface CampaignStep {
  order: number;
  scheduledAt: string; // ISO 8601
  sentAt: string | null;
  deliveryStatus: "pending" | "sent" | "delivered" | "failed";
  errorCode: string | null;
  errorMessage: string | null;
  messagePreview: string;
}

export interface Campaign {
  id: string;
  investorId: string;
  triggerId: string;
  triggerName: string;
  currentStep: number; // 1-based
  totalSteps: number;
  nextScheduledAt: string | null; // ISO 8601; null if resolved/failed
  status: "active" | "resolved" | "failed" | "warning";
  steps: CampaignStep[];
}

// ---------------------------------------------------------------------------
// Dashboard Stats
// ---------------------------------------------------------------------------

export interface DailyDeliveryRate {
  date: string; // YYYY-MM-DD
  deliveryRate: number; // 0–1
  triggerId: string;
  triggerName: string;
}

export interface DashboardStats {
  activeCampaigns: number;
  sentToday: number;
  resolvedToday: number;
  failedToday: number;
  deliveryRateHistory: DailyDeliveryRate[];
}

// ---------------------------------------------------------------------------
// Provider Settings
// ---------------------------------------------------------------------------

export type ProviderType = "twilio" | "aws_sns";

export interface TwilioCredentials {
  accountSid: string; // Masked in responses; send full value only on write
  authToken: string; // Masked
  fromNumber: string;
}

export interface AwsSnsCredentials {
  accessKeyId: string; // Masked
  secretAccessKey: string; // Masked
  region: string;
  topicArn: string;
}

export interface ProviderConfig {
  activeProvider: ProviderType;
  twilio: TwilioCredentials;
  awsSns: AwsSnsCredentials;
}
