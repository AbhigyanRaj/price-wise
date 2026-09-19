import type { AgentNameValue, RecStatus, Role } from "@pricewise/shared";

/**
 * The shapes the API actually returns, transcribed from the DTO mappers.
 *
 * These are hand written rather than inferred because the server maps Prisma
 * rows through explicit allow-lists, so the wire shape is deliberately not the
 * database shape. Writing them out is also what makes a field rename on the
 * server show up as a compile error here.
 */

export interface UserDto {
  id: string;
  email: string;
  name: string;
  /** Typed as a plain string on the wire. Narrowed via RoleSchema on receipt. */
  role: Role;
  organizationId: string;
  createdAt: string;
}

export interface OrganizationDto {
  id: string;
  name: string;
  confidenceThreshold: number;
  maxPriceDeltaPct: number;
  createdAt: string;
}

export interface SessionDto {
  user: UserDto;
  organization: OrganizationDto;
}

export interface ProductDto {
  id: string;
  sku: string;
  name: string;
  category: string;
  currentPrice: number;
  cost: number;
  marginFloorPct: number;
  /** Computed server side, so the table cannot disagree with the rule engine. */
  margin: number;
  belowFloor: boolean;
  inventoryLevel: number;
  inventoryStatus: "LOW" | "NORMAL" | "OVERSTOCKED";
  latestCompetitorPrice: { competitor: string; price: number; scrapedAt: string } | null;
  pendingRecommendation: {
    id: string;
    recommendedPrice: number;
    confidenceScore: number;
    status: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface FactorWeights {
  competitorPressure: number;
  demandSignal: number;
  inventoryPosition: number;
  marginProtection: number;
  confidenceBreakdown?: ConfidenceBreakdown;
}

export interface ConfidenceBreakdown {
  base: number;
  penalties: { reason: string; amount: number }[];
  totalPenalty: number;
  final: number;
}

export interface RecommendationDto {
  id: string;
  productId: string;
  recommendedPrice: number;
  currentPriceAtTime: number;
  /** A FRACTION (0.07 means +7%), unlike magnitudePct on market events which
   *  is a whole number. Two similar names, two different units. */
  deltaPct: number;
  confidenceScore: number;
  rationale: string;
  factorWeights: FactorWeights | null;
  status: RecStatus;
  resolvedByUserId: string | null;
  resolvedBy: { id: string; name: string } | null;
  resolvedAt: string | null;
  rejectionReason: string | null;
  modifiedPrice: number | null;
  failureReason: string | null;
  createdAt: string;
  product: {
    id: string;
    sku: string;
    name: string;
    category: string;
    currentPrice: number;
  } | null;
}

export interface ToolCallRecord {
  name: string;
  args: unknown;
  durationMs: number;
  failed?: boolean;
}

export interface AgentRunDto {
  id: string;
  agentName: AgentNameValue;
  input: unknown;
  output: unknown;
  toolCalls: ToolCallRecord[];
  confidence: number | null;
  model: string;
  promptTokens: number;
  completionTokens: number;
  durationMs: number;
  error: string | null;
  createdAt: string;
}

export interface ExecutionDto {
  id: string;
  attemptedPrice: number;
  succeeded: boolean;
  platformResponse: unknown;
  rolledBack: boolean;
  createdAt: string;
}

export interface ComparableDecision {
  id: string;
  recommendedPrice: number;
  modifiedPrice: number | null;
  confidenceScore: number;
  status: RecStatus;
  rejectionReason: string | null;
  createdAt: string;
}

export interface RecommendationDetailDto extends RecommendationDto {
  agentRuns: AgentRunDto[];
  executions: ExecutionDto[];
  comparable: ComparableDecision[];
}

export interface AuditLogDto {
  id: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  beforeValue: unknown;
  afterValue: unknown;
  createdAt: string;
}

export interface MemberDto {
  id: string;
  email: string;
  name: string;
  role: Role;
  createdAt: string;
}

export interface InviteDto {
  id: string;
  email: string;
  role: Role;
  code: string;
  expiresAt: string;
  usedAt: string | null;
}

/** Events the pipeline endpoint streams. Mirrors the server's PipelineEvent. */
export type PipelineEvent =
  | { type: "agent_started"; agent: AgentNameValue; startedAt: string }
  | {
      type: "agent_completed";
      agent: AgentNameValue;
      durationMs: number;
      confidence: number | null;
      output: unknown;
      toolCalls: ToolCallRecord[];
      promptTokens: number;
      completionTokens: number;
    }
  | { type: "agent_skipped"; agent: AgentNameValue; reason: string }
  | { type: "agent_failed"; agent: AgentNameValue; error: string; willRetry: boolean }
  | {
      type: "recommendation_ready";
      autoExecuted: boolean;
      blocked?: boolean;
      executionFailed?: boolean;
      recommendationId: string;
    }
  | { type: "recommendation_failed"; error: string; failedAgent?: AgentNameValue };
