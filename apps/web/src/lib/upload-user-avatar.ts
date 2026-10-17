import { client } from "@kaneo/libs";

export async function uploadUserAvatar(file: File) {
  const request = await client.profile["avatar-upload"].$put({
    json: {
      filename: file.name || "avatar",
      contentType: file.type,
      size: file.size,
    },
  });
  if (!request.ok) {
    throw new Error(await request.text());
  }

  const upload = await request.json();
  const uploaded = await fetch(upload.uploadUrl, {
    method: "PUT",
    headers: upload.headers,
    body: file,
  });
  if (!uploaded.ok) {
    throw new Error("Falha ao enviar a imagem para o armazenamento.");
  }

  const finalize = await client.profile["avatar-upload"].finalize.$post({
    json: { key: upload.key },
  });
  if (!finalize.ok) {
    throw new Error(await finalize.text());
  }

  return finalize.json();
}
