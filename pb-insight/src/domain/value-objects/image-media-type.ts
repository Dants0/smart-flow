/** Tipos de imagem aceitos como evidência visual no diagnóstico — mesmo conjunto suportado pelas APIs de visão da Anthropic e da OpenAI. */
export const ALLOWED_IMAGE_MEDIA_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;

export type ImageMediaType = (typeof ALLOWED_IMAGE_MEDIA_TYPES)[number];

export function isValidImageMediaType(value: string): value is ImageMediaType {
  return (ALLOWED_IMAGE_MEDIA_TYPES as readonly string[]).includes(value);
}
