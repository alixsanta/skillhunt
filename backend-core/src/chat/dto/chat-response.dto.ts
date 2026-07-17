import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../../common/enums';
import { MESSAGE_MAX_LENGTH } from '../message.schema';

/** Message de chat tel qu'exposé par l'API (REST et WS) — documentation Swagger (C2.4.1). */
export class ChatMessageDto {
  @ApiProperty({ example: '66a1f0c2e4b0a1b2c3d4e5f6', description: 'Identifiant MongoDB du message' })
  id!: string;

  @ApiProperty({
    example: '3f6e…-a1b2:9c8d…-e4f5',
    description: 'Identifiant de conversation (les deux ids participants triés, joints par ":")',
  })
  conversationId!: string;

  @ApiProperty({ format: 'uuid', description: "Auteur du message (toujours l'un des deux participants)" })
  senderId!: string;

  @ApiProperty({ maxLength: MESSAGE_MAX_LENGTH, example: 'Bonjour, votre profil correspond à notre mission.' })
  body!: string;

  @ApiProperty({ type: Date })
  createdAt!: Date;
}

/** Interlocuteur d'une conversation (données publiques uniquement). */
export class ConversationPeerDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'jean-telepilote' })
  username!: string;

  @ApiProperty({ enum: UserRole, example: UserRole.FREELANCE })
  role!: UserRole;
}

/** Résumé d'une conversation pour la liste `/messages` (S5). */
export class ConversationSummaryDto {
  @ApiProperty({ example: '3f6e…-a1b2:9c8d…-e4f5' })
  conversationId!: string;

  @ApiProperty({ type: ConversationPeerDto })
  with!: ConversationPeerDto;

  @ApiProperty({ type: ChatMessageDto, description: 'Dernier message échangé' })
  lastMessage!: ChatMessageDto;
}
