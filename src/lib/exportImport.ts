// Spec §7 Settings → Export JSON / Import JSON (local file). Same format as the backup.
import { readAllData } from '../db/queries.ts';
import type { ISODate } from '../engine/types.ts';
import { buildSnapshot, parseSnapshot, SnapshotError, type BackupSnapshot } from './snapshot.ts';

export type ExportResult = 'shared' | 'downloaded' | 'cancelled';

/**
 * Save everything to a JSON file. On iPhone this opens the share sheet (Save to Files,
 * AirDrop, …); elsewhere it downloads the file.
 */
export async function exportToFile(today: ISODate): Promise<ExportResult> {
  const snapshot = buildSnapshot(await readAllData(), new Date());
  const name = `rouge-backup-${today}.json`;
  const file = new File([JSON.stringify(snapshot, null, 2)], name, { type: 'application/json' });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Rouge backup' });
      return 'shared';
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return 'cancelled';
      // Sharing failed for another reason: fall back to a download.
    }
  }

  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}

/** Read and validate a chosen file. Throws SnapshotError with a readable message. */
export async function readImportFile(file: File): Promise<BackupSnapshot> {
  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    throw new SnapshotError('This file isn’t a Rouge backup (it isn’t valid JSON).');
  }
  return parseSnapshot(raw);
}
