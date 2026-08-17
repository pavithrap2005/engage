import { Controller, Get, Put, Param, UseGuards, Request, Body } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChatService } from './chat.service';

@Controller('chat')
export class ChatController {
  constructor(private chatService: ChatService) {}

  @Get('rooms/workspace/:workspaceId')
  @UseGuards(JwtAuthGuard)
  async getRooms(@Param('workspaceId') workspaceId: string) {
    return this.chatService.getRoomsForWorkspace(workspaceId);
  }

  @Get('rooms/workspace/:workspaceId/missed')
  @UseGuards(JwtAuthGuard)
  async getMissedRooms(@Param('workspaceId') workspaceId: string) {
    return this.chatService.getMissedRooms(workspaceId);
  }

  @Get('rooms/workspace/:workspaceId/ai')
  @UseGuards(JwtAuthGuard)
  async getAiRooms(@Param('workspaceId') workspaceId: string) {
    return this.chatService.getAiRooms(workspaceId);
  }

  @Get('rooms/:roomId/messages')
  async getMessages(@Param('roomId') roomId: string) {
    return this.chatService.getMessagesForRoom(roomId);
  }

  @Put('rooms/:roomId/assign')
  @UseGuards(JwtAuthGuard)
  async assignRoom(@Param('roomId') roomId: string, @Request() req: any) {
    const agentId = req.user.userId;
    return this.chatService.assignAgentToRoom(roomId, agentId);
  }

  @Put('rooms/:roomId/close')
  @UseGuards(JwtAuthGuard)
  async closeRoom(@Param('roomId') roomId: string) {
    return this.chatService.closeRoom(roomId);
  }

  @Get('rooms/:roomId/ai-suggest')
  @UseGuards(JwtAuthGuard)
  async getAiSuggestion(@Param('roomId') roomId: string) {
    return this.chatService.getAiSuggestionForRoom(roomId);
  }
}
