import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { HTTPException } from "hono/http-exception";
import {
  allowedTypes,
  extensions,
  matchesSignature,
  uploadRoot,
} from "../../finance/attachments";

// Documento escaneado passa fácil dos 10 MB dos comprovantes.
export const MAX_CRM_FILE_BYTES = 20 * 1024 * 1024;

/** Valida (PDF ou imagem, até 20 MB, conteúdo coerente com o tipo) e grava no
 * volume de uploads. Devolve o que a tabela precisa guardar. */
export async function storeCrmFile(input: {
  workspaceId: string;
  folder: string;
  file: File;
}) {
  const type = input.file.type.toLowerCase();
  if (!allowedTypes.has(type))
    throw new HTTPException(400, {
      message: "Envie um PDF ou uma imagem.",
    });
  if (input.file.size === 0 || input.file.size > MAX_CRM_FILE_BYTES)
    throw new HTTPException(400, { message: "O arquivo deve ter até 20 MB." });
  const bytes = Buffer.from(await input.file.arrayBuffer());
  if (!matchesSignature(type, bytes))
    throw new HTTPException(400, {
      message: "O conteúdo do arquivo não corresponde ao tipo informado.",
    });

  const storageKey = `${input.folder}/${input.workspaceId}/${randomUUID()}.${extensions[type]}`;
  const target = path.resolve(uploadRoot(), storageKey);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
  const filename =
    input.file.name
      .replace(/[\r\n"\\/]/g, "")
      .trim()
      .slice(0, 200) || `arquivo.${extensions[type]}`;
  return { storageKey, filename, contentType: type, sizeBytes: bytes.length };
}

function resolveKey(storageKey: string) {
  const root = uploadRoot();
  const target = path.resolve(root, storageKey);
  if (!target.startsWith(`${root}${path.sep}`))
    throw new HTTPException(400, { message: "Arquivo inválido." });
  return target;
}

export async function readCrmFile(storageKey: string) {
  try {
    return await readFile(resolveKey(storageKey));
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(404, {
      message: "O arquivo não está mais no servidor.",
    });
  }
}

export async function removeCrmFile(storageKey: string) {
  await rm(resolveKey(storageKey), { force: true });
}
