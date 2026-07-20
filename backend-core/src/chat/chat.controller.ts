import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { ChatMessageDto, ConversationSummaryDto } from './dto/chat-response.dto';
import { CurrentUser, JwtAuthGuard, JwtPayload } from '../auth/guards/jwt-auth.guard';

/**
 * Volet REST du chat (SH-24) : liste des conversations et historique d'un fil.
 * Le temps réel (envoi/réception) passe par la ChatGateway WebSocket ; ici on ne fait
 * que LIRE, et toujours au nom de l'identité portée par le token (C2.2.3).
 */
@ApiTags('💬 Chat contextuel')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token JWT manquant, invalide ou expiré (401)' })
@UseGuards(JwtAuthGuard)
@Controller('api/v1/chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('conversations')
  @ApiOperation({ summary: 'Lister ses conversations (interlocuteur + dernier message)' })
  @ApiOkResponse({ type: [ConversationSummaryDto], description: 'Conversations du compte connecté, la plus récente d\'abord' })
  getConversations(@CurrentUser() user: JwtPayload) {
    return this.chatService.conversations({ userId: user.userId, role: user.role });
  }

  @Get('with/:userId')
  @ApiOperation({ summary: 'Historique du fil avec un utilisateur (50 derniers messages)' })
  @ApiOkResponse({ type: [ChatMessageDto], description: 'Messages en ordre chronologique' })
  @ApiForbiddenResponse({ description: 'La paire n\'est pas RECRUITER↔FREELANCE (403)' })
  @ApiNotFoundResponse({ description: 'Interlocuteur introuvable (404)' })
  getHistory(
    @CurrentUser() user: JwtPayload,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    // L'identité du lecteur vient du token : impossible de lire le fil d'autrui (S3)
    return this.chatService.history({ userId: user.userId, role: user.role }, userId);
  }
}
