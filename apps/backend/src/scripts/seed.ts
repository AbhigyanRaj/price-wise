import { CATEGORY_PROFILES, PLANTED_SCENARIOS, SEED_PASSWORD } from "./catalog";
import { generateAll } from "./generateSyntheticData";
import { buildRecommendations } from "./seedRecommendations";
import { hashPassword } from "../lib/password";
import * as seedRepo from "../repositories/seed.repository";
import { round2 } from "./random";

// Truncate-then-insert, so `bun run db:seed` is idempotent.

async function main() {
  const startedAt = Date.now();
  console.log("Resetting database…");
  await seedRepo.truncateAll();

  // Hash once and reuse: argon2id at the OWASP profile costs ~18ms, and four
  // identical passwords do not need four hashes.
  const passwordHash = await hashPassword(SEED_PASSWORD);

  let totalProducts = 0;
  let totalCompetitorPrices = 0;
  let totalRecommendations = 0;

  for (const { org, products } of generateAll()) {
    console.log(`\n${org.name}`);

    const organization = await seedRepo.createOrganization({
      name: org.name,
      confidenceThreshold: org.confidenceThreshold,
      maxPriceDeltaPct: org.maxPriceDeltaPct,
    });

    await seedRepo.createUsers(
      organization.id,
      org.users.map((u) => ({ ...u, passwordHash })),
    );

    // Per-category rules, derived from the same profiles that generated the
    // catalog, so the floors actually bind where the data says they should.
    await seedRepo.createCategoryRules(
      organization.id,
      org.categories.map((category) => {
        const profile = CATEGORY_PROFILES[category];
        return {
          category,
          marginFloorPct: round2((profile?.marginRange[0] ?? 0.15) * 0.8),
          maxDeltaPct: org.maxPriceDeltaPct,
        };
      }),
    );

    const created: { id: string; generated: (typeof products)[number] }[] = [];
    for (const generated of products) {
      const product = await seedRepo.createProductWithHistory(organization.id, generated);
      created.push({ id: product.id, generated });
      totalCompetitorPrices += generated.competitorPrices.length;
    }
    totalProducts += created.length;

    const admin = await seedRepo.findUserByEmail(org.users[0]!.email);
    const analyst = await seedRepo.findUserByEmail(org.users[1]!.email);
    if (!admin || !analyst) throw new Error(`Seed users missing for ${org.name}`);

    const recommendations = buildRecommendations(
      created,
      { adminId: admin.id, analystId: analyst.id },
      org.slug === "NW" ? 4242 : 8484,
      org.confidenceThreshold,
    );

    const auditEntries: Parameters<typeof seedRepo.createAuditEntries>[1] = [
      {
        userId: admin.id,
        action: "ORG_CREATED",
        entityType: "Organization",
        entityId: organization.id,
        createdAt: new Date(Date.now() - 7 * 86_400_000),
      },
      {
        userId: analyst.id,
        action: "USER_JOINED",
        entityType: "User",
        entityId: analyst.id,
        createdAt: new Date(Date.now() - 6 * 86_400_000),
      },
    ];

    for (const rec of recommendations) {
      const { id } = await seedRepo.createRecommendationWithRuns(organization.id, rec);

      // Every resolved recommendation gets the audit row its resolution would
      // have written. Without this the trail held two rows against eight
      // resolutions, so the Activity screen was near-empty on first login and
      // its search and filters looked pointless.
      //
      // The action names are the ones the live services emit, so a seeded row
      // and a real one are indistinguishable, and a null actor marks the
      // auto-executed ones exactly as the running system does.
      if (rec.status === "PENDING") continue;

      // Clamped to now. seedRecommendations picks createdAt from daysAgo(0..6),
      // so on a zero roll the hour offset pushed the resolution into the
      // future and the audit trail rendered "in 54 minutes" for something that
      // had already happened. The offset is what makes the trail readable; it
      // must not move a past event forward past the present.
      const resolvedAt = new Date(Math.min(rec.createdAt.getTime() + 3_600_000, Date.now()));
      const isSystem = rec.status === "AUTO_EXECUTED";

      auditEntries.push({
        userId: isSystem ? null : analyst.id,
        action:
          rec.status === "AUTO_EXECUTED"
            ? "PRICE_AUTO_EXECUTED"
            : rec.status === "REJECTED"
              ? "RECOMMENDATION_REJECTED"
              : rec.status === "MODIFIED"
                ? "RECOMMENDATION_MODIFIED"
                : "RECOMMENDATION_APPROVED",
        entityType: "PricingRecommendation",
        entityId: id,
        createdAt: resolvedAt,
      });

      // An approval or a modification also moved a price, which is a second,
      // separate event against the product.
      if (rec.status === "APPROVED" || rec.status === "MODIFIED" || isSystem) {
        auditEntries.push({
          userId: isSystem ? null : analyst.id,
          action: isSystem ? "PRICE_AUTO_EXECUTED" : "PRICE_APPROVED_AND_EXECUTED",
          entityType: "Product",
          entityId: rec.productId,
          createdAt: new Date(resolvedAt.getTime() + 1000),
        });
      }
    }
    totalRecommendations += recommendations.length;

    await seedRepo.createAuditEntries(organization.id, auditEntries);

    console.log(`  ${created.length} products, ${recommendations.length} recommendations`);
  }

  console.log(`
Seed complete in ${((Date.now() - startedAt) / 1000).toFixed(1)}s
  organizations       2
  users               4   (password: ${SEED_PASSWORD})
  products            ${totalProducts}
  competitor prices   ${totalCompetitorPrices}
  recommendations     ${totalRecommendations}  (${totalRecommendations * 5} agent runs)

Planted demo scenarios:`);
  for (const s of PLANTED_SCENARIOS) {
    console.log(`  ${s.sku.padEnd(14)} ${s.label}`);
    console.log(`  ${"".padEnd(14)} → ${s.expectation}`);
  }
}

main()
  .catch((err) => {
    console.error("\nSEED FAILED:", err);
    process.exitCode = 1;
  })
  .finally(() => seedRepo.disconnect());
