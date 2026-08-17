import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const email = 'admin@indiquer.ai';

  // Clean start for seeded elements
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log('Seeded test account already exists');
    return;
  }

  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash('password123', salt);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: hash,
      firstName: 'Admin',
      lastName: 'User',
    },
  });

  const org = await prisma.organization.create({
    data: {
      name: 'Indiquer Demo',
    },
  });

  const workspace = await prisma.workspace.create({
    data: {
      name: 'Default Workspace',
      organizationId: org.id,
    },
  });

  await prisma.membership.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      role: 'OWNER',
    },
  });

  const widget = await prisma.widget.create({
    data: {
      name: 'Primary Chat Widget',
      workspaceId: workspace.id,
    },
  });

  await prisma.widgetCustomization.create({
    data: {
      widgetId: widget.id,
      color: '#4F46E5',
      welcomeMessage: 'Hello! Welcome to Indiquer Engage. How can we help you?',
      offlineMessage: 'We are currently offline. Please leave a message!',
      autoOpen: true,
      delayTimer: 2,
      isDarkMode: false,
    },
  });

  console.log('Database successfully seeded: admin@indiquer.ai / password123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
