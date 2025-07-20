// indexedDB.js
const dbName = 'InstagramURLTrackerDB';
const storeName = 'instagramHistory';

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(storeName)) {
                db.createObjectStore(storeName, { keyPath: 'id', autoIncrement: true });
            }
        };

        request.onsuccess = (event) => {
            resolve(event.target.result);
        };

        request.onerror = (event) => {
            reject(event.target.error);
        };
    });
}

function migrateExistingItems() {
    return openDB().then((db) => {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();

            request.onsuccess = (event) => {
                const items = event.target.result;
                let updatedCount = 0;

                items.forEach((item) => {
                    if (item.favorite === undefined) {
                        item.favorite = false;
                        store.put(item);
                        updatedCount++;
                    }
                });

                console.log(`Migrated ${updatedCount} items with favorite field`);
                resolve(updatedCount);
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    });
}

function addItem(item) {
    return openDB().then((db) => {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            // Add favorite field if not present
            const itemWithFavorite = { ...item, favorite: item.favorite || false };
            const request = store.add(itemWithFavorite);

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    });
}

function getAllItems() {
    return openDB().then((db) => {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();

            request.onsuccess = (event) => {
                resolve(event.target.result);
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    });
}

function getFavoriteItems() {
    return openDB().then((db) => {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();

            request.onsuccess = (event) => {
                const allItems = event.target.result;
                const favoriteItems = allItems.filter(item => item.favorite);
                resolve(favoriteItems);
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    });
}

function toggleFavorite(id) {
    return openDB().then((db) => {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const getRequest = store.get(id);

            getRequest.onsuccess = () => {
                const item = getRequest.result;
                if (item) {
                    item.favorite = !item.favorite;
                    const updateRequest = store.put(item);
                    
                    updateRequest.onsuccess = () => {
                        resolve(item.favorite);
                    };
                    
                    updateRequest.onerror = (event) => {
                        reject(event.target.error);
                    };
                } else {
                    reject(new Error('Item not found'));
                }
            };

            getRequest.onerror = (event) => {
                reject(event.target.error);
            };
        });
    });
}

function clearAllItems() {
    return openDB().then((db) => {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.clear();

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    });
}

export { addItem, getAllItems, getFavoriteItems, toggleFavorite, clearAllItems, migrateExistingItems };