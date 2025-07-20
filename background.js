import { addItem } from './indexedDB.js';

if (typeof browser === 'undefined') {
    var browser = chrome;
}

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url && changeInfo.url.includes('instagram.com')) {
        extractInstagramThumbnail(changeInfo.url)
            .then(thumbnailUrl => {
                const data = {
                    url: changeInfo.url,
                    timestamp: new Date().toLocaleString(),
                    thumbnail: thumbnailUrl,
                    favorite: false // Add favorite field with default value
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

async function extractInstagramThumbnail(url) {
    try {
        const response = await fetch(url);
        const html = await response.text();

        // Method 1: Extract thumbnail from Open Graph meta tag using regex
        const ogImageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
        if (ogImageMatch && ogImageMatch[1]) {
            return ogImageMatch[1];
        }

        // Method 2: Extract thumbnail from Twitter card meta tag
        const twitterImageMatch = html.match(/<meta\s+name="twitter:image"\s+content="([^"]+)"/i);
        if (twitterImageMatch && twitterImageMatch[1]) {
            return twitterImageMatch[1];
        }

        // Method 3: Look for common Instagram image patterns (e.g., in the page HTML)
        const imageMatches = html.match(/https:\/\/[^\s"']+\.(?:jpg|jpeg|png|webp)/gi);
        if (imageMatches && imageMatches.length > 0) {
            return imageMatches[0];
        }

        // Method 4: Extract from Instagram's JSON data (for posts and reels)
        const jsonMatch = html.match(/window\._sharedData\s*=\s*({.*?});<\/script>/s);
        if (jsonMatch && jsonMatch[1]) {
            try {
                const sharedData = JSON.parse(jsonMatch[1]);

                // Check if it's a post or reel
                const postData = sharedData.entry_data?.PostPage?.[0]?.graphql?.shortcode_media;
                const reelData = sharedData.entry_data?.ReelPage?.[0]?.graphql?.shortcode_media;
                const userProfilePic = sharedData.entry_data?.ReelPage?.[0]?.graphql?.user?.profile_pic_url;

                // For post or reel, return the display URL or thumbnail
                if (postData) {
                    return postData.display_url || postData.thumbnail_src;
                }
                if (reelData) {
                    return reelData.display_url || reelData.thumbnail_src;
                }

                // For stories, attempt to get the thumbnail if available
                const storyData = sharedData.entry_data?.StoryPage?.[0]?.graphql?.story?.story_assets;
                if (storyData && storyData.length > 0) {
                    // Try to get the first available story asset's thumbnail or image
                    const storyThumbnail = storyData[0]?.image_versions2?.candidates?.[0]?.url;
                    if (storyThumbnail) {
                        return storyThumbnail;
                    }
                }

                // Fallback: If no story thumbnail found, use the profile picture
                if (userProfilePic) {
                    return userProfilePic;
                }

            } catch (jsonError) {
                console.error('Error parsing Instagram shared data:', jsonError);
            }
        }

        // Fallback thumbnail
        return 'https://example.com/instagram-default-thumbnail.jpg';
    } catch (error) {
        console.error('Error fetching Instagram thumbnail:', error);
        return 'https://example.com/instagram-default-thumbnail.jpg';
    }
}
