interface DecimalLike { toString(): string }
const money = (v: DecimalLike) => Number(v.toString());

// Decimal serialises as a JSON string, so conversion happens here at the API
// boundary exactly once (rule R7).

interface RecRow {
  id: string;
  productId: string;
  recommendedPrice: DecimalLike;
  currentPriceAtTime: DecimalLike;
  confidenceScore: number;
  rationale: string;
  factorWeights: unknown;
  status: string;
  resolvedByUserId: string | null;
  resolvedAt: Date | null;
  rejectionReason: string | null;
  modifiedPrice: DecimalLike | null;
  failureReason?: string | null;
  createdAt: Date;
  product?: { id: string; sku: string; name: string; category: string; currentPrice: DecimalLike } | null;
  resolvedBy?: { id: string; name: string } | null;
}

export function toRecommendationDTO(rec: RecRow) {
  const recommended = money(rec.recommendedPrice);
  const currentAtTime = money(rec.currentPriceAtTime);

  return {
    id: rec.id,
    productId: rec.productId,
    recommendedPrice: recommended,
    currentPriceAtTime: currentAtTime,
    // Computed server-side so the queue and the detail page cannot disagree.
    deltaPct: currentAtTime > 0 ? (recommended - currentAtTime) / currentAtTime : 0,
    confidenceScore: rec.confidenceScore,
    rationale: rec.rationale,
    factorWeights: rec.factorWeights ?? null,
    status: rec.status,
    resolvedByUserId: rec.resolvedByUserId,
    resolvedBy: rec.resolvedBy ? { id: rec.resolvedBy.id, name: rec.resolvedBy.name } : null,
    resolvedAt: rec.resolvedAt?.toISOString() ?? null,
    rejectionReason: rec.rejectionReason,
    modifiedPrice: rec.modifiedPrice ? money(rec.modifiedPrice) : null,
    failureReason: rec.failureReason ?? null,
    createdAt: rec.createdAt.toISOString(),
    product: rec.product
      ? {
          id: rec.product.id,
          sku: rec.product.sku,
          name: rec.product.name,
          category: rec.product.category,
          currentPrice: money(rec.product.currentPrice),
        }
      : null,
  };
}

interface AgentRunRow {
  id: string;
  agentName: string;
  input: unknown;
  output: unknown;
  toolCalls: unknown;
  confidence: number | null;
  model: string;
  promptTokens: number;
  completionTokens: number;
  durationMs: number;
  error: string | null;
  createdAt: Date;
}

export function toAgentRunDTO(run: AgentRunRow) {
  return {
    id: run.id,
    agentName: run.agentName,
    input: run.input,
    output: run.output,
    // Exposed so the detail view can show get_competitor_prices({lookbackDays: 7})
    //, required by FR-EXP-3 and absent from the original API contract.
    toolCalls: run.toolCalls ?? [],
    confidence: run.confidence,
    model: run.model,
    promptTokens: run.promptTokens,
    completionTokens: run.completionTokens,
    durationMs: run.durationMs,
    error: run.error,
    createdAt: run.createdAt.toISOString(),
  };
}

interface ExecutionRow {
  id: string;
  attemptedPrice: DecimalLike;
  succeeded: boolean;
  platformResponse: unknown;
  rolledBack: boolean;
  createdAt: Date;
}

export function toExecutionDTO(e: ExecutionRow) {
  return {
    id: e.id,
    attemptedPrice: money(e.attemptedPrice),
    succeeded: e.succeeded,
    platformResponse: e.platformResponse,
    rolledBack: e.rolledBack,
    createdAt: e.createdAt.toISOString(),
  };
}
