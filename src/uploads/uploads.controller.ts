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
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

const imageInterceptor = (maxBytes: number) =>
  FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: maxBytes, files: 1 },
    fileFilter: (_req, file, done) =>
      IMAGE_TYPES.has(file.mimetype)
        ? done(null, true)
        : done(
            new BadRequestException('Загрузите изображение JPG, PNG, WebP или AVIF'),
            false,
          ),
  });

function requireFile(file: Express.Multer.File | undefined): Express.Multer.File {
  if (!file) throw new BadRequestException('Файл не передан');
  return file;
}

@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Roles('partner')
  @Post()
  @UseInterceptors(imageInterceptor(MAX_IMAGE_BYTES))
  async upload(@UploadedFile() file: Express.Multer.File | undefined) {
    return { url: await this.uploads.uploadImage(requireFile(file).buffer) };
  }

  @Post('avatar')
  @UseInterceptors(imageInterceptor(MAX_AVATAR_BYTES))
  async uploadAvatar(@UploadedFile() file: Express.Multer.File | undefined) {
    return { url: await this.uploads.uploadAvatar(requireFile(file).buffer) };
  }
}
