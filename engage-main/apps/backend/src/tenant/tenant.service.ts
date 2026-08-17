import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class TenantService {
  constructor(private prisma: PrismaService) {}

  async getWorkspacesForUser(userId: string) {
    // Find all organizations user is member of
    const memberships = await this.prisma.membership.findMany({
      where: { userId },
      include: {
        organization: {
          include: {
            workspaces: {
              include: {
                widgets: true
              }
            }
          }
        }
      }
    });

    const orgs = memberships.map(m => m.organization);
    return orgs;
  }

  async getWorkspaceDetails(workspaceId: string, userId: string) {
    // Verify membership
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        organization: {
          include: {
            memberships: {
              where: { userId }
            }
          }
        },
        widgets: {
          include: {
            customization: true
          }
        }
      }
    });

    if (!workspace || workspace.organization.memberships.length === 0) {
      throw new NotFoundException('Workspace not found or access denied');
    }

    return workspace;
  }

  async updateWidgetCustomization(widgetId: string, userId: string, customizationData: any) {
    // Verify user access via widget's workspace
    const widget = await this.prisma.widget.findUnique({
      where: { id: widgetId },
      include: {
        workspace: {
          include: {
            organization: {
              include: {
                memberships: {
                  where: { userId }
                }
              }
            }
          }
        }
      }
    });

    if (!widget || widget.workspace.organization.memberships.length === 0) {
      throw new NotFoundException('Widget not found or access denied');
    }

    // Update customization
    return this.prisma.widgetCustomization.update({
      where: { widgetId },
      data: {
        color: customizationData.color,
        gradient: customizationData.gradient,
        shape: customizationData.shape,
        welcomeMessage: customizationData.welcomeMessage,
        offlineMessage: customizationData.offlineMessage,
        autoOpen: customizationData.autoOpen,
        delayTimer: customizationData.delayTimer,
        isDarkMode: customizationData.isDarkMode,
        customCss: customizationData.customCss,
      }
    });
  }
}
