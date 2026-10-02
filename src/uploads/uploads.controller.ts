import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Roles } from '../auth/decorators.js';
import { UploadsService } from './uploads.service.js';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Roles('partner')
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
      fileFilter: (_req, file, done) =>
        IMAGE_TYPES.has(file.mimetype)
          ? done(null, true)
          : done(
              new BadRequestException('Загрузите изображение JPG, PNG, WebP или AVIF'),
              false,
            ),
    }),
  )
  async upload(@UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('Файл не передан');
    return { url: await this.uploads.uploadImage(file.buffer) };
  }
}
