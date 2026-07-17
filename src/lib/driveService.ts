// src/lib/driveService.ts
// Funções server-side para integração com o Google Drive.
// NÃO importar este arquivo em componentes React (só roda no backend).

export async function getOrCreateDriveFolder(accessToken: string, folderName: string): Promise<string> {
  if (accessToken === 'mock_google_access_token_cbc_123' || accessToken.startsWith('mock_')) {
    console.log('[Google Drive Mock] Usando token mock. Simulando getOrCreateDriveFolder.');
    return 'mock_google_drive_folder_id_123';
  }

  const query = encodeURIComponent(`name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`;

  const searchRes = await fetch(searchUrl, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!searchRes.ok) {
    throw new Error(`Erro ao buscar pasta no Google Drive: ${await searchRes.text()}`);
  }

  const searchData: any = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ name: folderName, mimeType: "application/vnd.google-apps.folder" })
  });

  if (!createRes.ok) {
    throw new Error(`Erro ao criar pasta no Google Drive: ${await createRes.text()}`);
  }

  const createData: any = await createRes.json();
  return createData.id;
}

export async function uploadFileToDriveFolder(
  accessToken: string,
  folderId: string,
  fileName: string,
  mimeType: string,
  fileBase64: string
): Promise<{ id: string; webViewLink: string }> {
  if (accessToken === 'mock_google_access_token_cbc_123' || accessToken.startsWith('mock_')) {
    console.log('[Google Drive Mock] Usando token mock. Simulando uploadFileToDriveFolder.');
    return {
      id: `mock_file_${Math.random().toString(36).substring(2, 11)}`,
      webViewLink: 'https://drive.google.com/drive/folders/mock_google_drive_folder_id_123',
    };
  }

  const boundary = "------cbc_drive_upload_boundary------";
  const metadata = JSON.stringify({ name: fileName, parents: [folderId] });
  const fileBuffer = Buffer.from(fileBase64, 'base64');

  const metadataPart = Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`);
  const mediaPartHeader = Buffer.from(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`);
  const mediaPartFooter = Buffer.from(`\r\n--${boundary}--`);

  const bodyBuffer = Buffer.concat([metadataPart, mediaPartHeader, fileBuffer, mediaPartFooter]);

  const uploadResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
      'Content-Length': bodyBuffer.length.toString()
    },
    body: bodyBuffer
  });

  if (!uploadResponse.ok) {
    throw new Error(`Erro ao fazer upload do arquivo para o Google Drive: ${await uploadResponse.text()}`);
  }

  return await uploadResponse.json() as { id: string; webViewLink: string };
}

// Nomes de pastas padronizados por tipo de documento no escritório
export const DRIVE_FOLDERS = {
  cronograma: "Cronogramas - CBC",
  materiais: "Listas de Materiais - CBC",
  notasFiscais: "Notas Fiscais e Faturas - CBC",
  extratos: "Extratos e Lançamentos - CBC",
  cotacoes: "Cotações e Pedidos de Material - CBC",
  comprovantes: "Comprovantes de Pagamento - CBC",
} as const;

/**
 * DESATIVADO: a integração com o Google Drive está desligada — o armazenamento é feito
 * exclusivamente via Telegram. Esta função é mantida apenas para compatibilidade de assinatura
 * com os endpoints que ainda a chamam (não remover os parâmetros, mesmo sem uso).
 *
 * Retorna SEMPRE { driveFile: null, driveError: null }, de forma consistente, para que a
 * extração por IA continue funcionando normalmente sem Drive conectado.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function saveDocumentToDrive(
  accessToken: string | undefined,
  folderName: string,
  fileName: string,
  mimeType: string,
  fileBase64: string
): Promise<{ driveFile: { id: string; webViewLink: string } | null; driveError: string | null }> {
  // Google Drive desativado — armazenamento exclusivo via Telegram. Retorno consistente e neutro.
  return { driveFile: null, driveError: null };
}
