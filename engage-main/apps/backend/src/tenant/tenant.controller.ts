import { Controller, Get, Put, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantService } from './tenant.service';

@Controller('tenant')
@UseGuards(JwtAuthGuard)
export class TenantController {
  constructor(private tenantService: TenantService) {}

  @Get('workspaces')
  async getWorkspaces(@Request() req: any) {
    const userId = req.user.userId;
    return this.tenantService.getWorkspacesForUser(userId);
  }

  @Get('workspaces/:id')
  async getWorkspaceDetails(@Param('id') id: string, @Request() req: any) {
    const userId = req.user.userId;
    return this.tenantService.getWorkspaceDetails(id, userId);
  }

  @Put('widgets/:widgetId/customization')
  async updateWidgetCustomization(
    @Param('widgetId') widgetId: string,
    @Body() body: any,
    @Request() req: any
  ) {
    const userId = req.user.userId;
    return this.tenantService.updateWidgetCustomization(widgetId, userId, body);
  }

  @Post('verify-key')
  async verifyKey(@Body() body: { provider: string; apiKey: string }) {
    const { provider, apiKey } = body;
    if (!apiKey) {
      return { valid: false, message: 'API key cannot be empty' };
    }

    try {
      if (provider === 'gemini') {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        if (res.ok) {
          return { valid: true, message: 'Gemini Key is Active and verified!' };
        }
        let message = 'Invalid Gemini API key.';
        try {
          const errorData = await res.json();
          if (errorData?.error?.message) {
            message = errorData.error.message;
          }
        } catch (e) {
          // Fallback to default if response isn't JSON
        }
        return { valid: false, message };
      }

      if (provider === 'groq') {
        const res = await fetch('https://api.groq.com/openai/v1/models', {
          headers: {
            'Authorization': `Bearer ${apiKey}`
          }
        });
        if (res.ok) {
          return { valid: true, message: 'Groq Key is Active and verified!' };
        }
        return { valid: false, message: 'Invalid Groq API key.' };
      }

      if (provider === 'openai') {
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: {
            'Authorization': `Bearer ${apiKey}`
          }
        });
        if (res.ok) {
          return { valid: true, message: 'OpenAI Key is Active and verified!' };
        }
        return { valid: false, message: 'Invalid OpenAI API key.' };
      }

      if (provider === 'claude') {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            model: 'claude-3-haiku-20240307',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'test' }]
          })
        });
        if (res.status === 401) {
          return { valid: false, message: 'Invalid Anthropic Claude API key.' };
        }
        if (res.status === 400 || res.ok) {
          return { valid: true, message: 'Claude Key is Active and verified!' };
        }
        return { valid: false, message: `Claude API returned status ${res.status}` };
      }

      return { valid: false, message: 'Unknown provider' };
    } catch (err: any) {
      return { valid: false, message: `Connection failed: ${err.message || 'Unknown network error'}` };
    }
  }
}
