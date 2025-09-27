// indexedDB.js
const dbName = 'InstagramURLTrackerDB';
const storeName = 'instagramHistory';
const configStore = 'configuration';
const DEFAULT_MAX_ENTRIES = 1000; // Default max storage entries, much higher than 50

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 3); // Increased version to handle thumbnail migration

        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            // Create or ensure history store exists
            if (!db.objectStoreNames.contains(storeName)) {
                db.createObjectStore(storeName, { keyPath: 'id', autoIncrement: true });
            }

            // Create configuration store for settings
            if (!db.objectStoreNames.contains(configStore)) {
                const configObjectStore = db.createObjectStore(configStore, { keyPath: 'key' });
                // Initialize with default max entries
                configObjectStore.add({ key: 'maxEntries', value: DEFAULT_MAX_ENTRIES });
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

async function migrateExistingItems() {
    try {
        const db = await openDB();

        // First, migrate favorite field if missing and convert all thumbnails to data URLs
        await new Promise((resolve, reject) => {
            const transaction = db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();

            request.onsuccess = async (event) => {
                const items = event.target.result;
                let updatedCount = 0;
                let migratedThumbnails = 0;

                for (const item of items) {
                    let shouldUpdate = false;

                    // Add favorite field if not present
                    if (item.favorite === undefined) {
                        item.favorite = false;
                        shouldUpdate = true;
                        updatedCount++;
                    }

                    // Check if thumbnail needs to be migrated
                    // Force conversion for all thumbnails that aren't already data URLs
                    if (item.thumbnail && typeof item.thumbnail === 'string' &&
                        !item.thumbnail.startsWith('data:')) {
                        try {
                            // Decode any HTML entities in the URL first
                            const decodedUrl = decodeHTMLEntities(item.thumbnail);

                            // Convert URL thumbnail to data URL
                            item.thumbnail = await convertUrlToDataUrl(decodedUrl);
                            shouldUpdate = true;
                            migratedThumbnails++;
                        } catch (error) {
                            console.error('Error migrating thumbnail:', error);
                            // Use default data URL as fallback
                            item.thumbnail = await getDefaultImageDataUrl();
                            shouldUpdate = true;
                        }
                    }

                    if (shouldUpdate) {
                        store.put(item);
                    }
                }

                console.log(`Migrated ${updatedCount} items with favorite field and ${migratedThumbnails} thumbnails to data URLs`);
                resolve();
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };
        });

        return true;
    } catch (error) {
        console.error('Error during migration:', error);
        return false;
    }
}

// Helper function to decode HTML entities like &amp; to &
function decodeHTMLEntities(text) {
    if (!text || typeof text !== 'string') return text;

    const textArea = document.createElement('textarea');
    textArea.innerHTML = text;
    const decodedText = textArea.value;
    return decodedText;
}

// Convert URL to data URL with compression
async function convertUrlToDataUrl(url) {
    // If it's already a data URL, return as-is
    if (url && url.startsWith('data:')) {
        return url;
    }

    try {
        // Use cache to avoid repeated network requests
        const response = await fetch(url, {
            mode: 'no-cors',
            cache: 'force-cache'
        });
        const blob = await response.blob();

        // For image blobs, compress them
        if (blob.type.startsWith('image/')) {
            return await compressImageBlob(blob);
        }

        // For other blob types, just convert to data URL
        return await blobToDataUrl(blob);
    } catch (error) {
        console.error('Error converting URL to data URL:', error);
        return getDefaultImageDataUrl();
    }
}

// Function to get default image as data URL
async function getDefaultImageDataUrl() {
    try {
        // Fallback SVG data URL
        return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI0UxMzA6QyIgb3BhY2l0eT0iMC4yIi8+PHJlY3QgeD0iNTAiIHk9IjUwIiB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI0UxMzA6QyIgb3BhY2l0eT0iMC41Ii8+PGNpcmNsZSBjeD0iMTAwIiBjeT0iODAiIHI9IjE1IiBmaWxsPSIjRTEzMDZDIi8+PHJlY3QgeD0iODAiIHk9IjExMCIgd2lkdGg9IjQwIiBoZWlnaHQ9IjUiIGZpbGw9IiNFMTMwNkMiLz48L3N2Zz4=';
    } catch (error) {
        console.error('Error generating default image:', error);
        return null;
    }
}

// Compress image blob to data URL
async function compressImageBlob(blob) {
    return new Promise((resolve, reject) => {
        try {
            const img = new Image();
            img.onload = () => {
                // Create canvas for compression
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                // Calculate dimensions - resize to thumbnail size
                const MAX_SIZE = 150;
                let width = img.width;
                let height = img.height;

                if (width > height && width > MAX_SIZE) {
                    height = Math.round(height * (MAX_SIZE / width));
                    width = MAX_SIZE;
                } else if (height > MAX_SIZE) {
                    width = Math.round(width * (MAX_SIZE / height));
                    height = MAX_SIZE;
                }

                // Set canvas dimensions
                canvas.width = width;
                canvas.height = height;

                // Draw and compress image
                ctx.drawImage(img, 0, 0, width, height);

                // Convert to data URL with medium quality JPEG
                const dataUrl = canvas.toDataURL('image/jpeg', 0.6);

                // Clean up
                URL.revokeObjectURL(img.src);

                resolve(dataUrl);
            };

            img.onerror = () => {
                reject(new Error('Failed to load image for compression'));
            };

            img.src = URL.createObjectURL(blob);
        } catch (error) {
            reject(error);
        }
    });
}

// Helper function to convert blob to data URL
function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Failed to convert blob to data URL'));
        reader.readAsDataURL(blob);
    });
}

// Get max entries configuration
async function getMaxEntries() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([configStore], 'readonly');
        const store = transaction.objectStore(configStore);
        const request = store.get('maxEntries');

        request.onsuccess = () => {
            if (request.result) {
                resolve(request.result.value);
            } else {
                // Default if not found
                resolve(DEFAULT_MAX_ENTRIES);
            }
        };

        request.onerror = (event) => {
            reject(event.target.error);
        };
    });
}

// Update max entries configuration
async function setMaxEntries(maxEntries) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([configStore], 'readwrite');
        const store = transaction.objectStore(configStore);
        const request = store.put({ key: 'maxEntries', value: maxEntries });

        request.onsuccess = () => {
            resolve();
        };

        request.onerror = (event) => {
            reject(event.target.error);
        };
    });
}

// Function to trim database when it gets too large, preserving favorites
async function trimDatabaseIfNeeded() {
    try {
        const maxEntries = await getMaxEntries();
        const db = await openDB();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const countRequest = store.count();

            countRequest.onsuccess = () => {
                const totalCount = countRequest.result;

                // Check if we need to trim
                if (totalCount <= maxEntries) {
                    resolve(false); // No trimming needed
                    return;
                }

                // Get all items to sort them
                const getAllRequest = store.getAll();

                getAllRequest.onsuccess = () => {
                    const allItems = getAllRequest.result;

                    // Separate favorites and non-favorites
                    const favorites = allItems.filter(item => item.favorite);
                    const nonFavorites = allItems.filter(item => !item.favorite);

                    // Sort non-favorites by timestamp (oldest first)
                    nonFavorites.sort((a, b) => {
                        return new Date(a.timestamp) - new Date(b.timestamp);
                    });

                    // Calculate how many items to remove
                    const overflow = totalCount - maxEntries;
                    const itemsToRemove = nonFavorites.slice(0, overflow);

                    // Remove oldest non-favorite items
                    let removedCount = 0;
                    itemsToRemove.forEach(item => {
                        store.delete(item.id);
                        removedCount++;
                    });

                    console.log(`Trimmed database: removed ${removedCount} oldest items`);
                    resolve(true); // Trimming performed
                };

                getAllRequest.onerror = (event) => {
                    reject(event.target.error);
                };
            };

            countRequest.onerror = (event) => {
                reject(event.target.error);
            };
        });
    } catch (error) {
        console.error('Error trimming database:', error);
        return false;
    }
}

async function addItem(item) {
    try {
        // First add the item
        const db = await openDB();
        await new Promise((resolve, reject) => {
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

        // Then trim if needed
        await trimDatabaseIfNeeded();
        return true;
    } catch (error) {
        console.error('Error adding item:', error);
        throw error;
    }
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

export { addItem, getAllItems, getFavoriteItems, toggleFavorite, clearAllItems, migrateExistingItems, setMaxEntries };
