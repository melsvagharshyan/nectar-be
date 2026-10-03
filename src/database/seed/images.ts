import { v2 as cloudinary } from 'cloudinary';

const unsplash = (id: string) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1600&q=80`;

/** Curated Unsplash photos; uploaded once to Cloudinary under stable public ids. */
export const PHOTOS = {
  livingBright: '1502672260266-1c1ef2d93688',
  livingSofa: '1560448204-e02f11c3d0e2',
  livingCozy: '1522708323590-d24dbb6b0267',
  livingLoft: '1600607687939-ce8a6c25118c',
  livingModern: '1600210492486-724fe5c67fb0',
  livingWarm: '1493809842364-78817add7ffb',
  livingGreen: '1586023492125-27b2c045efd7',
  livingMinimal: '1600573472550-8090b5e0745e',
  livingClassic: '1616594039964-ae9021a400a0',
  livingWindow: '1554995207-c18c203602cb',
  livingLuxury: '1600607687644-c7171b42498f',
  kitchenWhite: '1484154218962-a197022b5858',
  kitchenWood: '1556909114-f6e7ad7d3136',
  kitchenOpen: '1600566753190-17f0baa2a6c3',
  kitchenIsland: '1600566752355-35792bedcfea',
  bedroomLight: '1505691938895-1758d7feb511',
  bedroomHotel: '1631049307264-da0ec9d70304',
  bedroomSoft: '1615874959474-d609969a20ed',
  studio: '1502005229762-cf1b2da7c5d6',
  houseModern: '1600596542815-ffad4c1539a9',
  houseGarden: '1600585154340-be6161a56a0c',
  housePool: '1512917774080-9991f1c4c750',
  villa: '1613490493576-7fde63acd811',
  houseStone: '1600047509807-ba8f99d2cdde',
  houseEvening: '1600585154526-990dced4db0d',
  houseFamily: '1564013799919-ab600027ffc6',
  houseClassic: '1570129477492-45c003edd2be',
  houseWhite: '1580587771525-78b9dba3b914',
  building: '1545324418-cc1a3fa10c00',
  officeOpen: '1497366216548-37526070297c',
  officeMeeting: '1497366811353-6870744d04b2',
} as const;

export const PORTRAITS = {
  womanCurly: '1494790108377-be9c29b29330',
  womanSmile: '1438761681033-6461ffad8d80',
  womanBlonde: '1544005313-94ddf0286df2',
  womanDark: '1534528741775-53994a69daeb',
  manBeard: '1507003211169-0a1dd7228f2d',
  manSuit: '1500648767791-00dcc994a43e',
  manSmile: '1472099645785-5658abf4ff4e',
  manCasual: '1506794778202-cad84cf45f1d',
} as const;

export type PhotoKey = keyof typeof PHOTOS;
export type PortraitKey = keyof typeof PORTRAITS;

export function configureCloudinary(cloudinaryUrl: string) {
  const url = new URL(cloudinaryUrl);
  cloudinary.config({
    cloud_name: url.hostname,
    api_key: decodeURIComponent(url.username),
    api_secret: decodeURIComponent(url.password),
    secure: true,
  });
}

/** Uploads every photo (skipping ones already on Cloudinary) and returns key → delivery URL. */
export async function uploadSeedImages(folder: string) {
  const upload = async (publicId: string, source: string, square: boolean) => {
    const result = await cloudinary.uploader.upload(source, {
      public_id: publicId,
      folder,
      overwrite: false,
      resource_type: 'image',
      transformation: square
        ? [{ width: 512, height: 512, crop: 'fill', gravity: 'face' }, { quality: 'auto' }]
        : [{ width: 1600, crop: 'limit' }, { quality: 'auto' }],
    });
    return result.secure_url;
  };

  const photoEntries = await Promise.all(
    Object.entries(PHOTOS).map(
      async ([key, id]) => [key, await upload(`property-${key}`, unsplash(id), false)] as const,
    ),
  );
  const portraitEntries = await Promise.all(
    Object.entries(PORTRAITS).map(
      async ([key, id]) => [key, await upload(`avatar-${key}`, unsplash(id), true)] as const,
    ),
  );
  return {
    photo: Object.fromEntries(photoEntries) as Record<PhotoKey, string>,
    portrait: Object.fromEntries(portraitEntries) as Record<PortraitKey, string>,
  };
}
