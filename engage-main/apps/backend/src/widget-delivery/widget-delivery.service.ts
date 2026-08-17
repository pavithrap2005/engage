import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class WidgetDeliveryService {
  constructor(private prisma: PrismaService) {}

  async initWidget(appId: string, userAgent: string, ipAddress: string, visitorId?: string) {
    // Find the widget configuration by appId
    let widget = await this.prisma.widget.findUnique({
      where: { appId },
      include: {
        customization: true,
        workspace: {
          include: {
            organization: true
          }
        }
      }
    });

    if (!widget || !widget.isActive) {
      // Fallback: search if there's any active widget or auto-provision one for this appId
      const defaultWidget = await this.prisma.widget.findFirst({
        include: {
          customization: true,
          workspace: {
            include: {
              organization: true
            }
          }
        }
      });

      if (defaultWidget) {
        try {
          widget = await this.prisma.widget.create({
            data: {
              appId,
              name: 'Chat Widget (' + appId.slice(0, 10) + ')',
              workspaceId: defaultWidget.workspaceId,
              isActive: true,
              customization: {
                create: {
                  color: defaultWidget.customization?.color || '#4F46E5',
                  welcomeMessage: defaultWidget.customization?.welcomeMessage || 'Hello! How can we help you today?',
                  offlineMessage: defaultWidget.customization?.offlineMessage || 'We are currently offline.',
                  autoOpen: false,
                  delayTimer: 3,
                  isDarkMode: false
                }
              }
            },
            include: {
              customization: true,
              workspace: {
                include: {
                  organization: true
                }
              }
            }
          });
        } catch (e) {
          widget = defaultWidget;
        }
      } else {
        throw new NotFoundException('Widget config not found or inactive');
      }
    }

    // Parse User Agent metadata
    const browser = this.parseBrowser(userAgent);
    const os = this.parseOS(userAgent);
    const device = this.parseDevice(userAgent);

    // Register/update Visitor
    let visitor: any = null;
    let session: any = null;

    if (visitorId) {
      visitor = await this.prisma.visitor.findUnique({
        where: { id: visitorId },
        include: {
          sessions: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });
    }

    if (visitor && visitor.workspaceId === widget.workspaceId) {
      // Reuse existing visitor
      visitor = await this.prisma.visitor.update({
        where: { id: visitor.id },
        data: { lastSeen: new Date() },
        include: {
          sessions: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });
      session = visitor.sessions?.[0];
    } else {
      // Create new Visitor
      visitor = await this.prisma.visitor.create({
        data: {
          workspaceId: widget.workspaceId,
          browser,
          os,
          device,
          ipAddress,
          country: 'Localhost',
          city: 'Local Dev',
          language: 'en',
        },
      });
    }

    // Check if the latest session is still active (within 30 mins)
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    if (!session || session.createdAt < thirtyMinutesAgo) {
      session = await this.prisma.session.create({
        data: {
          visitorId: visitor.id,
          currentUrl: 'Host Website',
          visitDuration: 0,
        },
      });
    }

    const orgName = (widget as any)?.workspace?.organization?.name || widget?.name || 'Indiquer Assistant';

    return {
      visitorId: visitor.id,
      sessionId: session.id,
      workspaceId: widget.workspaceId,
      customization: {
        ...(widget.customization || {}),
        name: orgName
      },
    };
  }

  private parseBrowser(ua: string): string {
    if (!ua) return 'Unknown';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Chrome')) return 'Chrome';
    if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
    if (ua.includes('Edge')) return 'Edge';
    return 'Other';
  }

  private parseOS(ua: string): string {
    if (!ua) return 'Unknown';
    if (ua.includes('Windows')) return 'Windows';
    if (ua.includes('Macintosh') || ua.includes('Mac OS')) return 'macOS';
    if (ua.includes('Android')) return 'Android';
    if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
    if (ua.includes('Linux')) return 'Linux';
    return 'Other';
  }

  private parseDevice(ua: string): string {
    if (!ua) return 'Unknown';
    if (ua.includes('Mobi') || ua.includes('Android') || ua.includes('iPhone')) return 'Mobile';
    if (ua.includes('iPad') || ua.includes('Tablet')) return 'Tablet';
    return 'Desktop';
  }
}
