/**
 * Decodifica anexo de texto (trace, log) para string utilizável.
 *
 * O trace do PowerBuilder vem em **UTF-16LE**, não em UTF-8: o
 * `pbtrace-base cliente.log` do SMART-51229 tem BOM `FF FE` e 6,2 MB que, lidos
 * como UTF-8, viram 3,1 milhões de caracteres NUL intercalados no texto. Isso
 * quebrava em dois lugares ao mesmo tempo:
 *
 * 1. **No banco** — `text` e `jsonb` do Postgres não aceitam `\u0000`
 *    (`22P05: unsupported Unicode escape sequence`), então criar o card
 *    respondia 500.
 * 2. **No prompt** — mesmo que o banco aceitasse, o que chegaria ao app_trace e
 *    aos agentes seria lixo com um NUL entre cada letra.
 *
 * O BOM é o sinal confiável e é o caso comum. A heurística sem BOM existe
 * porque nem todo trace traz o marcador, e aí o que denuncia o UTF-16 é o
 * padrão dos bytes zero: em LE eles caem nas posições ímpares, em BE nas pares.
 */

/** Amostra usada na heurística — trace tem megabytes, decidir não precisa deles. */
const SAMPLE_BYTES = 4096;

/**
 * Remove NUL de um texto já decodificado.
 *
 * Última linha de defesa antes do banco: qualquer origem (anexo com codificação
 * exótica, resposta de modelo, colagem do dev) que traga `\u0000` derrubaria a
 * gravação inteira em 500. Perder o NUL não perde informação — ele não é
 * caractere de texto.
 */
export function stripNulls(text: string): string {
  return text.includes('\u0000') ? text.replace(/\u0000/g, '') : text;
}

function looksLikeUtf16(bytes: Buffer): 'le' | 'be' | null {
  const end = Math.min(bytes.length, SAMPLE_BYTES);
  let zerosEmParesImpar = 0; // byte zero em posição ímpar  -> little endian
  let zerosEmParesPar = 0; //  byte zero em posição par    -> big endian

  for (let i = 0; i < end; i++) {
    if (bytes[i] !== 0) continue;
    if (i % 2 === 1) zerosEmParesImpar++;
    else zerosEmParesPar++;
  }

  // Um terço da amostra em bytes zero de um lado só não acontece em texto de
  // 8 bits — mas acontece sempre em UTF-16 de conteúdo ASCII, que é o trace.
  const limite = end / 3;
  if (zerosEmParesImpar > limite && zerosEmParesImpar > zerosEmParesPar) return 'le';
  if (zerosEmParesPar > limite && zerosEmParesPar > zerosEmParesImpar) return 'be';
  return null;
}

/** Node decodifica UTF-16LE nativamente; BE só invertendo os pares antes. */
function decodeUtf16be(bytes: Buffer): string {
  const swapped = Buffer.from(bytes);
  if (swapped.length % 2 !== 0) swapped.subarray(0, swapped.length - 1).swap16();
  else swapped.swap16();
  return swapped.toString('utf16le');
}

export function decodeAttachmentText(bytes: Buffer): string {
  if (bytes.length === 0) return '';

  let decoded: string;

  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    decoded = bytes.subarray(2).toString('utf16le');
  } else if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    decoded = decodeUtf16be(bytes.subarray(2));
  } else if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    decoded = bytes.subarray(3).toString('utf-8');
  } else {
    const semBom = looksLikeUtf16(bytes);
    decoded =
      semBom === 'le'
        ? bytes.toString('utf16le')
        : semBom === 'be'
          ? decodeUtf16be(bytes)
          : bytes.toString('utf-8');
  }

  return stripNulls(decoded.replace(/^\uFEFF/, ''));
}
