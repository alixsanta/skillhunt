import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

// Longueur maximale d'un message (S4) — partagée entre le schéma, le service et le front.
export const MESSAGE_MAX_LENGTH = 2000;

/**
 * Message de chat (SH-24) — persistance MongoDB via Mongoose.
 * Première brique NoSQL réellement branchée de l'architecture (§2/§3 : MongoDB pour le chat).
 *
 * `conversationId` = les DEUX ids participants triés puis joints : identifiant déterministe
 * quel que soit le sens d'envoi, et étanchéité par construction — un tiers ne peut pas
 * "tomber" sur un fil dont il n'est pas participant (C2.2.3).
 */
@Schema({ collection: 'messages', timestamps: { createdAt: true, updatedAt: false } })
export class Message {
  @Prop({ required: true, index: true })
  conversationId!: string;

  @Prop({ required: true })
  senderId!: string;

  @Prop({ required: true, maxlength: MESSAGE_MAX_LENGTH })
  body!: string;

  // Posé automatiquement par l'option `timestamps` de Mongoose
  createdAt!: Date;
}

export type MessageDocument = HydratedDocument<Message>;
export const MessageSchema = SchemaFactory.createForClass(Message);

// Historique : lecture par conversation, du plus récent au plus ancien (limit 50)
MessageSchema.index({ conversationId: 1, createdAt: -1 });
