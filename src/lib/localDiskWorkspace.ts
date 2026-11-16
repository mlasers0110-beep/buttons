import {
  FrontendImageRegion,
  GeneratedCompleteElement,
  LocalDiskWorkspaceConfig,
  WorkingFrontendImageState,
} from '../types/studio';

// Minimal Web File System Access API typings so TypeScript 7 compiles cleanly without DOM lib conflicts
interface FsWritableFileStream {
  write: (data: string | Blob | Uint8Array) => Promise<void>;
  close: () => Promise<void>;
}

interface FsFileHandle {
  kind: 'file';
  name: string;
  createWritable: () => Promise<FsWritableFileStream>;
}

export interface FsDirectoryHandle {
  kind: 'directory';
  name: string;
  getDirectoryHandle: (
    name: string,
    options?: { create?: boolean }
  ) => Promise<FsDirectoryHandle>;
  getFileHandle: (
    name: string,
    options?: { create?: boolean }
  ) => Promise<FsFileHandle>;
}

declare global {
  interface Window {
    showDirectoryPicker?: (options?: {
      id?: string;
      mode?: 'read' | 'readwrite';
      startIn?: 'desktop' | 'documents' | 'downloads';
    }) => Promise<FsDirectoryHandle>;
  }
}

export const DEFAULT_LOCAL_DISK_CONFIG: LocalDiskWorkspaceConfig = {
  directoryName: '',
  subFolderName: 'aether-frontend-workspace',
  accessMode: 'unconfigured',
  autoSaveOnChange: true,
  saveImagesAndTsx: true,
  lastSavedAt: null,
  savedFilesCount: 0,
};

let activeDirectoryHandle: FsDirectoryHandle | null = null;

export function getActiveLocalDirectoryHandle(): FsDirectoryHandle | null {
  return activeDirectoryHandle;
}

export function setActiveLocalDirectoryHandle(handle: FsDirectoryHandle | null): void {
  activeDirectoryHandle = handle;
}

export function isNativeDirectoryPickerAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

export async function pickLocalDiskDirectory(preferredSubFolder: string): Promise<{
  ok: boolean;
  fallbackRequired?: boolean;
  directoryName?: string;
  errorMessage?: string;
}> {
  if (!isNativeDirectoryPickerAvailable() || !window.showDirectoryPicker) {
    return {
      ok: false,
      fallbackRequired: true,
      errorMessage:
        'Przeglądarka nie udostępnia bezpośredniego wyboru katalogu (showDirectoryPicker) — użyj trybu powiązanego katalogu lokalnego poniżej.',
    };
  }

  try {
    const dirHandle = await window.showDirectoryPicker({
      id: 'aether_studio_workspace',
      mode: 'readwrite',
      startIn: 'documents',
    });
    activeDirectoryHandle = dirHandle;

    if (preferredSubFolder.trim()) {
      try {
        await dirHandle.getDirectoryHandle(preferredSubFolder.trim(), { create: true });
      } catch {
        // Root handle still valid even if subfolder creation was skipped
      }
    }

    return {
      ok: true,
      directoryName: dirHandle.name,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const name = err instanceof Error ? err.name : '';
    if (name === 'AbortError') {
      return { ok: false, errorMessage: 'Anulowano wybór folderu na dysku.' };
    }
    // SecurityError happens inside cross-origin preview iframes
    return {
      ok: false,
      fallbackRequired: true,
      errorMessage:
        name === 'SecurityError' || msg.toLowerCase().includes('sub frame') || msg.toLowerCase().includes('cross origin')
          ? 'Podgląd osadzony w ramce iframe blokuje natywne okno systemowe — wybierz folder przyciskiem powiązania katalogu obok lub zapisz pakiet bezpośrednio na dysk.'
          : `Nie udało się otworzyć folderu bezpośrednio (${msg}). Użyj trybu zapisu lokalnego poniżej.`,
    };
  }
}

function dataUrlToBlob(dataUrl: string): { blob: Blob; ext: string } | null {
  try {
    const commaIdx = dataUrl.indexOf(',');
    if (commaIdx === -1) return null;
    const header = dataUrl.slice(0, commaIdx);
    const base64 = dataUrl.slice(commaIdx + 1);
    const mimeMatch = header.match(/data:([^;]+)/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/png';
    const ext = mime.includes('jpeg') || mime.includes('jpg')
      ? 'jpg'
      : mime.includes('webp')
        ? 'webp'
        : 'png';

    const binary = atob(base64);
    const buffer = new ArrayBuffer(binary.length);
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return { blob: new Blob([buffer], { type: mime }), ext };
  } catch {
    return null;
  }
}

export async function writeWorkspaceFilesToLocalDisk(params: {
  config: LocalDiskWorkspaceConfig;
  workspaceStateJson: string;
  readmeMarkdown: string;
  workingImage: WorkingFrontendImageState | null;
  generatedElements: GeneratedCompleteElement[];
  forceBrowserDownloadFallback?: boolean;
}): Promise<{
  ok: boolean;
  filesWritten: number;
  savedVia: 'fs-handle' | 'browser-download';
  savedAtLabel: string;
  message: string;
}> {
  const nowLabel = new Date().toLocaleTimeString('pl-PL', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  if (activeDirectoryHandle && !params.forceBrowserDownloadFallback) {
    try {
      let targetDir = activeDirectoryHandle;
      if (params.config.subFolderName.trim()) {
        targetDir = await activeDirectoryHandle.getDirectoryHandle(
          params.config.subFolderName.trim(),
          { create: true }
        );
      }

      let count = 0;

      // 1. Write full project JSON
      const stateHandle = await targetDir.getFileHandle('aether-workspace-state.json', {
        create: true,
      });
      const stateStream = await stateHandle.createWritable();
      await stateStream.write(params.workspaceStateJson);
      await stateStream.close();
      count++;

      // 2. Write GitHub README.md
      const readmeHandle = await targetDir.getFileHandle('README.md', { create: true });
      const readmeStream = await readmeHandle.createWritable();
      await readmeStream.write(params.readmeMarkdown);
      await readmeStream.close();
      count++;

      // 3. Write uploaded frontend reference image + regions JSON
      if (params.config.saveImagesAndTsx && params.workingImage) {
        const converted = dataUrlToBlob(params.workingImage.dataUrl);
        if (converted) {
          const imgHandle = await targetDir.getFileHandle(
            `obraz-frontendu.${converted.ext}`,
            { create: true }
          );
          const imgStream = await imgHandle.createWritable();
          await imgStream.write(converted.blob);
          await imgStream.close();
          count++;
        }

        const regionsHandle = await targetDir.getFileHandle(
          'regiony-odcieni-frontendu.json',
          { create: true }
        );
        const regionsStream = await regionsHandle.createWritable();
        await regionsStream.write(
          JSON.stringify(params.workingImage.regions, null, 2)
        );
        await regionsStream.close();
        count++;
      }

      // 4. Write generated complete UI elements (.tsx)
      if (params.config.saveImagesAndTsx && params.generatedElements.length > 0) {
        const compDir = await targetDir.getDirectoryHandle('components', {
          create: true,
        });
        for (const el of params.generatedElements) {
          const safeFile = el.fileName.endsWith('.tsx')
            ? el.fileName
            : `${el.fileName}.tsx`;
          const elHandle = await compDir.getFileHandle(safeFile, { create: true });
          const elStream = await elHandle.createWritable();
          await elStream.write(el.reactTailwindCode);
          await elStream.close();
          count++;
        }
      }

      return {
        ok: true,
        filesWritten: count,
        savedVia: 'fs-handle',
        savedAtLabel: nowLabel,
        message: `Zapisano ${count} plików bezpośrednio na dysku lokalnym w katalogu „${activeDirectoryHandle.name}/${params.config.subFolderName}”.`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!params.forceBrowserDownloadFallback) {
        return {
          ok: false,
          filesWritten: 0,
          savedVia: 'fs-handle',
          savedAtLabel: nowLabel,
          message: `Błąd zapisu bezpośredniego do folderu (${msg}). Możesz pobrać paczkę zapisu lokalnego przyciskiem obok.`,
        };
      }
    }
  }

  // Fallback: trigger clean local file save to user's disk
  const safeFolder =
    (params.config.subFolderName || params.config.directoryName || 'aether-projekt')
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'aether-projekt';
  const blob = new Blob([params.workspaceStateJson], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeFolder}-lokalny-zapis.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return {
    ok: true,
    filesWritten: 1,
    savedVia: 'browser-download',
    savedAtLabel: nowLabel,
    message: `Zapisano plik projektu „${safeFolder}-lokalny-zapis.json” na dysku lokalnym.`,
  };
}

export function buildDefaultFrontendRegions(): FrontendImageRegion[] {
  return [
    {
      id: 'reg-header-nav',
      label: 'Pasek nawigacji i akcja główna (Header)',
      zone: 'header',
      xPct: 4,
      yPct: 4,
      wPct: 92,
      hPct: 14,
      shadeId: 'cobalt',
    },
    {
      id: 'reg-main-hero',
      label: 'Sekcja główna i moduł wizualny (Main / Hero)',
      zone: 'main',
      xPct: 4,
      yPct: 21,
      wPct: 58,
      hPct: 54,
      shadeId: 'emerald',
    },
    {
      id: 'reg-main-controls',
      label: 'Panel parametrów i kart interaktywnych (Main / Sterowanie)',
      zone: 'main',
      xPct: 64,
      yPct: 21,
      wPct: 32,
      hPct: 54,
      shadeId: 'amber',
    },
    {
      id: 'reg-footer-bar',
      label: 'Dolna sekcja podsumowania i akcji (Footer)',
      zone: 'footer',
      xPct: 4,
      yPct: 78,
      wPct: 92,
      hPct: 17,
      shadeId: 'cyan',
    },
  ];
}

export async function readImageFileToWorkingState(
  file: File
): Promise<WorkingFrontendImageState> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Nie udało się odczytać pliku obrazu.'));
    reader.readAsDataURL(file);
  });

  const dims = await new Promise<{ w: number; h: number }>((resolve) => {
    const img = new Image();
    img.onload = () =>
      resolve({
        w: img.naturalWidth || 1440,
        h: img.naturalHeight || 900,
      });
    img.onerror = () => resolve({ w: 1440, h: 900 });
    img.src = dataUrl;
  });

  return {
    id: `fimg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    fileName: file.name || 'projektowany-frontend.png',
    mimeType: file.type || 'image/png',
    dataUrl,
    widthPx: dims.w,
    heightPx: dims.h,
    uploadedAt: new Date().toLocaleTimeString('pl-PL', {
      hour: '2-digit',
      minute: '2-digit',
    }),
    regions: buildDefaultFrontendRegions(),
  };
}

export async function createWorkingStateFromAssetUrl(params: {
  title: string;
  src: string;
}): Promise<WorkingFrontendImageState> {
  const dims = await new Promise<{ w: number; h: number }>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () =>
      resolve({
        w: img.naturalWidth || 1440,
        h: img.naturalHeight || 900,
      });
    img.onerror = () => resolve({ w: 1440, h: 900 });
    img.src = params.src;
  });

  return {
    id: `fimg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    fileName: `${params.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.jpg`,
    mimeType: 'image/jpeg',
    dataUrl: params.src,
    widthPx: dims.w,
    heightPx: dims.h,
    uploadedAt: new Date().toLocaleTimeString('pl-PL', {
      hour: '2-digit',
      minute: '2-digit',
    }),
    regions: buildDefaultFrontendRegions(),
  };
}
