const { isArray } = Array;
const connections: any[] = [];

/*
Creates a new database with given stores if the database and stores don't exist.
- name            string      The databse name
- storeNames      array       An array of store names
- Return          object      The given database
*/
const openDatabase = (name = 'default', storeNames: string | string[]) =>
  new Promise((resolve, reject) => {
    const DBOpenRequest = window.indexedDB.open(name, 1);

    /*
  db64 does not revolve around versioning. Therefore, this function will only run once
  for every new set of databases created. Each set of databases and stores can only be
  created once and cannot be modified. Therefore, all databases have a version of 1.
  */
    DBOpenRequest.onupgradeneeded = ({ target }) => {
      const { result } = target as any;
      (isArray(storeNames) ? storeNames : [storeNames]).forEach((storeName) => {
        if (!result.objectStoreNames.contains(storeName)) {
          const storeCreation = result.createObjectStore(storeName);
          storeCreation.onerror = (err: any) => reject(err.target.error);
        }
      });
    };

    /*
  Connected databases are stored to be disconnected before deletion.
  */
    DBOpenRequest.onsuccess = ({ target }: any) => {
      connections.push(DBOpenRequest);
      resolve(target.result);
    };

    DBOpenRequest.onerror = ({ target }: any) => reject(target?.result);
  });

/*
Sets an entry by a given key/value pair or a dataset of entries.
- database              object              Database object
- storeName       string              Store name
- key             structured          Key of entry
- dataValue       structured          Value of entry
- entries         array | object      Entries to set
- Return          object              db64 object
*/
const setData = async (
  database: any,
  storeName: string,
  key: string | null,
  dataValue: any,
  entries?: string,
) =>
  new Promise((resolve, reject) => {
    try {
      const obStore = database
        .transaction([storeName], 'readwrite')
        .objectStore(storeName);
      if (entries) {
        const dataEntries = isArray(dataValue)
          ? () =>
              dataValue.map((fruitName, index) => obStore.put(fruitName, index))
          : () =>
              Object.entries(dataValue).map(([key, value]) =>
                obStore.put(value, key),
              );
        resolve(Promise.all(dataEntries()));
      } else {
        resolve(obStore.put(dataValue, key));
      }
    } catch (e) {
      reject(e);
    }
  });

/*
Gets an entry by a given key/value pair or a dataset of entries.
- database            object              Database object
- storeName     string              Store name
- key           structured          Key of entry
- entries       array | object      Entries to get
- Return        object              A promise fulfilled with the queried data
*/
const getData = async (
  database: any,
  storeName: string,
  key: string | string[],
  entries?: string,
) =>
  new Promise((resolve, reject) => {
    const objectStore = database
      .transaction([storeName])
      .objectStore(storeName);

    if (entries) {
      const results: any = {};
      const cursorRequest = objectStore.openCursor();

      cursorRequest.onsuccess = (e: any) => {
        const cursor = e.target.result;

        if (cursor) {
          if (key.includes(cursor.key)) results[cursor.key] = cursor.value;
          cursor.continue();
        } else {
          resolve(results);
        }
      };

      cursorRequest.onerror = (e: any) => reject(e);
    } else {
      const dataRequest = objectStore.get(key);
      dataRequest.onsuccess = () => resolve(dataRequest.result);
      dataRequest.onerror = (e: any) => reject(e);
    }
  });

/*
Deletes an entry for a given store by key.
- database            object          Database object
- storeName     string          Store name
- key           structured      Key of entry
- Return        object          db64
*/
const deleteData = async (
  database: any,
  storeName: string,
  key: string | string[],
) =>
  new Promise((resolve, reject) => {
    try {
      const objectStore = database
        .transaction([storeName], 'readwrite')
        .objectStore(storeName);
      const cursorRequest = objectStore.openCursor();

      cursorRequest.onsuccess = (e: any) => {
        const cursor = e.target.result;

        if (cursor) {
          if ((isArray(key) ? key : [key]).includes(cursor.key))
            cursor.delete();
          cursor.continue();
        }
      };
      cursorRequest.onerror = (e: any) => reject(e);
      resolve(simpleIDB);
    } catch (e) {
      reject(e);
    }
  });

/*
Empties a store.
- database              object              Database object
- storeName       string              Store name
- Return          object              A promise fulfilled with the queried data
*/
const clearStore = (database: any, storeName: string) =>
  new Promise((resolve, reject) => {
    const objectStore = database
      .transaction([storeName], 'readwrite')
      .objectStore(storeName);
    const objectStoreRequest = objectStore.clear();

    objectStoreRequest.onsuccess = () => resolve(simpleIDB);
    objectStoreRequest.onerror = (e: any) => reject(e.target.error);
  });

/*
Deletes a given databse.
- name          string      Database to delete
- Return        object      A promise fulfilled with the queried data
*/
const deleteDB = (name: string) => {
  const deletedDBs: any[] = [];
  return new Promise((resolve, reject) => {
    const DBDeleteRequest = indexedDB.deleteDatabase(name);

    DBDeleteRequest.onsuccess = () => resolve(simpleIDB);

    DBDeleteRequest.onerror = (e) => reject(e);

    DBDeleteRequest.onblocked = () => {
      for (const database of connections) {
        if (database.result.name === name) {
          database.result.close();
          deletedDBs.push(name);
        }
      }

      if (!deletedDBs.includes(name)) {
        deleteDB(name);
      } else {
        resolve(simpleIDB);
      }
    };
  });
};

/*
The db64 object */
const simpleIDB = {
  create: async (name: string, storeNames: string[]) => {
    if (typeof name !== 'string') console.error(`${name} should be a string`);
    if (!isArray(storeNames))
      return console.error(`${storeNames} should be an array`);

    return openDatabase(name, storeNames);
  },
  use: (name: string, storeName: string) => {
    if (typeof name !== 'string') console.error(`${name} should be a string`);
    if (typeof name !== 'string')
      console.error(`${storeName} should be a string`);

    return {
      set: async (key: string, value: any) =>
        openDatabase(name, [storeName]).then((database) =>
          setData(database, storeName, key, value),
        ),
      setEntries: async (value: any) =>
        openDatabase(name, storeName).then((database) =>
          setData(database, storeName, null, value, 'entries'),
        ),
      get: async (key: string) =>
        openDatabase(name, storeName).then((database) =>
          getData(database, storeName, key),
        ),
      getEntries: async (keys: string[]) =>
        openDatabase(name, storeName).then((database) =>
          getData(database, storeName, keys, 'entries'),
        ),
      delete: async (keys: string[]) =>
        openDatabase(name, storeName).then((database) =>
          deleteData(database, storeName, keys),
        ),
    };
  },
  clear: async (name: string, storeName: string) =>
    openDatabase(name, storeName).then((database) =>
      clearStore(database, storeName),
    ),
  delete: async (name: string) => deleteDB(name),
};

export default simpleIDB;
