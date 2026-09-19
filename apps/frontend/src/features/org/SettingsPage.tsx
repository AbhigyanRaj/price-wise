import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Plus } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FullPageSpinner } from "@/components/data/States";
import { useAuth, SESSION_QUERY_KEY } from "@/features/auth/useAuth";
import type { InviteDto, MemberDto, OrganizationDto, RecommendationDto } from "@/lib/types";
import { queryString } from "@/lib/api";

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const org = session?.organization;
  const [threshold, setThreshold] = useState(org?.confidenceThreshold ?? 0.8);
  const [maxDelta, setMaxDelta] = useState(org?.maxPriceDeltaPct ?? 0.2);

  // Recent scores power the live preview. Fetched once and filtered in the
  // browser, so dragging the slider costs no requests at all.
  const { data: recent } = useQuery({
    queryKey: ["recommendations", "recent-scores"],
    queryFn: ({ signal }) =>
      api.paged<RecommendationDto>(`/recommendations${queryString({ limit: 20 })}`, signal),
    staleTime: 60_000,
  });

  const { data: members } = useQuery({
    queryKey: ["org", "members"],
    queryFn: ({ signal }) => api.get<MemberDto[]>("/org/members", signal),
  });

  const { data: invites, refetch: refetchInvites } = useQuery({
    queryKey: ["org", "invites"],
    queryFn: ({ signal }) => api.get<InviteDto[]>("/org/invites", signal),
  });

  const save = useMutation({
    mutationFn: () =>
      api.patch<OrganizationDto>("/org/settings", {
        confidenceThreshold: threshold,
        maxPriceDeltaPct: maxDelta,
      }),
    onSuccess(updated) {
      queryClient.setQueryData(SESSION_QUERY_KEY, (old: unknown) =>
        old && typeof old === "object"
          ? { ...(old as object), organization: updated }
          : old,
      );
      setSaved(true);
      setError(null);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : "Could not save. Please try again."),
  });

  if (!org) return <FullPageSpinner />;

  const scores = (recent?.items ?? []).map((r) => r.confidenceScore);
  const wouldAutoExecute = scores.filter((score) => score >= threshold).length;

  return (
    <div className="max-w-3xl p-6">
      <header className="mb-6">
        <h1>Settings</h1>
        <p className="mt-0.5 text-sm text-ink-secondary">
          The risk posture this organization operates under.
        </p>
      </header>

      {error && (
        <div role="alert" className="mb-4 rounded-md border border-down/40 bg-down-wash px-3 py-2">
          <p className="text-[13px] text-down">{error}</p>
        </div>
      )}

      <section className="mb-5 rounded-md border border-line bg-surface p-4">
        <h3 className="mb-1">Auto-execution threshold</h3>
        <p className="mb-4 text-[13px] text-ink-secondary">
          Recommendations at or above this confidence apply without asking you.
        </p>

        <div className="flex items-center gap-4">
          <input
            type="range"
            min={0.5}
            max={1}
            step={0.01}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            aria-label="Confidence threshold"
            className="h-1.5 flex-1 accent-[var(--brand)]"
          />
          <span className="tnum w-12 text-right font-mono text-sm">{threshold.toFixed(2)}</span>
        </div>

        {/* An abstract number made concrete. "0.90" means nothing on its own;
            "8 of your last 20" is a decision someone can actually make. */}
        <p className="mt-3 rounded-md bg-canvas px-3 py-2 text-[13px] text-ink-secondary">
          Of your last {scores.length} recommendations,{" "}
          <span className="tnum font-medium text-ink">{wouldAutoExecute}</span> would have executed
          automatically at this threshold.
        </p>

        <h3 className="mb-1 mt-5">Maximum price change</h3>
        <p className="mb-3 text-[13px] text-ink-secondary">
          No single change may move a price by more than this, in either direction.
        </p>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={0.05}
            max={0.5}
            step={0.01}
            value={maxDelta}
            onChange={(e) => setMaxDelta(Number(e.target.value))}
            aria-label="Maximum price change"
            className="h-1.5 flex-1 accent-[var(--brand)]"
          />
          <span className="tnum w-12 text-right font-mono text-sm">
            {(maxDelta * 100).toFixed(0)}%
          </span>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving" : "Save changes"}
          </Button>
          {saved && <span className="text-[13px] text-up">Saved</span>}
        </div>
      </section>

      <InviteSection invites={invites ?? []} onChange={() => void refetchInvites()} />

      <section className="rounded-md border border-line bg-surface">
        <h3 className="border-b border-line px-4 py-2.5 text-sm">Members</h3>
        <ul className="divide-y divide-line">
          {(members ?? []).map((member) => (
            <li key={member.id} className="flex items-center justify-between px-4 py-2.5">
              <div>
                <p className="text-[13px]">{member.name}</p>
                <p className="font-mono text-[11px] text-ink-tertiary">{member.email}</p>
              </div>
              <span className="text-[12px] text-ink-secondary">
                {member.role === "ADMIN" ? "Admin" : "Pricing Analyst"}
              </span>
            </li>
          ))}
        </ul>
      </section>
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
    <section className="mb-5 rounded-md border border-line bg-surface p-4">
      <h3 className="mb-1">Invite a colleague</h3>
      <p className="mb-3 text-[13px] text-ink-secondary">
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
          className="h-8 rounded-md border border-line bg-canvas px-2 text-[13px]"
        >
          <option value="PRICING_ANALYST">Pricing Analyst</option>
          <option value="ADMIN">Admin</option>
        </select>
        <Button size="sm" onClick={() => create.mutate()} disabled={!email || create.isPending}>
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Create invite
        </Button>
      </div>

      {error && <p className="mt-2 text-[13px] text-down">{error}</p>}

      {created && (
        <div className="mt-3 flex items-center justify-between rounded-md border border-line bg-canvas px-3 py-2">
          <div>
            <p className="text-[12px] text-ink-secondary">Code for {created.email}</p>
            <p className="font-mono text-sm tracking-widest text-ink">{created.code}</p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void navigator.clipboard.writeText(created.code)}
            aria-label="Copy invite code"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
      )}

      {invites.length > 0 && (
        <ul className="mt-3 divide-y divide-line border-t border-line">
          {invites.map((invite) => (
            <li key={invite.id} className="flex items-center justify-between py-2">
              <span className="text-[13px] text-ink-secondary">{invite.email}</span>
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
