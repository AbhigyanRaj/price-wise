// DTO mappers are an ALLOW-LIST, not a delete-list. passwordHash can never be
// accidentally serialised because it is never named here, adding a field to
// the model does not silently expose it.

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId: string;
  createdAt: Date;
}

interface OrgRow {
  id: string;
  name: string;
  confidenceThreshold: number;
  maxPriceDeltaPct: number;
  createdAt: Date;
}

export function toUserDTO(user: UserRow) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    organizationId: user.organizationId,
    createdAt: user.createdAt.toISOString(),
  };
}

export function toOrgDTO(org: OrgRow) {
  return {
    id: org.id,
    name: org.name,
    confidenceThreshold: org.confidenceThreshold,
    maxPriceDeltaPct: org.maxPriceDeltaPct,
    createdAt: org.createdAt.toISOString(),
  };
}
