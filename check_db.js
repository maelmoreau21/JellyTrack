/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  try {
    const lastHistory = await prisma.playbackHistory.findMany({
      orderBy: { startedAt: 'desc' },
      take: 5,
      include: { media: { select: { title: true } }, user: { select: { username: true } } }
    });
    console.log('--- Last 5 PlaybackHistory ---');
    console.log(JSON.stringify(lastHistory, null, 2));

    const lastLogs = await prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5
    });
    console.log('\n--- Last 5 AuditLogs ---');
    console.log(JSON.stringify(lastLogs, null, 2));

    const activeStreams = await prisma.activeStream.count();
    console.log('\nActive Streams Count:', activeStreams);

  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

check();
