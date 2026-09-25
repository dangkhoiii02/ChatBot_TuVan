import type { DatabaseSync } from 'node:sqlite';

const activeTransactions = new WeakSet<DatabaseSync>();

export function withTransaction<T>(db: DatabaseSync, work: () => T): T {
  if (activeTransactions.has(db)) return work();

  db.exec('BEGIN IMMEDIATE');
  activeTransactions.add(db);
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  } finally {
    activeTransactions.delete(db);
  }
}
