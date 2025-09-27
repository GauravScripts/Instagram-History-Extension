import { addItem } from './indexedDB.js';

if (typeof browser === 'undefined') {
    var browser = chrome;
}

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url && changeInfo.url.includes('instagram.com')) {
        extractInstagramThumbnail(tabId, changeInfo.url)
            .then(thumbnailData => {
                const data = {
                    url: changeInfo.url,
                    timestamp: new Date().toLocaleString(),
                    thumbnail: thumbnailData,
                    favorite: false
                };

                addItem(data).catch(error => {
                    console.error('Error adding item to IndexedDB:', error);
                });
            })
            .catch(error => {
                console.error('Error extracting thumbnail:', error);
            });
    }
});

// Execute content script to extract thumbnail from the page itself to avoid CORS
async function extractInstagramThumbnail(tabId, url) {
    try {
        // Wait a bit for the page to load its content
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Inject and execute content script to extract the thumbnail
        const [result] = await browser.tabs.executeScript(tabId, {
            code: `
                (function() {
                    // Try to get the image from Open Graph meta tag
                    const ogImage = document.querySelector('meta[property="og:image"]');
                    if (ogImage && ogImage.content) {
                        return { thumbnailUrl: ogImage.content };
                    }
                    
                    // Try to get image from Twitter meta tag
                    const twitterImage = document.querySelector('meta[name="twitter:image"]');
                    if (twitterImage && twitterImage.content) {
                        return { thumbnailUrl: twitterImage.content };
                    }
                    
                    // Try to find profile picture for profile pages
                    const profileImg = document.querySelector('img[alt*="profile picture"]');
                    if (profileImg && profileImg.src) {
                        return { thumbnailUrl: profileImg.src };
                    }
                    
                    // Look for post image
                    const postImg = document.querySelector('article img[srcset]');
                    if (postImg && postImg.src) {
                        return { thumbnailUrl: postImg.src };
                    }
                    
                    // Try to find any Instagram image
                    const anyImage = document.querySelector('img[src*="instagram"]');
                    if (anyImage && anyImage.src) {
                        return { thumbnailUrl: anyImage.src };
                    }
                    
                    return { thumbnailUrl: null };
                })();
            `
        });

        if (result && result.thumbnailUrl) {
            // Decode any HTML entities in the URL (like &amp; to &)
            const decodedUrl = decodeHTMLEntities(result.thumbnailUrl);

            // We have a thumbnail URL, compress and convert it to data URL
            return await downloadAndCompressImage(decodedUrl);
        }

        // If no thumbnail found, use default
        return await getDefaultImageDataUrl();
    } catch (error) {
        console.error('Error fetching Instagram thumbnail:', error);
        return await getDefaultImageDataUrl();
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

// Function to get default image as data URL
async function getDefaultImageDataUrl() {
    const defaultImageUrl = chrome.runtime.getURL('img/default-thumbnail.svg');
    try {
        const response = await fetch(defaultImageUrl);
        const blob = await response.blob();
        return await blobToDataUrl(blob);
    } catch (error) {
        console.error('Error loading default image:', error);
        // Return a minimal inline SVG data URL as absolute fallback
        return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI0UxMzA2QyIgb3BhY2l0eT0iMC4yIi8+PHJlY3QgeD0iNTAiIHk9IjUwIiB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI0UxMzA2QyIgb3BhY2l0eT0iMC41Ii8+PGNpcmNsZSBjeD0iMTAwIiBjeT0iODAiIHI9IjE1IiBmaWxsPSIjRTEzMDZDIi8+PHJlY3QgeD0iODAiIHk9IjExMCIgd2lkdGg9IjQwIiBoZWlnaHQ9IjUiIGZpbGw9IiNFMTMwNkMiLz48L3N2Zz4=';
    }
}

// Download and compress image to data URL
async function downloadAndCompressImage(imageUrl) {
    // Check if it's already a data URL
    if (imageUrl && imageUrl.startsWith('data:')) {
        return imageUrl; // Already a data URL, no need to process
    }

    try {
        // Create an image element to load the image
        const img = new Image();

        // Create a promise to handle the image loading
        const imageLoaded = new Promise((resolve, reject) => {
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Failed to load image'));

            // Use a direct fetch with no-cors mode to avoid CORS issues
            fetch(imageUrl, { mode: 'no-cors', cache: 'force-cache' })
                .then(response => response.blob())
                .then(blob => {
                    img.src = URL.createObjectURL(blob);
                })
                .catch(error => {
                    console.error('Error fetching image:', error);
                    reject(error);
                });
        });

        // Wait for the image to load
        try {
            await imageLoaded;

            // Create a canvas and compress the image
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            // Calculate dimensions - resize to thumbnail size (150px max width or height)
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

            // Convert to data URL with medium quality JPEG compression
            const dataUrl = canvas.toDataURL('image/jpeg', 0.6);

            // Clean up the object URL
            URL.revokeObjectURL(img.src);

            return dataUrl;
        } catch (error) {
            console.error('Error processing image:', error);
            return getDefaultImageDataUrl();
        }
    } catch (error) {
        console.error('Error compressing image:', error);
        return getDefaultImageDataUrl();
    }
}

// Helper function to convert a Blob to a data URL
function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Failed to convert blob to data URL'));
        reader.readAsDataURL(blob);
    });
}
