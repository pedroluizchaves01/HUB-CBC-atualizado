import { getAccessToken } from './firebaseAuth';

export async function findOrCreateFolder(accessToken: string, folderName: string): Promise<string> {
  if (accessToken === 'mock_google_access_token_cbc_123' || accessToken.startsWith('mock_')) {
    console.log('[Google Drive Mock] Mocking findOrCreateFolder for folder:', folderName);
    return 'mock_folder_id_123';
  }

  const query = encodeURIComponent(`name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`;
  
  const searchRes = await fetch(searchUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  
  if (!searchRes.ok) {
    const errText = await searchRes.text();
    throw new Error(`Erro ao buscar pasta no Google Drive: ${errText}`);
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
    body: JSON.stringify({
      name: folderName,
      mimeType: "application/vnd.google-apps.folder"
    })
  });
  
  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Erro ao criar pasta no Google Drive: ${errText}`);
  }
  
  const createData: any = await createRes.json();
  return createData.id;
}

export async function uploadFileToFolder(
  accessToken: string,
  folderId: string,
  fileName: string,
  mimeType: string,
  fileBase64: string
): Promise<{ id: string; webViewLink: string }> {
  if (accessToken === 'mock_google_access_token_cbc_123' || accessToken.startsWith('mock_')) {
    console.log('[Google Drive Mock] Mocking uploadFileToFolder:', fileName);
    return {
      id: `mock_file_${Math.random().toString(36).substring(2, 11)}`,
      webViewLink: 'https://drive.google.com/drive/folders/mock_folder_id_123'
    };
  }

  const boundary = "------cbc_client_boundary_------";
  const metadata = JSON.stringify({
    name: fileName,
    parents: [folderId]
  });
  
  const metadataPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`;
  const mediaPartHeader = `--${boundary}\r\nContent-Type: ${mimeType}\r\nContent-Transfer-Encoding: base64\r\n\r\n${fileBase64}\r\n`;
  const mediaPartFooter = `--${boundary}--`;
  
  const body = metadataPart + mediaPartHeader + mediaPartFooter;
  
  const uploadResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body: body
  });
  
  if (!uploadResponse.ok) {
    const errText = await uploadResponse.text();
    throw new Error(`Erro ao fazer upload para o Google Drive: ${errText}`);
  }
  
  return await uploadResponse.json() as { id: string; webViewLink: string };
}
