import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';
import { app } from './firebase';
import type { ReportPhoto } from '../types';

/**
 * Photos taken in the web app (the Count page), stored like the WhatsApp bot stores report photos: three sizes made
 * on the phone before uploading (1600px full, 900px for pages, 320px thumbnail), so a 4 MB camera photo becomes a
 * few hundred KB and uploads on a weak signal. Loaded only with the page that takes photos.
 *
 *   count-photos/{tree}/{name}.jpg, count-photos/{tree}/medium/{name}.jpg, count-photos/{tree}/thumbs/{name}.jpg
 */

const storage = getStorage(app);
storage.maxUploadRetryTime = 60000;
storage.maxOperationRetryTime = 20000;

export type UploadedPhoto = ReportPhoto & { path: string };

async function decode(file: Blob): Promise<{ img: CanvasImageSource; w: number; h: number; done: () => void }> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return { img: bmp, w: bmp.width, h: bmp.height, done: () => bmp.close() };
  } catch {
    // Older Safari: decode through an <img>.
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    await img.decode();
    return { img, w: img.naturalWidth, h: img.naturalHeight, done: () => URL.revokeObjectURL(url) };
  }
}

function toJpeg(src: { img: CanvasImageSource; w: number; h: number }, max: number, quality: number): Promise<Blob> {
  const scale = Math.min(1, max / Math.max(src.w, src.h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(src.w * scale));
  canvas.height = Math.max(1, Math.round(src.h * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('No canvas'));
  ctx.drawImage(src.img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the photo'))), 'image/jpeg', quality));
}

async function put(path: string, blob: Blob): Promise<string> {
  const r = ref(storage, path);
  await uploadBytes(r, blob, { contentType: 'image/jpeg', cacheControl: 'public, max-age=31536000' });
  return getDownloadURL(r);
}

/** Shrinks and uploads one photo of a tree. `name` is unique per photo (no extension). */
export async function uploadTreePhoto(file: File, treeId: string, name: string): Promise<UploadedPhoto> {
  const src = await decode(file);
  let blobs: Blob[];
  try {
    blobs = await Promise.all([toJpeg(src, 1600, 0.82), toJpeg(src, 900, 0.8), toJpeg(src, 320, 0.7)]);
  } finally {
    src.done();
  }
  const dir = `count-photos/${treeId}`;
  const path = `${dir}/${name}.jpg`;
  const [url, medium, thumb] = await Promise.all([put(path, blobs[0]), put(`${dir}/medium/${name}.jpg`, blobs[1]), put(`${dir}/thumbs/${name}.jpg`, blobs[2])]);
  return { path, url, medium, thumb };
}
