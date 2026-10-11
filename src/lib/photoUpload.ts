import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';
import { app } from './firebase';
import { PHOTO_CACHE_CONTROL, PHOTO_SIZES } from '../shared';
import type { ReportPhoto } from '../types';

/**
 * Photos taken in the web app (the Count sheet), stored exactly like the WhatsApp bot stores report photos
 * (shared/photos.ts): the photo at most 1600px, a 900px copy and a 320px square thumbnail, JPEG, made on the phone
 * before uploading, so a 4 MB camera photo becomes a few hundred KB and uploads on a weak signal. Loaded only with
 * the page that takes photos.
 *
 *   count-photos/{tree}/{name}.jpg, count-photos/{tree}/medium/{name}.jpg, count-photos/{tree}/thumbs/{name}.jpg
 */

const storage = getStorage(app);
storage.maxUploadRetryTime = 60000;
storage.maxOperationRetryTime = 20000;

export type UploadedPhoto = ReportPhoto & { path: string };

interface Decoded {
  img: CanvasImageSource;
  w: number;
  h: number;
  done: () => void;
}

/** The photo as the camera meant it to be seen (its recorded orientation applied, like sharp's rotate()). */
async function decode(file: Blob): Promise<Decoded> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return { img: bmp, w: bmp.width, h: bmp.height, done: () => bmp.close() };
  } catch {
    // Older Safari: decode through an <img> (which applies the orientation too).
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    await img.decode();
    return { img, w: img.naturalWidth, h: img.naturalHeight, done: () => URL.revokeObjectURL(url) };
  }
}

function encode(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the photo'))), 'image/jpeg', quality / 100));
}

/** At most `max` on the long side, never enlarged (sharp: fit 'inside', withoutEnlargement). */
function fitInside(src: Decoded, max: number, quality: number): Promise<Blob> {
  const scale = Math.min(1, max / Math.max(src.w, src.h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(src.w * scale));
  canvas.height = Math.max(1, Math.round(src.h * scale));
  canvas.getContext('2d')!.drawImage(src.img, 0, 0, canvas.width, canvas.height);
  return encode(canvas, quality);
}

/** A square of `side`, cut from the middle (sharp: fit 'cover'). */
function cover(src: Decoded, side: number, quality: number): Promise<Blob> {
  const cut = Math.min(src.w, src.h);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = side;
  canvas.getContext('2d')!.drawImage(src.img, (src.w - cut) / 2, (src.h - cut) / 2, cut, cut, 0, 0, side, side);
  return encode(canvas, quality);
}

async function put(path: string, blob: Blob): Promise<string> {
  const r = ref(storage, path);
  await uploadBytes(r, blob, { contentType: 'image/jpeg', cacheControl: PHOTO_CACHE_CONTROL });
  return getDownloadURL(r);
}

/** Shrinks and uploads one photo of a tree. `name` is unique per photo (no extension). */
export async function uploadTreePhoto(file: File, treeId: string, name: string): Promise<UploadedPhoto> {
  const src = await decode(file);
  let blobs: Blob[];
  try {
    const { full, medium, thumb } = PHOTO_SIZES;
    blobs = await Promise.all([fitInside(src, full.max, full.quality), fitInside(src, medium.max, medium.quality), cover(src, thumb.square, thumb.quality)]);
  } finally {
    src.done();
  }
  const dir = `count-photos/${treeId}`;
  const path = `${dir}/${name}.jpg`;
  const [url, medium, thumb] = await Promise.all([put(path, blobs[0]), put(`${dir}/medium/${name}.jpg`, blobs[1]), put(`${dir}/thumbs/${name}.jpg`, blobs[2])]);
  return { path, url, medium, thumb };
}
