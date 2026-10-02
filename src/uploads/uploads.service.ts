import {
  BadGatewayException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import type { Env } from '../config/env.js';

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);
  private readonly folder: string;

  constructor(config: ConfigService<Env, true>) {
    const url = new URL(config.get('CLOUDINARY_URL'));
    cloudinary.config({
      cloud_name: url.hostname,
      api_key: decodeURIComponent(url.username),
      api_secret: decodeURIComponent(url.password),
      secure: true,
    });
    this.folder = config.get('CLOUDINARY_FOLDER');
  }

  /** Uploads an image buffer and returns its HTTPS delivery URL. */
  async uploadImage(buffer: Buffer): Promise<string> {
    try {
      const result = await new Promise<UploadApiResponse>((resolve, reject) => {
        cloudinary.uploader
          .upload_stream(
            { folder: this.folder, resource_type: 'image' },
            (error, response) =>
              error || !response ? reject(error ?? new Error('Empty response')) : resolve(response),
          )
          .end(buffer);
      });
      return result.secure_url;
    } catch (error) {
      this.logger.error('Cloudinary upload failed', error instanceof Error ? error.stack : error);
      throw new BadGatewayException('Не удалось загрузить фото, попробуйте ещё раз');
    }
  }
}
