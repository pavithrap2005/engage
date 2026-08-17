import { Injectable, ConflictException, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async signup(email: string, password: string, firstName: string, lastName: string, organizationName: string) {
    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);

    // Create Tenant structure in a single transaction
    return this.prisma.$transaction(async (tx) => {
      // 1. Create User
      const user = await tx.user.create({
        data: {
          email,
          passwordHash: hash,
          firstName,
          lastName,
        },
      });

      // 2. Create Organization
      const orgName = organizationName || `${firstName || 'My'}'s Org`;
      const org = await tx.organization.create({
        data: {
          name: orgName,
        },
      });

      // 3. Create default Workspace
      const workspace = await tx.workspace.create({
        data: {
          name: 'Default Workspace',
          organizationId: org.id,
        },
      });

      // 4. Associate User to Organization as OWNER
      await tx.membership.create({
        data: {
          userId: user.id,
          organizationId: org.id,
          role: 'OWNER',
        },
      });

      // 5. Create default Widget for Workspace
      const widget = await tx.widget.create({
        data: {
          name: 'Primary Chat Widget',
          workspaceId: workspace.id,
        },
      });

      // 6. Create default Widget Customization settings
      await tx.widgetCustomization.create({
        data: {
          widgetId: widget.id,
          color: '#4F46E5',
          welcomeMessage: 'Hello! How can we help you today?',
          offlineMessage: 'We are currently offline. Please leave a message!',
          autoOpen: false,
          delayTimer: 3,
          isDarkMode: false,
        },
      });

      // Generate JWT Token
      const token = this.generateToken(user);
      return {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        },
        organization: org,
        workspace: workspace,
        widgetAppId: widget.appId,
        token,
      };
    });
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        memberships: {
          include: {
            organization: {
              include: {
                workspaces: {
                  include: {
                    widgets: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = this.generateToken(user);

    // Grab first active organization & workspace if exists
    const membership = user.memberships[0];
    const org = membership?.organization;
    const workspace = org?.workspaces[0];
    const widget = workspace?.widgets[0];

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      organization: org ? { id: org.id, name: org.name } : null,
      workspace: workspace ? { id: workspace.id, name: workspace.name } : null,
      widgetAppId: widget ? widget.appId : null,
      token,
    };
  }

  async firebaseSync(email: string, firstName: string, lastName: string, signupIfNeeded: boolean = true, organizationName: string = '') {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        memberships: {
          include: {
            organization: {
              include: {
                workspaces: {
                  include: {
                    widgets: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (user) {
      const token = this.generateToken(user);
      const membership = user.memberships[0];
      const org = membership?.organization;
      const workspace = org?.workspaces[0];
      const widget = workspace?.widgets[0];

      return {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        },
        organization: org ? { id: org.id, name: org.name } : null,
        workspace: workspace ? { id: workspace.id, name: workspace.name } : null,
        widgetAppId: widget ? widget.appId : null,
        token,
      };
    }

    if (!signupIfNeeded) {
      throw new NotFoundException('User not found. Please sign up first.');
    }

    // Register new user under organization transaction
    const randomPassword = Math.random().toString(36).slice(-10);
    return this.signup(email, randomPassword, firstName || email.split('@')[0], lastName || '', organizationName);
  }

  private generateToken(user: any) {
    const payload = { email: user.email, sub: user.id };
    return this.jwtService.sign(payload);
  }
}
