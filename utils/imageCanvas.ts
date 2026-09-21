export interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function loadImage(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = src;
  await new Promise((resolve) => {
    image.onload = resolve;
  });
  return image;
}

export async function cropRotateToBlob(
  imageSource: string,
  cropBox: CropBox,
  rotationDegrees: number,
  sourceElement: HTMLImageElement | null = null
): Promise<Blob> {
  const image = await loadImage(imageSource);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  const scaleX = sourceElement ? image.naturalWidth / sourceElement.width : 1;
  const scaleY = sourceElement ? image.naturalHeight / sourceElement.height : 1;

  const rotRad = (rotationDegrees * Math.PI) / 180;

  const cWidth = cropBox.width * scaleX;
  const cHeight = cropBox.height * scaleY;

  if (rotationDegrees % 180 !== 0) {
    canvas.width = cHeight;
    canvas.height = cWidth;
  } else {
    canvas.width = cWidth;
    canvas.height = cHeight;
  }

  ctx.imageSmoothingQuality = 'high';

  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(rotRad);

  ctx.drawImage(image, cropBox.x * scaleX, cropBox.y * scaleY, cropBox.width * scaleX, cropBox.height * scaleY, -cWidth / 2, -cHeight / 2, cWidth, cHeight);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error('Canvas is empty'));
        else resolve(blob);
      },
      'image/jpeg',
      0.9
    );
  });
}
