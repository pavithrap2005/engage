import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  async getRoomsForWorkspace(workspaceId: string) {
    return this.prisma.chatRoom.findMany({
      where: { workspaceId },
      include: {
        visitor: true,
        assignedAgent: {
          select: { id: true, email: true, firstName: true, lastName: true }
        },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });
  }

  async getMessagesForRoom(roomId: string) {
    return this.prisma.message.findMany({
      where: { chatRoomId: roomId },
      orderBy: { createdAt: 'asc' }
    });
  }

  async getOrCreateRoomForVisitor(workspaceId: string, visitorId: string) {
    let targetWorkspaceId = workspaceId;

    // Fallback if workspaceId is invalid or a visitorId fallback
    const wsExists = await this.prisma.workspace.findUnique({ where: { id: targetWorkspaceId } });
    if (!wsExists) {
      let defaultWs = await this.prisma.workspace.findFirst();
      if (!defaultWs) {
        // Safe auto-provisioning fallback if no workspace exists in database
        const org = await this.prisma.organization.create({
          data: { name: 'Indiquer Auto-provisioned Org' }
        });
        defaultWs = await this.prisma.workspace.create({
          data: {
            name: 'Default Workspace',
            organizationId: org.id
          }
        });
      }
      targetWorkspaceId = defaultWs.id;
    }

    // Ensure visitor exists in the database to prevent foreign key violations
    let visitorExists = await this.prisma.visitor.findUnique({ where: { id: visitorId } });
    if (!visitorExists) {
      visitorExists = await this.prisma.visitor.create({
        data: {
          id: visitorId,
          workspaceId: targetWorkspaceId,
          browser: 'Unknown',
          os: 'Unknown',
          device: 'Unknown',
          ipAddress: '127.0.0.1',
          country: 'Unknown',
          city: 'Unknown',
        }
      });
    }

    // Find if there is an active (OPEN or WAITING) room for this visitor
    let room = await this.prisma.chatRoom.findFirst({
      where: {
        workspaceId: targetWorkspaceId,
        visitorId,
        status: { in: ['OPEN', 'WAITING'] }
      },
      include: {
        visitor: true,
      }
    });

    if (!room) {
      room = await this.prisma.chatRoom.create({
        data: {
          workspaceId: targetWorkspaceId,
          visitorId,
          status: 'WAITING',
        },
        include: {
          visitor: true,
        }
      });
    }

    return room;
  }

  async saveMessage(roomId: string, senderType: string, senderId: string | null, content: string) {
    // Save message
    const message = await this.prisma.message.create({
      data: {
        chatRoomId: roomId,
        senderType,
        senderId,
        content,
      }
    });

    // Touch chat room updatedAt time
    await this.prisma.chatRoom.update({
      where: { id: roomId },
      data: { updatedAt: new Date() }
    });

    return message;
  }

  async assignAgentToRoom(roomId: string, agentId: string) {
    const room = await this.prisma.chatRoom.findUnique({ where: { id: roomId } });
    if (!room) {
      throw new NotFoundException('Chat room not found');
    }

    return this.prisma.chatRoom.update({
      where: { id: roomId },
      data: {
        assignedAgentId: agentId,
        status: 'OPEN'
      },
      include: {
        assignedAgent: {
          select: { id: true, firstName: true, lastName: true }
        }
      }
    });
  }

  async closeRoom(roomId: string) {
    return this.prisma.chatRoom.update({
      where: { id: roomId },
      data: {
        status: 'CLOSED'
      }
    });
  }

  async submitCsat(roomId: string, rating: number, feedback?: string) {
    return this.prisma.chatRoom.update({
      where: { id: roomId },
      data: {
        rating,
        feedback: feedback || null
      }
    });
  }

  async getRoomById(roomId: string) {
    return this.prisma.chatRoom.findUnique({
      where: { id: roomId },
      include: { visitor: true }
    });
  }

  async getMissedRooms(workspaceId: string) {
    return this.prisma.chatRoom.findMany({
      where: {
        workspaceId,
        assignedAgentId: null,
      },
      include: {
        visitor: true,
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });
  }

  async getAiRooms(workspaceId: string) {
    return this.prisma.chatRoom.findMany({
      where: {
        workspaceId,
        assignedAgentId: null,
        messages: {
          some: { senderType: 'BOT' }
        }
      },
      include: {
        visitor: true,
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });
  }

  private async queryGroq(systemPrompt: string, userPrompt: string): Promise<string> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      console.warn('GROQ_API_KEY not configured.');
      return '';
    }

    const models = [
      process.env.GROQ_MODEL,
      'openai/gpt-oss-120b',
      'openai/gpt-oss-20b',
      'qwen/qwen3.6-27b',
      'groq/compound-mini'
    ].filter(Boolean) as string[];

    for (const model of models) {
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            temperature: 0.6,
            max_tokens: 250
          })
        });

        if (res.ok) {
          const data = await res.json();
          const reply = data.choices?.[0]?.message?.content?.trim();
          if (reply) {
            return reply;
          }
        }
      } catch (err) {
        console.error(`Groq query failed with model ${model}:`, err);
      }
    }

    return '';
  }

  async triggerBotResponse(roomId: string, workspaceId: string, visitorMessage: string) {
    // 1. Fetch the Bot configured for this workspace
    const bot = await this.prisma.bot.findFirst({
      where: {
        workspaceId,
        isActive: true,
      },
    });

    const botName = bot?.name || 'AI Assistant';
    let systemPrompt = '';

    if (bot && bot.prompt) {
      systemPrompt = `You are an AI assistant named "${botName}".
${bot.prompt}

Guidelines:
- Answer questions accurately, concisely, and helpfully based strictly on your identity and knowledge.
- If the user asks something completely outside of your app, domain, or knowledge, politely explain that you are the assistant for "${botName}" and only answer questions related to it.
- Keep responses concise (under 3-4 sentences).
- If the visitor specifically asks to talk to a human or live support agent, clearly state that you will notify an agent.`;
    } else {
      systemPrompt = `You are a helpful customer support assistant named "${botName}".
Answer questions professionally, politely, and concisely.
Keep your answers under 3 sentences. If the user wants to speak to a human or agent, state that you will notify an agent.`;
    }

    let reply = await this.queryGroq(systemPrompt, visitorMessage);

    // Fallback if Groq query fails or times out
    if (!reply) {
      const text = visitorMessage.toLowerCase();
      if (text.includes('human') || text.includes('agent') || text.includes('support') || text.includes('help')) {
        reply = "I understand you need to speak with a human. I am notifying an agent right now. Please wait in this chat window!";
      } else {
        reply = `Hello! I am the ${botName}. How can I assist you with your questions today?`;
      }
    }

    // If response indicates human handoff (or if user asked for it), set status to WAITING
    const lowercaseReply = reply.toLowerCase();
    const lowercaseVisitor = visitorMessage.toLowerCase();
    if (
      lowercaseReply.includes('notify an agent') ||
      lowercaseReply.includes('human') ||
      lowercaseReply.includes('representative') ||
      lowercaseVisitor.includes('human') ||
      lowercaseVisitor.includes('agent') ||
      lowercaseVisitor.includes('support')
    ) {
      await this.prisma.chatRoom.update({
        where: { id: roomId },
        data: { status: 'WAITING' }
      });
    }

    // Save BOT message
    return this.saveMessage(roomId, 'BOT', bot?.id || 'AI_BOT_ROOT', reply);
  }

  async getAiSuggestionForRoom(roomId: string) {
    const messages = await this.prisma.message.findMany({
      where: { chatRoomId: roomId },
      orderBy: { createdAt: 'asc' },
      take: 8
    });

    if (messages.length === 0) {
      return { suggestion: "How can I help you today?" };
    }

    // Format chat history context for Groq
    const historyText = messages
      .map(m => `[${m.senderType}]: ${m.content}`)
      .join('\n');

    const systemPrompt = `You are an AI assistant helping a support agent reply to a website visitor.
Based on the recent chat messages, draft a professional, friendly, and concise response that the agent can send to the visitor.
Our pricing tiers are:
- Starter: $19/mo (1 Workspace, basic tracking)
- Professional: $49/mo (Multiple workspaces, CRM integration)
- Enterprise: Custom (Unlimited workspaces, high-performance SLAs)
Our features: Lightweight floatable Shadow DOM chat widgets, real-time dashboards, and automation rules.
Our refund policy: Full refund within 14 days of purchase.
Provide ONLY the suggested reply text. Do NOT include any intro or agent labels (do not say "Here is a suggestion:" or write "Agent:").
Keep it short (1-2 sentences).`;

    let suggestion = await this.queryGroq(systemPrompt, `Chat History:\n${historyText}`);

    // Fallback if Groq query fails
    if (!suggestion) {
      const lastVisitorMsg = [...messages].reverse().find(m => m.senderType === 'VISITOR');
      const text = lastVisitorMsg ? lastVisitorMsg.content.toLowerCase() : '';
      suggestion = "Hello! How can I assist you today?";
      if (text.includes('price') || text.includes('pricing') || text.includes('cost')) {
        suggestion = "Yes! Our plans start at $19/month for the Starter tier, and $49/month for the Professional tier. We also offer a custom Enterprise plan. Would you like to see a comparison or speak to sales?";
      } else if (text.includes('feature') || text.includes('sdk') || text.includes('widget')) {
        suggestion = "We offer a lightweight Shadow DOM chat widget, real-time dashboards for active visitor tracking, and visual chatbot flow builders.";
      } else if (text.includes('refund') || text.includes('cancel')) {
        suggestion = "According to our refund policy, you can request a full refund within 14 days of your purchase. Let me guide you through the process if you'd like.";
      }
    }

    return { suggestion };
  }
}
