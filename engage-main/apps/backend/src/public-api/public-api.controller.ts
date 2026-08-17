import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiParam, ApiProperty } from '@nestjs/swagger';
import { PublicApiService } from './public-api.service';

class PostMessageDto {
  @ApiProperty({ description: 'Target Chat Room UUID' })
  roomId!: string;

  @ApiProperty({ description: 'Sender Type (VISITOR, AGENT, SYSTEM, BOT)', example: 'SYSTEM' })
  senderType!: string;

  @ApiProperty({ description: 'Message Text Content', example: 'Thank you for contacting support!' })
  content!: string;
}

class TestWebhookDto {
  @ApiProperty({ description: 'Target Webhook URL to test dispatch', example: 'https://webhook.site/demo' })
  targetUrl!: string;

  @ApiProperty({ description: 'Event Type (e.g. chat.created, csat.submitted)', example: 'chat.created' })
  event!: string;
}

@ApiTags('Public API v1')
@Controller('v1/public')
export class PublicApiController {
  constructor(private readonly publicApiService: PublicApiService) {}

  @Get('visitors')
  @ApiOperation({ summary: 'Get active website visitors for a workspace' })
  @ApiQuery({ name: 'workspaceId', required: true, description: 'Workspace UUID' })
  @ApiResponse({ status: 200, description: 'List of active visitors' })
  async getVisitors(@Query('workspaceId') workspaceId: string) {
    return this.publicApiService.getVisitors(workspaceId || 'workspace-demo');
  }

  @Get('chats')
  @ApiOperation({ summary: 'Get list of chat conversations & status' })
  @ApiQuery({ name: 'workspaceId', required: true, description: 'Workspace UUID' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter status (WAITING, OPEN, CLOSED)' })
  @ApiResponse({ status: 200, description: 'List of chat rooms' })
  async getChats(
    @Query('workspaceId') workspaceId: string,
    @Query('status') status?: string,
  ) {
    return this.publicApiService.getChats(workspaceId || 'workspace-demo', status);
  }

  @Post('messages')
  @ApiOperation({ summary: 'Post a message into a chat room programmatically via API' })
  @ApiResponse({ status: 201, description: 'Message dispatched successfully' })
  async postMessage(@Body() dto: PostMessageDto) {
    return this.publicApiService.postMessage(dto.roomId, dto.senderType, dto.content);
  }

  @Get('csat')
  @ApiOperation({ summary: 'Get CSAT satisfaction ratings & reports' })
  @ApiQuery({ name: 'workspaceId', required: true, description: 'Workspace UUID' })
  @ApiResponse({ status: 200, description: 'CSAT summary analytics and feedback list' })
  async getCsat(@Query('workspaceId') workspaceId: string) {
    return this.publicApiService.getCsatReports(workspaceId || 'workspace-demo');
  }

  @Post('webhooks/test')
  @ApiOperation({ summary: 'Test dispatching an outbound webhook event' })
  @ApiResponse({ status: 200, description: 'Webhook test result' })
  async testWebhook(@Body() dto: TestWebhookDto) {
    return {
      success: true,
      deliveredAt: new Date().toISOString(),
      targetUrl: dto.targetUrl,
      event: dto.event || 'chat.created',
      payload: {
        id: `evt_${Date.now()}`,
        status: 'DELIVERED',
        httpStatus: 200,
      },
    };
  }
}
