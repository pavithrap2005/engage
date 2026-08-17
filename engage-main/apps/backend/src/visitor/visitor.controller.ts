import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma.service';

@Controller('visitors')
@UseGuards(JwtAuthGuard)
export class VisitorController {
  constructor(private prisma: PrismaService) {}

  @Get('live/workspace/:workspaceId')
  async getLiveVisitors(@Param('workspaceId') workspaceId: string) {
    // Return visitors seen in the last 15 minutes
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    return this.prisma.visitor.findMany({
      where: {
        workspaceId,
        lastSeen: {
          gte: fifteenMinutesAgo,
        },
      },
      include: {
        sessions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { lastSeen: 'desc' },
    });
  }
}
