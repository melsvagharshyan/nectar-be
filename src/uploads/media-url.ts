/** Only photos uploaded through `POST /uploads*` (Cloudinary delivery URLs). */
export const MEDIA_URL = /^https:\/\/res\.cloudinary\.com\/[\w-]+\/image\/upload\/\S+$/;
