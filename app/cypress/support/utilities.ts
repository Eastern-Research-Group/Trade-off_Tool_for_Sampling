import Dexie from 'dexie';

const sessionId = 'tots-cypress-testing';
const dataTableName = 'tots-data';
const metadataTableName = 'tots-metadata';
const db = new Dexie('tots-sessions-cache-local');
db.version(1).stores({
  [metadataTableName]: 'id, timestamp, timestampstr',
  [dataTableName]: 'key',
});

export function initializeDb() {
  sessionStorage.clear();
  sessionStorage.setItem('tots-session-id', sessionId);
  db.table('tots-data').where('key').startsWith(sessionId).delete();
}

export function setIndexedDbValue(key: string, value: any) {
  db.table(dataTableName).put({ key: `${sessionId}-${key}`, value });
}

export function setDisplayMode(
  dimensions: string,
  shape: string,
  terrain3d: boolean = true,
) {
  setIndexedDbValue('display_mode', {
    dimensions,
    geometryType: shape,
    terrain3dVisible: terrain3d,
    terrain3dUseElevation: true,
    viewUnderground3d: false,
  });
}

export async function readFromStorage(key: string) {
  return (await db.table(dataTableName).get(`${sessionId}-${key}`))?.value;
}

export default db;
