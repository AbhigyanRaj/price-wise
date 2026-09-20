import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Plus } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FullPageSpinner } from "@/components/data/States";
import { useAuth, SESSION_QUERY_KEY } from "@/features/auth/useAuth";
import { RiskControls } from "./ThresholdControl";
import { CategoryRulesSection } from "./CategoryRulesSection";
import type {
  InviteDto,
  MemberDto,
  OrganizationDto,
  ProductDto,
  RecommendationDto,
} from "@/lib/types";
import { queryString } from "@/lib/api";

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { session } = useAuth();

  const org = session?.organization;

  // Recent scores power the live preview. Fetched once and filtered in the
  // browser, so dragging the slider costs no requests at all.
  const { data: recent } = useQuery({
    queryKey: ["recommendations", "recent-scores"],
    queryFn: ({ signal }) =>
      api.paged<RecommendationDto>(`/recommendations${queryString({ limit: 50 })}`, signal),
    staleTime: 60_000,
  });

  // One real product, so the maximum-change limit is shown as a price band
  // rather than an abstract percentage.
  const { data: sample } = useQuery({
    queryKey: ["products", "band-sample"],
    queryFn: ({ signal }) => api.paged<ProductDto>("/products?pageSize=1", signal),
    staleTime: 5 * 60_000,
  });

  const { data: members } = useQuery({
    queryKey: ["org", "members"],
    queryFn: ({ signal }) => api.get<MemberDto[]>("/org/members", signal),
  });

  const { data: invites, refetch: refetchInvites } = useQuery({
    queryKey: ["org", "invites"],
    queryFn: ({ signal }) => api.get<InviteDto[]>("/org/invites", signal),
  });

  /** Writes the patch and folds the response back into the cached session, so
   *  the top bar and every threshold reference update without a refetch. */
  async function saveSettings(patch: { confidenceThreshold: number; maxPriceDeltaPct: number }) {
    const updated = await api.patch<OrganizationDto>("/org/settings", patch);
    queryClient.setQueryData(SESSION_QUERY_KEY, (old: unknown) =>
      old && typeof old === "object" ? { ...(old as object), organization: updated } : old,
    );
  }

  if (!org) return <FullPageSpinner />;

  return (
    <div className="max-w-[780px] px-[34px] py-7">
      <header className="mb-6">
        <h1 className="text-[22px] tracking-[-0.022em]">Risk &amp; automation</h1>
        <p className="mt-1 max-w-[56ch] text-[12.5px] leading-[1.6] text-t3">
          How much of the pricing decision you delegate, and the hard limits Pricewise may never
          cross.
        </p>
      </header>

      <div className="space-y-4">
        <RiskControls
          key={org.id}
          org={org}
          recent={recent?.items ?? []}
          sample={sample?.items[0] ?? null}
          onSaved={saveSettings}
        />

        <CategoryRulesSection />

        <InviteSection invites={invites ?? []} onChange={() => void refetchInvites()} />

        <section className="rounded-card border border-line bg-panel">
          <h3 className="border-b border-line px-5 py-3">Members</h3>
          <ul className="divide-y divide-line2">
            {(members ?? []).map((member) => (
              <li key={member.id} className="flex items-center justify-between px-5 py-2.5">
                <div>
                  <p className="text-[12.5px] text-t1">{member.name}</p>
                  <p className="font-mono text-[10.5px] text-t4">{member.email}</p>
                </div>
                <span className="text-[11.5px] text-t3">
                  {member.role === "ADMIN" ? "Admin" : "Pricing Analyst"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function InviteSection({ invites, onChange }: { invites: InviteDto[]; onChange: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("PRICING_ANALYST");
  const [created, setCreated] = useState<InviteDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => api.post<InviteDto>("/org/invites", { email, role }),
    onSuccess(invite) {
      setCreated(invite);
      setEmail("");
      setError(null);
      onChange();
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : "Could not create the invite."),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api.delete(`/org/invites/${id}`),
    onSuccess: onChange,
  });

  return (
    <section className="rounded-card border border-line bg-panel p-5">
      <h3 className="mb-1">Invite a colleague</h3>
      <p className="mb-3 text-[13px] text-t3">
        The code is bound to their email address, so an intercepted code is useless without also
        controlling that inbox.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="colleague@example.com"
          aria-label="Invite email"
          className="h-8 w-64"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          aria-label="Invite role"
          className="h-8 rounded-md border border-line bg-input px-2 text-[12.5px]"
        >
          <option value="PRICING_ANALYST">Pricing Analyst</option>
          <option value="ADMIN">Admin</option>
        </select>
        <Button size="sm" onClick={() => create.mutate()} disabled={!email || create.isPending}>
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Create invite
        </Button>
      </div>

      {error && <p className="mt-2 text-[13px] text-neg">{error}</p>}

      {created && (
        <div className="mt-3 flex items-center justify-between rounded-inset border border-line bg-inset px-3 py-2.5">
          <div>
            <p className="text-[12px] text-t3">Code for {created.email}</p>
            <p className="font-mono text-sm tracking-widest text-t1">{created.code}</p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void navigator.clipboard.writeText(created.code)}
              aria-label="Copy invite code"
            >
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
            {/* The code alone leaves the recipient to work out where it goes.
                The link lands them on the redemption form with it filled in. */}
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                void navigator.clipboard.writeText(
                  `${window.location.origin}/join?code=${created.code}`,
                )
              }
            >
              Copy invite link
            </Button>
          </div>
        </div>
      )}

      {invites.length > 0 && (
        <ul className="mt-3 divide-y divide-line2 border-t border-line">
          {invites.map((invite) => (
            <li key={invite.id} className="flex items-center justify-between py-2">
              <span className="text-[13px] text-t3">{invite.email}</span>
              <Button
                size="sm"
                variant="ghost"
                className="h-7"
                onClick={() => revoke.mutate(invite.id)}
              >
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
