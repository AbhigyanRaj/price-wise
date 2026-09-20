/**
 * Turns the audit trail's action constants into language.
 *
 * The Activity screen and the Overview's recent-activity list both rendered
 * `entry.action` raw, so users read `PRICE_APPROVED_AND_EXECUTED` and
 * `PricingRecommendation`. Those are database values. Leaking them is the
 * single most unfinished-looking thing in the product, and it is the kind of
 * detail that decides whether a reviewer reads this as software or as a
 * schema with a page on top.
 *
 * The keys are the exact strings the services emit, taken from the backend
 * rather than guessed. Anything not in the map degrades to a readable
 * sentence-cased form instead of disappearing, because an audit trail that
 * silently drops an event it does not recognise is worse than an ugly one.
 */

export type AuditTone = "pos" | "neg" | "amber" | "neutral" | "accent";

export interface AuditLabel {
  /** What happened, in the third person, with the actor supplied separately. */
  sentence: string;
  /** Short chip, uppercase mono. */
  tag: string;
  tone: AuditTone;
}

const LABELS: Record<string, AuditLabel> = {
  // Price movements.
  PRICE_AUTO_EXECUTED: {
    sentence: "auto-executed a price change",
    tag: "AUTO",
    tone: "pos",
  },
  PRICE_APPROVED_AND_EXECUTED: {
    sentence: "approved a price change and it went live",
    tag: "EXECUTED",
    tone: "pos",
  },
  PRICE_EXECUTION_FAILED: {
    sentence: "could not push a price change to the storefront",
    tag: "FAILED",
    tone: "neg",
  },

  // Decisions on a recommendation.
  RECOMMENDATION_APPROVED: {
    sentence: "approved a recommendation",
    tag: "APPROVED",
    tone: "pos",
  },
  RECOMMENDATION_MODIFIED: {
    sentence: "approved a recommendation at a different price",
    tag: "MODIFIED",
    tone: "amber",
  },
  RECOMMENDATION_REJECTED: {
    sentence: "rejected a recommendation",
    tag: "REJECTED",
    tone: "neg",
  },
  RECOMMENDATION_UNDONE: {
    sentence: "undid a decision and returned it to the queue",
    tag: "UNDONE",
    tone: "amber",
  },

  // Policy.
  ORG_SETTINGS_UPDATED: {
    sentence: "changed the automation settings",
    tag: "POLICY",
    tone: "accent",
  },
  CATEGORY_RULE_CREATED: {
    sentence: "added a category limit",
    tag: "POLICY",
    tone: "accent",
  },
  CATEGORY_RULE_UPDATED: {
    sentence: "changed a category limit",
    tag: "POLICY",
    tone: "accent",
  },
  CATEGORY_RULE_DELETED: {
    sentence: "removed a category limit",
    tag: "POLICY",
    tone: "accent",
  },

  // Membership.
  ORG_CREATED: { sentence: "created this workspace", tag: "TEAM", tone: "neutral" },
  USER_JOINED: { sentence: "joined the workspace", tag: "TEAM", tone: "neutral" },
  INVITE_CREATED: { sentence: "invited someone to the workspace", tag: "TEAM", tone: "neutral" },
  INVITE_REVOKED: { sentence: "revoked an invitation", tag: "TEAM", tone: "neutral" },
};

/** Last resort for an action this map has not caught up with. */
function humanise(action: string): AuditLabel {
  const words = action.toLowerCase().replace(/_/g, " ");
  return { sentence: words, tag: "EVENT", tone: "neutral" };
}

export function auditLabel(action: string): AuditLabel {
  return LABELS[action] ?? humanise(action);
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((part) => part[0] ?? "");
  return letters.join("").toUpperCase() || "··";
}

/**
 * Who did it.
 *
 * "Who approved it" is the first thing an audit trail is asked for, so the API
 * resolves the actor's name and this renders it. A null actor is the system,
 * which is precisely the distinction the trail exists to record: it is how an
 * auto-executed price change is told apart from a human approval.
 *
 * "You" still wins over your own name. Scanning your own trail, the useful
 * question is which rows were yours, and a name you have to recognise answers
 * that more slowly than a pronoun.
 */
export function auditActor(
  userId: string | null,
  currentUserId: string | undefined,
  userName?: string | null,
): { name: string; initials: string; isSystem: boolean } {
  if (userId === null) return { name: "Pricewise", initials: "PW", isSystem: true };
  if (userId === currentUserId) return { name: "You", initials: "YOU", isSystem: false };
  if (userName) return { name: userName, initials: initialsOf(userName), isSystem: false };
  // A member who has since left. The action stays in the trail either way.
  return { name: "A former member", initials: "··", isSystem: false };
}
