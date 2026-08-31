import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Media } from './media.entity';
import { MediaService } from './media.service';
import { MediaController } from './media.controller';
import { MediaQueue } from './media.queue';
import { MediaTranscodeListener } from './media.listener';
import { MediaSweeper } from './media.sweeper';
import { StorageModule } from '../storage/storage.module';

/** Module média (EP04). Le stockage objet est injecté par son port, jamais construit ici. */
@Module({
  imports: [TypeOrmModule.forFeature([Media]), StorageModule],
  controllers: [MediaController],
  providers: [MediaService, MediaQueue, MediaTranscodeListener, MediaSweeper],
  exports: [MediaService, MediaQueue],
})
export class MediaModule {}
