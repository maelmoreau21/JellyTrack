#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/*
 * Simple retention script to prune old telemetry events.
 * Usage: `RETENTION_DAYS=90 node scripts/retention.js`
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const retentionDays = parseInt(process.env.RETENTION_DAYS || '90', 10);
const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

(async () => {
  console.log(`[Retention] Deleting telemetry events before ${cutoff.toISOString()} (retentionDays=${retentionDays})`);
  const res = await prisma.telemetryEvent.deleteMany({ where: { createdAt: { lt: cutoff } } });
  console.log(`[Retention] Deleted ${res.count} telemetry events.`);
  await prisma.$disconnect();
  process.exit(0);
})().catch((err) => {
  console.error('[Retention] Error during retention run:', err);
  process.exit(1);
});
