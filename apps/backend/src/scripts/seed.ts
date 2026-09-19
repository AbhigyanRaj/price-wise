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
    );

    for (const rec of recommendations) {
      await seedRepo.createRecommendationWithRuns(organization.id, rec);
    }
    totalRecommendations += recommendations.length;

    await seedRepo.createAuditEntries(organization.id, [
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
    ]);

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
