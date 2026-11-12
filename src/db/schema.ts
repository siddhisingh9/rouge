// Dexie database — spec §4. The phone is the primary store.
import { Dexie, type EntityTable } from 'dexie';
import type { DailyLog, Pause, Settings } from './types.ts';

export const DB_NAME = 'rouge';

export type RougeDB = Dexie & {
  dailyLogs: EntityTable<DailyLog, 'date'>;
  pauses: EntityTable<Pause, 'id'>;
  settings: EntityTable<Settings, 'key'>;
};

export const db = new Dexie(DB_NAME) as RougeDB;

// Schema v1. Future changes must add db.version(2) with an upgrade(), never edit this.
db.version(1).stores({
  dailyLogs: '&date',
  pauses: '++id, start',
  settings: '&key',
});
