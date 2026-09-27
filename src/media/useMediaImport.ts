import { useCallback, useEffect, useState } from 'react';
import type { ImportedMediaItem, MediaStatusCheckResult } from '../../shared/types';

export function useMediaImport() {
  const [items, setItems] = useState<ImportedMediaItem[]>([]);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMap, setStatusMap] = useState<Record<string, MediaStatusCheckResult>>({});

  const refreshList = useCallback(async () => {
    if (typeof window === 'undefined' || !window.friday?.media?.list) return;
    try {
      const list = await window.friday.media.list();
      setItems(list);
    } catch (err) {
      console.error('[useMediaImport] Failed to fetch media list:', err);
    }
  }, []);

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  const importViaDialog = useCallback(async (): Promise<ImportedMediaItem[]> => {
    if (typeof window === 'undefined' || !window.friday?.media?.importDialog) {
      setError('Media import API is unavailable in this environment.');
      return [];
    }

    setIsImporting(true);
    setError(null);
    try {
      const newItems = await window.friday.media.importDialog();
      if (newItems && newItems.length > 0) {
        setItems((prev) => {
          const ids = new Set(newItems.map((n) => n.id));
          return [...newItems, ...prev.filter((p) => !ids.has(p.id))];
        });
      }
      return newItems;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg.replace(/^Error:\s*Error invoking remote method '[^']+':\s*Error:\s*/, ''));
      return [];
    } finally {
      setIsImporting(false);
    }
  }, []);

  const importByPath = useCallback(async (filePath: string): Promise<ImportedMediaItem | null> => {
    if (typeof window === 'undefined' || !window.friday?.media?.importFile) {
      setError('Media import API is unavailable in this environment.');
      return null;
    }

    setIsImporting(true);
    setError(null);
    try {
      const item = await window.friday.media.importFile(filePath);
      setItems((prev) => {
        const filtered = prev.filter((p) => p.id !== item.id && p.filePath !== item.filePath);
        return [item, ...filtered];
      });
      return item;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg.replace(/^Error:\s*Error invoking remote method '[^']+':\s*Error:\s*/, ''));
      return null;
    } finally {
      setIsImporting(false);
    }
  }, []);

  const importDroppedFiles = useCallback(
    async (fileList: FileList | File[]): Promise<ImportedMediaItem[]> => {
      const results: ImportedMediaItem[] = [];
      const files = Array.from(fileList);

      if (files.length === 0) return results;

      setIsImporting(true);
      setError(null);

      for (const file of files) {
        let path = '';
        if (window.friday?.media?.getPathForFile) {
          path = window.friday.media.getPathForFile(file);
        }
        if (!path) {
          path = (file as unknown as { path?: string }).path || '';
        }

        if (!path) {
          setError(`Could not resolve file path for dropped file "${file.name}".`);
          continue;
        }

        try {
          const item = await window.friday.media.importFile(path);
          results.push(item);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          setError(msg.replace(/^Error:\s*Error invoking remote method '[^']+':\s*Error:\s*/, ''));
        }
      }

      if (results.length > 0) {
        setItems((prev) => {
          const newIds = new Set(results.map((r) => r.id));
          return [...results, ...prev.filter((p) => !newIds.has(p.id))];
        });
      }

      setIsImporting(false);
      return results;
    },
    []
  );

  const removeItem = useCallback(async (id: string): Promise<boolean> => {
    if (typeof window === 'undefined' || !window.friday?.media?.remove) return false;
    try {
      const ok = await window.friday.media.remove(id);
      if (ok) {
        setItems((prev) => prev.filter((item) => item.id !== id));
        setStatusMap((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
      return ok;
    } catch (err) {
      console.error('[useMediaImport] Failed to remove item:', err);
      return false;
    }
  }, []);

  const checkStatus = useCallback(async (id: string): Promise<MediaStatusCheckResult | null> => {
    if (typeof window === 'undefined' || !window.friday?.media?.checkStatus) return null;
    try {
      const status = await window.friday.media.checkStatus(id);
      setStatusMap((prev) => ({ ...prev, [id]: status }));
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, isAvailable: status.exists } : item))
      );
      return status;
    } catch (err) {
      console.error('[useMediaImport] Failed to check status:', err);
      return null;
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    items,
    isImporting,
    error,
    statusMap,
    importViaDialog,
    importByPath,
    importDroppedFiles,
    removeItem,
    checkStatus,
    refreshList,
    clearError,
  };
}
