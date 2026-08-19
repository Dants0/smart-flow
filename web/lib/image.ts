import type { CardImage } from "./types";

const MAX_IMAGES = 6;
const MAX_BYTES = 5 * 1024 * 1024; // 5MB por imagem

export function fileToCardImage(file: File): Promise<CardImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string; // "data:image/png;base64,AAAA..."
      const data = result.slice(result.indexOf(",") + 1);
      resolve({ name: file.name || "imagem", mediaType: file.type || "image/png", data });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Converte arquivos válidos (imagem, <5MB), respeitando o teto de anexos. */
export async function filesToCardImages(
  files: File[],
  current: CardImage[],
): Promise<{ images: CardImage[]; skipped: number }> {
  const room = Math.max(0, MAX_IMAGES - current.length);
  const valid = files.filter((f) => f.type.startsWith("image/") && f.size <= MAX_BYTES);
  const accepted = valid.slice(0, room);
  const converted = await Promise.all(accepted.map(fileToCardImage));
  return {
    images: [...current, ...converted],
    skipped: files.length - accepted.length,
  };
}

export function cardImageSrc(img: CardImage): string {
  return `data:${img.mediaType};base64,${img.data}`;
}

export { MAX_IMAGES };
