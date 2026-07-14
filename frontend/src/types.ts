export type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  permissions: string[];
  modules: string[];
};

export type Persona = Pick<User, "id" | "name" | "email" | "role">;

export type HomeStats = {
  modules: Record<string, { open: number; attention: number }>;
};

export type KycCase = {
  id: string;
  applicant_name: string;
  email: string;
  phone: string;
  date_of_birth: string;
  government_id: string;
  country: string;
  risk: string;
  status: string;
  assigned_to: string | null;
  sla_due_at: string;
  flags: string[];
  screening_hits: Array<{
    id: string;
    source: string;
    match: string;
    score: number;
    severity: string;
    disposition: string;
  }>;
  stripe_identity: {
    verification_session: string;
    verification_report: string;
    status: string;
  } | null;
  pending_recommendation: string | null;
  first_reviewer_id: string | null;
  pii_revealed: boolean;
  version: number;
  created_at: string;
  updated_at: string;
};

export type Payment = {
  id: string;
  order_id: string;
  customer_name: string;
  customer_email: string;
  payment_intent_id: string;
  charge_id: string;
  amount: number;
  currency: string;
  payment_status: string;
  refunded: boolean;
  created_at: string;
};

export type Refund = {
  id: string;
  payment: Payment;
  amount: number;
  currency: string;
  reason: string;
  note: string;
  status: string;
  requester_id: string;
  approver_id: string | null;
  assignee_id: string | null;
  stripe_refund_id: string | null;
  stripe_status: string | null;
  failure_reason: string | null;
  requires_approval: boolean;
  version: number;
  created_at: string;
  updated_at: string;
};

export type FeatureFlag = {
  id: string;
  key: string;
  name: string;
  description: string;
  owner: string;
  risk: string;
  environment: string;
  configured: boolean;
  enabled: boolean;
  rollout: number;
  version: number;
  updated_at: string | null;
};

export type AuditEvent = {
  id: string;
  module: string;
  action: string;
  resource_type: string;
  resource_id: string;
  actor_name: string;
  details: Record<string, unknown>;
  created_at: string;
};
