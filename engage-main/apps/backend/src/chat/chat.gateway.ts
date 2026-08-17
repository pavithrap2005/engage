import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(private chatService: ChatService) {}

  handleConnection(client: Socket) {
    console.log(`Socket connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Socket disconnected: ${client.id}`);
  }

  @SubscribeMessage('visitorInit')
  async handleVisitorInit(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { workspaceId: string; visitorId: string }
  ) {
    const { workspaceId, visitorId } = data;
    try {
      const room = await this.chatService.getOrCreateRoomForVisitor(workspaceId, visitorId);

      // Join the socket room immediately
      client.join(room.id);

      // Inform client of successfully joined room
      client.emit('visitorInitSuccess', { room });

      // Broadcast to workspace admins that a new room is in queue
      this.server.emit(`workspace-${workspaceId}-roomUpdate`, room);

      return { status: 'success', roomId: room.id };
    } catch (err: any) {
      client.emit('error', { message: err.message || 'Initialization failed' });
    }
  }

  @SubscribeMessage('joinRoom')
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string }
  ) {
    client.join(data.roomId);
    console.log(`Socket ${client.id} joined room ${data.roomId}`);
    return { status: 'success' };
  }

  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; senderType: string; senderId: string; content: string }
  ) {
    const { roomId, senderType, senderId, content } = data;
    try {
      const savedMsg = await this.chatService.saveMessage(roomId, senderType, senderId, content);

      // Broadcast message to everyone inside the room (both visitor and agent)
      this.server.to(roomId).emit('message', savedMsg);

      // Trigger custom workspace broadcasts to update the admin console room lists
      const room = await this.chatService.getRoomById(roomId);
      if (room) {
        this.server.emit(`workspace-${room.workspaceId}-roomUpdate`, room);

        // If the sender is a visitor and no agent is assigned, trigger chatbot responder
        if (senderType === 'VISITOR' && !room.assignedAgentId) {
          // Emit bot typing indicator
          this.server.to(roomId).emit('typing', { isTyping: true, senderName: 'Indiquer AI Bot' });

          setTimeout(async () => {
            try {
              const botMsg = await this.chatService.triggerBotResponse(roomId, room.workspaceId, content);

              // Broadcast bot response
              this.server.to(roomId).emit('message', botMsg);

              // Turn off typing state
              this.server.to(roomId).emit('typing', { isTyping: false, senderName: '' });

              // Update admin room listing
              const updatedRoom = await this.chatService.getRoomById(roomId);
              if (updatedRoom) {
                this.server.emit(`workspace-${updatedRoom.workspaceId}-roomUpdate`, updatedRoom);
              }
            } catch (e) {
              console.error('Bot auto-response failed:', e);
            }
          }, 1000);
        }
      }

      return { status: 'success' };
    } catch (err: any) {
      client.emit('error', { message: err.message || 'Message dispatch failed' });
    }
  }

  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; isTyping: boolean; senderName: string }
  ) {
    const { roomId, isTyping, senderName } = data;
    // Broadcast typing state to other users in the room
    client.to(roomId).emit('typing', { isTyping, senderName });
  }

  @SubscribeMessage('submitCsat')
  async handleSubmitCsat(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; rating: number; feedback?: string }
  ) {
    const { roomId, rating, feedback } = data;
    try {
      const room = await this.chatService.submitCsat(roomId, rating, feedback);
      this.server.emit(`workspace-${room.workspaceId}-roomUpdate`, room);
      this.server.to(roomId).emit('roomStatusChange', { status: 'CLOSED', rating, feedback });
      return { status: 'success' };
    } catch (err: any) {
      client.emit('error', { message: err.message || 'Failed to submit rating' });
    }
  }
}
