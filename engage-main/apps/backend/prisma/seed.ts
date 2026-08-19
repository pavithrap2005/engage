import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { join } from 'path';

const dbPath = join(process.cwd(), 'prisma', 'dev.db').replace(/\\/g, '/');
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: `file:${dbPath}`
    }
  }
});

async function main() {
  const email = 'admin@indiquer.ai';

  // Clean start for seeded elements
  const existing = await prisma.user.findUnique({ where: { email } });
  let widget = await prisma.widget.findFirst({
    include: { workspace: true },
  });

  if (!existing) {
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

    widget = await prisma.widget.create({
      data: {
        name: 'Primary Chat Widget',
        workspaceId: workspace.id,
      },
      include: { workspace: true },
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

    await prisma.bot.create({
      data: {
        name: 'Indiquer AI Bot',
        workspaceId: workspace.id,
        isActive: true,
        modelProvider: 'GROQ',
        prompt: 'You are a helpful customer support bot for Indiquer Engage.',
      },
    });

    console.log('Database successfully seeded: admin@indiquer.ai / password123');
  } else {
    console.log('Seeded test account already exists');
  }

  if (widget) {
    const bot = await prisma.bot.findFirst({ where: { workspaceId: widget.workspaceId } });
    if (!bot) {
      await prisma.bot.create({
        data: {
          name: 'Indiquer AI Bot',
          workspaceId: widget.workspaceId,
          isActive: true,
          modelProvider: 'GROQ',
          prompt: 'You are a helpful customer support bot for Indiquer Engage.',
        },
      });
      console.log('Created Bot for Workspace.');
    }

    console.log('--------------------------------------------------');
    console.log(`Engage Widget App ID : ${widget.appId}`);
    console.log(`Engage Workspace ID  : ${widget.workspaceId}`);
    console.log('--------------------------------------------------');
  }

  // Seed or Update Indinote (IndiNotes v2.0) Workspace, Widget, and Bot
  let indinoteOrg = await prisma.organization.findFirst({ where: { name: 'Indinote Workspace Org' } });
  if (!indinoteOrg) {
    indinoteOrg = await prisma.organization.create({
      data: { name: 'Indinote Workspace Org' }
    });
  }

  let indinoteWorkspace = await prisma.workspace.findFirst({
    where: { name: 'Indinote Workspace' }
  });
  if (!indinoteWorkspace) {
    indinoteWorkspace = await prisma.workspace.create({
      data: {
        name: 'Indinote Workspace',
        organizationId: indinoteOrg.id,
      }
    });
  }

  let indinoteWidget = await prisma.widget.findFirst({
    where: { workspaceId: indinoteWorkspace.id }
  });
  if (!indinoteWidget) {
    indinoteWidget = await prisma.widget.create({
      data: {
        name: 'Indinote Chat Widget',
        workspaceId: indinoteWorkspace.id,
        appId: 'indinote-app-v2',
      }
    });

    await prisma.widgetCustomization.create({
      data: {
        widgetId: indinoteWidget.id,
        color: '#2563eb',
        welcomeMessage: '👋 Welcome to Indinote! How can I assist you with your visual memos, agenda, or sketches today?',
        offlineMessage: 'We are currently offline. Please leave a memo or message!',
        autoOpen: false,
        delayTimer: 2,
        isDarkMode: false,
      }
    });
  }

  const indinotePrompt = `You are the official AI Assistant for Indinote (also referenced as IndiNotes v2.0) — a premium visual productivity workspace and memo management application.

Core Purpose:
Indinote is an all-in-one visual productivity workspace combining:
1. Visual Card-Based Memos: Rich digital cards for thoughts, lists, media embeds, and project references.
2. Collections & Workspaces: Color-coded categorization and multi-board organization for work and personal life.
3. Private Vault: Secure, password-protected partition for sensitive notes.
4. Agenda & Task Scheduling: Calendar integration with date/time reminders, snooze actions, and recurring task schedules.
5. Freehand Sketch Studio: Integrated vector/raster drawing canvas enabling users to hand-draw diagrams and attach sketches directly into notes.

Key Features & Specifications:
- Formatting & Content: Rich text notes with titles, body descriptions, checklists/bullet points, media attachments (image uploads, local previews), and video integration with automatic YouTube video preview embedding and direct playback. Color coding with custom hex palettes.
- Collections & Folders: Custom collections (e.g., Work, Personal, custom categories), multiple workspace boards (e.g., Main Workspace), dedicated Vault view with password re-authentication for protected memos, and a dedicated Trash bin for deleted items before permanent removal.
- Search & Filtering: Instant real-time text search across titles and card body contents. Filter by collection/folder. Filter toggles: Has Images, Has Reminders / Schedules. Sorting options: Last Modified, Creation Date, Alphabetical (A-Z).
- Freehand Sketch Studio (Canvas): Pen/brush tool with stroke width control and color selector. Eraser tool with canvas background preservation. One-click conversion from sketch into a visual memo card.
- Export Capabilities: PNG Image Export via HTML5 Canvas snapshot rendering (canvas.toDataURL("image/png")) and html2canvas client-side screenshot export with clean white background compositing for transparent drawings.
- Storage & Architecture: Local client-side cache using localStorage (indinote_app_v3_state, indinote_jwt_token, indinote_active_session) + browser IndexedDB (IndinoteDB stores for users & offline caching). Cloud/Backend PostgreSQL database synchronized through the REST API /api/auth/notes using verified Firebase JWT Bearer tokens.
- Authentication: Firebase Authentication (Email/Password, Google OAuth, Username-to-email resolution, Password Reset emails).

Common FAQs & Rules:
1. Saving & Syncing: Notes auto-save in real time to local storage (localStorage & IndexedDB) for instant responsiveness, and synchronize to the cloud PostgreSQL database via /api/auth/notes under the user's authenticated account.
2. Deleting & Archiving: Deleting a memo moves it to Trash (soft delete). Users can Restore it back to active boards or click "Permanently Delete".
3. Private Vault: Protected notes are hidden from normal views. Accessing Vault prompts for the account login password, unlocking a temporary session before auto-locking.
4. Reminders & Agenda: Attaching date/time places notes in Agenda view with notification badges and snooze options.
5. Constraints: Password minimum 6 characters (Firebase Auth), 50MB file upload limit, Vault automatic inactivity lock.

Tone & Guidelines:
- Answer questions accurately, concisely, and helpfully based strictly on Indinote.
- If asked about unrelated apps or general questions, politely explain you are the Indinote assistant and answer in relation to Indinote.
- Keep answers under 3-4 sentences.`;

  let indinoteBot = await prisma.bot.findFirst({
    where: { workspaceId: indinoteWorkspace.id }
  });

  if (!indinoteBot) {
    indinoteBot = await prisma.bot.create({
      data: {
        name: 'Indinote Assistant',
        workspaceId: indinoteWorkspace.id,
        isActive: true,
        modelProvider: 'GROQ',
        prompt: indinotePrompt,
      }
    });
  } else {
    indinoteBot = await prisma.bot.update({
      where: { id: indinoteBot.id },
      data: {
        name: 'Indinote Assistant',
        isActive: true,
        prompt: indinotePrompt,
      }
    });
  }

  console.log('--------------------------------------------------');
  console.log('✅ Indinote Workspace & Bot Configured Successfully!');
  console.log(`Indinote App ID      : ${indinoteWidget.appId}`);
  console.log(`Indinote Workspace ID: ${indinoteWorkspace.id}`);
  console.log(`Indinote Bot Name    : ${indinoteBot.name}`);
  console.log('--------------------------------------------------');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
