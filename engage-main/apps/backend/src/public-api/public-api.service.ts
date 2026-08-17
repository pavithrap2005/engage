import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class PublicApiService {
  constructor(private prisma: PrismaService) {}

  async getVisitors(workspaceId: string) {
    return this.prisma.visitor.findMany({
      where: { workspaceId },
      include: {
        sessions: {
          take: 5,
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { lastSeen: 'desc' },
    });
  }

  async getChats(workspaceId: string, status?: string) {
    const whereClause: any = { workspaceId };
    if (status) {
      whereClause.status = status.toUpperCase();
    }

    return this.prisma.chatRoom.findMany({
      where: whereClause,
      include: {
        visitor: true,
        assignedAgent: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        messages: {
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async postMessage(roomId: string, senderType: string, content: string) {
    const room = await this.prisma.chatRoom.findUnique({ where: { id: roomId } });
    if (!room) {
      throw new NotFoundException('Chat room not found');
    }

    const message = await this.prisma.message.create({
      data: {
        chatRoomId: roomId,
        senderType: senderType || 'SYSTEM',
        content,
      },
    });

    await this.prisma.chatRoom.update({
      where: { id: roomId },
      data: { updatedAt: new Date() },
    });

    return message;
  }

  async getCsatReports(workspaceId: string) {
    const roomsWithRating = await this.prisma.chatRoom.findMany({
      where: {
        workspaceId,
        rating: { not: null },
      },
      select: {
        id: true,
        rating: true,
        feedback: true,
        createdAt: true,
        updatedAt: true,
        visitor: {
          select: { id: true, city: true, country: true, browser: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const totalRatings = roomsWithRating.length;
    const averageRating = totalRatings > 0
      ? roomsWithRating.reduce((sum, r) => sum + (r.rating || 0), 0) / totalRatings
      : 0;

    return {
      averageRating: parseFloat(averageRating.toFixed(2)),
      totalRatings,
      reports: roomsWithRating,
    };
  }
}
