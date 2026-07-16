import { sendTelegramDocument } from './telegramService';

/**
 * Helper to convert base64 to Blob
 */
export function base64ToBlob(base64Str: string, mimeType: string): Blob {
  const cleanBase64 = base64Str.includes('base64,') 
    ? base64Str.split('base64,')[1] 
    : base64Str;
  
  const binaryStr = atob(cleanBase64);
  const len = binaryStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

/**
 * Uploads a base64 string to Telegram Storage via our secure backend.
 */
export async function uploadBase64ToFirebase(
  base64Str: string,
  path: string,
  mimeType: string
): Promise<{ url: string; error: string | null }> {
  try {
    const fileName = path.split('/').pop() || 'arquivo.dat';
    
    const result = await sendTelegramDocument(base64Str, fileName, mimeType);
    return { url: result.url, error: null };
  } catch (error: any) {
    console.warn('Telegram upload failed, converting to local fallback:', error);
    try {
      const dataUri = base64Str.startsWith('data:') 
        ? base64Str 
        : `data:${mimeType};base64,${base64Str}`;
      
      // Limit to 1MB direct base64 string
      if (dataUri.length <= 1048576) {
        return { 
          url: dataUri, 
          error: `Telegram offline. O arquivo foi salvo diretamente em base64 no banco de dados temporariamente. Por favor, verifique a conexão com seu bot do Telegram.` 
        };
      } else {
        const blob = base64ToBlob(base64Str, mimeType);
        const fallbackUrl = URL.createObjectURL(blob);
        return { 
          url: fallbackUrl, 
          error: `O arquivo é muito grande para o banco de dados e o Telegram falhou. Verifique se o Bot Token e Chat ID do Telegram estão corretos.` 
        };
      }
    } catch (e: any) {
      return { 
        url: '', 
        error: `Erro ao processar arquivo: ${error.message || error}` 
      };
    }
  }
}

/**
 * Uploads a File or Blob directly to Telegram Storage via our secure backend.
 */
export async function uploadFileToFirebase(
  file: File | Blob,
  path: string
): Promise<{ url: string; error: string | null }> {
  try {
    const base64Str = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = err => reject(err);
      reader.readAsDataURL(file);
    });

    const fileName = (file as any).name || path.split('/').pop() || 'arquivo.dat';
    const mimeType = file.type || 'application/octet-stream';

    const result = await sendTelegramDocument(base64Str, fileName, mimeType);
    return { url: result.url, error: null };
  } catch (error: any) {
    console.warn('Telegram upload failed, converting to local fallback:', error);
    try {
      if (file.size <= 750 * 1024) {
        const base64Uri = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = err => reject(err);
          reader.readAsDataURL(file);
        });
        return { 
          url: base64Uri, 
          error: `Telegram offline. O arquivo foi salvo diretamente em base64 no banco de dados temporariamente. Por favor, verifique a conexão com seu bot do Telegram.` 
        };
      } else {
        const fallbackUrl = URL.createObjectURL(file);
        return { 
          url: fallbackUrl, 
          error: `O arquivo é muito grande para o banco de dados e o Telegram falhou. Verifique se o Bot Token e Chat ID do Telegram estão corretos.` 
        };
      }
    } catch (e: any) {
      return { 
        url: '', 
        error: `Erro ao processar arquivo: ${error.message || error}` 
      };
    }
  }
}
