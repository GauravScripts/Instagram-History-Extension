import { getAllItems, getFavoriteItems, toggleFavorite, clearAllItems, migrateExistingItems, setMaxEntries } from './indexedDB.js';

if (typeof browser === 'undefined') {
    var browser = chrome;
}

document.addEventListener('DOMContentLoaded', () => {
    let currentPage = 0; // Current page index
    const itemsPerPage = 9; // Items per page
    const worker = new Worker('worker.js'); // Initialize the worker
    let currentView = 'all'; // 'all' or 'favorites'

    // Detect tab mode (opened as full browser tab, not popup)
    if (window.innerWidth > 500) {
        document.documentElement.classList.add('tab-mode');
    }

    // Open in Tab button
    const openTabBtn = document.getElementById('openTabBtn');
    openTabBtn.addEventListener('click', () => {
        browser.tabs.create({ url: browser.runtime.getURL('popup.html') });
    });

    // Settings modal elements
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const closeModal = document.getElementById('closeModal');
    const maxEntriesInput = document.getElementById('maxEntries');
    const saveSettings = document.getElementById('saveSettings');
    const cancelSettings = document.getElementById('cancelSettings');

    // Initialize settings
    async function initializeSettings() {
        try {
            // Get current max entries value
            const db = await openIndexedDB();
            const transaction = db.transaction(['configuration'], 'readonly');
            const store = transaction.objectStore('configuration');
            const request = store.get('maxEntries');

            request.onsuccess = () => {
                if (request.result) {
                    maxEntriesInput.value = request.result.value;
                } else {
                    maxEntriesInput.value = 1000; // Default
                }
            };

            request.onerror = () => {
                console.error('Error getting maxEntries value');
                maxEntriesInput.value = 1000; // Default on error
            };
        } catch (error) {
            console.error('Error initializing settings:', error);
            maxEntriesInput.value = 1000; // Default on error
        }
    }

    // Open IndexedDB helper function
    function openIndexedDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('InstagramURLTrackerDB', 2);

            request.onsuccess = (event) => {
                resolve(event.target.result);
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }

    // Settings modal event listeners
    settingsBtn.addEventListener('click', () => {
        initializeSettings();
        settingsModal.classList.add('show');
    });

    closeModal.addEventListener('click', () => {
        settingsModal.classList.remove('show');
    });

    cancelSettings.addEventListener('click', () => {
        settingsModal.classList.remove('show');
    });

    saveSettings.addEventListener('click', async () => {
        const maxEntries = parseInt(maxEntriesInput.value, 10);

        if (isNaN(maxEntries) || maxEntries < 100) {
            alert('Please enter a valid number (minimum 100)');
            return;
        }

        // Save the new max entries value
        try {
            await setMaxEntries(maxEntries);
            settingsModal.classList.remove('show');

            // Show success message
            const message = document.createElement('div');
            message.textContent = `Storage limit updated to ${maxEntries} entries`;
            message.style.position = 'fixed';
            message.style.bottom = '20px';
            message.style.left = '50%';
            message.style.transform = 'translateX(-50%)';
            message.style.backgroundColor = 'rgba(102, 126, 234, 0.9)';
            message.style.color = 'white';
            message.style.padding = '10px 16px';
            message.style.borderRadius = '8px';
            message.style.zIndex = '1000';

            document.body.appendChild(message);

            // Remove the message after 3 seconds
            setTimeout(() => {
                document.body.removeChild(message);
            }, 3000);
        } catch (error) {
            console.error('Error saving settings:', error);
            alert('Failed to save settings. Please try again.');
        }
    });

    // Close modal when clicking outside
    window.addEventListener('click', (event) => {
        if (event.target === settingsModal) {
            settingsModal.classList.remove('show');
        }
    });

    // Function to remove duplicate URLs
    function removeDuplicateUrls(history) {
        const seenUrls = new Set();
        return history.filter((item) => {
            if (seenUrls.has(item.url)) {
                return false; // Skip duplicate
            }
            seenUrls.add(item.url);
            return true; // Keep unique
        });
    }

    // Function to show loading state
    function showLoading() {
        const tableBody = document.getElementById('historyTableBody');
        tableBody.innerHTML = `
            <div class="empty-state">
                <div class="loading"></div>
                <div class="empty-state-text">Loading your Instagram history...</div>
            </div>
        `;
    }

    // Function to update the table
    function updateTable() {
        showLoading();
        
        const dataPromise = currentView === 'favorites' ? getFavoriteItems() : getAllItems();
        
        dataPromise
            .then((history) => {
                // Remove duplicate URLs
                const uniqueHistory = removeDuplicateUrls(history);

                if (uniqueHistory.length === 0) {
                    updateUIWithNoData();
                } else {
                    worker.postMessage({ action: 'groupItemsByDate', data: uniqueHistory });
                }
            })
            .catch((error) => {
                console.error('Error loading history:', error);
                showError();
            });
    }

    // Handle messages from the worker
    worker.onmessage = function (e) {
        const { action, groupedData } = e.data;

        if (action === 'groupedData') {
            const tableBody = document.getElementById('historyTableBody');
            tableBody.innerHTML = '';

            // Reverse the grouped history to show newest to oldest
            const reversedGroupedHistory = groupedData.reverse();
            const totalPages = Math.ceil(reversedGroupedHistory.length / itemsPerPage);

            if (currentPage >= totalPages) currentPage = totalPages - 1;
            if (currentPage < 0) currentPage = 0;

            const paginatedHistory = reversedGroupedHistory.slice(
                currentPage * itemsPerPage,
                (currentPage + 1) * itemsPerPage
            );

            paginatedHistory.forEach(({ date, items }) => {
                const dateHeader = document.createElement('div');
                dateHeader.className = 'date-header';
                dateHeader.textContent = date;
                tableBody.appendChild(dateHeader);

                const gridContainer = document.createElement('div');
                gridContainer.className = 'grid-container';

                items.reverse().forEach((item) => {
                    const thumbnailDiv = document.createElement('div');
                    thumbnailDiv.className = 'thumbnail-item';
                    thumbnailDiv.innerHTML = `
                        <a href="${item.url}" target="_blank" rel="noopener noreferrer" class="thumbnail-link">
                            <img src="${item.thumbnail}" alt="Thumbnail" title="${item.timestamp}" class="thumbnail">
                        </a>
                        <div class="favorite-icon ${item.favorite ? '' : 'not-favorite'}" data-id="${item.id}">
                            <svg viewBox="0 0 24 24">
                                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                            </svg>
                        </div>
                    `;
                    
                    // Add click event for favorite icon
                    const favoriteIcon = thumbnailDiv.querySelector('.favorite-icon');
                    favoriteIcon.addEventListener('click', (e) => {
                        e.stopPropagation();
                        handleFavoriteToggle(item.id, favoriteIcon);
                    });

                    gridContainer.appendChild(thumbnailDiv);
                });

                tableBody.appendChild(gridContainer);
            });

            updatePaginationControls(totalPages);
        }
    };

    // Function to handle favorite toggle
    function handleFavoriteToggle(id, favoriteIcon) {
        toggleFavorite(id)
            .then((isFavorite) => {
                // Update the icon appearance
                if (isFavorite) {
                    favoriteIcon.classList.remove('not-favorite');
                } else {
                    favoriteIcon.classList.add('not-favorite');
                }

                // If we're in favorites view and item is unfavorited, refresh the view
                if (currentView === 'favorites' && !isFavorite) {
                    currentPage = 0; // Reset to first page
                    updateTable();
                }
            })
            .catch((error) => {
                console.error('Error toggling favorite:', error);
            });
    }

    // Function to show "No Data" UI with better styling
    function updateUIWithNoData() {
        const tableBody = document.getElementById('historyTableBody');
        const isFavorites = currentView === 'favorites';
        
        const message = isFavorites ? 'No favorite posts yet' : 'No Instagram posts tracked yet';
        const subMessage = isFavorites ? 'Start favoriting posts to see them here' : 'Visit Instagram posts to start tracking your history';
        const icon = isFavorites ? '❤️' : '📸';
        
        tableBody.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">${icon}</div>
                <div class="empty-state-text">${message}</div>
                <div class="empty-state-subtext">${subMessage}</div>
            </div>
        `;
    }

    // Function to show error UI
    function showError() {
        const tableBody = document.getElementById('historyTableBody');
        tableBody.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">⚠️</div>
                <div class="empty-state-text">Error loading history</div>
                <div class="empty-state-subtext">Please try refreshing the extension</div>
            </div>
        `;
    }

    // Function to update pagination controls
    function updatePaginationControls(totalPages) {
        const paginationControls = document.getElementById('paginationControls');
        paginationControls.innerHTML = '';

        if (totalPages <= 1) {
            return; // Hide pagination if only one page
        }

        const prevButton = document.createElement('button');
        prevButton.textContent = '← Previous';
        prevButton.disabled = currentPage === 0;
        prevButton.addEventListener('click', () => {
            currentPage--;
            updateTable();
        });

        const nextButton = document.createElement('button');
        nextButton.textContent = 'Next →';
        nextButton.disabled = currentPage >= totalPages - 1;
        nextButton.addEventListener('click', () => {
            currentPage++;
            updateTable();
        });

        paginationControls.appendChild(prevButton);
        paginationControls.appendChild(nextButton);
    }

    // Tab switching functionality
    function setupTabs() {
        const allTab = document.getElementById('allTab');
        const favoritesTab = document.getElementById('favoritesTab');

        allTab.addEventListener('click', () => {
            if (currentView !== 'all') {
                currentView = 'all';
                currentPage = 0;
                allTab.classList.add('active');
                favoritesTab.classList.remove('active');
                updateTable();
            }
        });

        favoritesTab.addEventListener('click', () => {
            if (currentView !== 'favorites') {
                currentView = 'favorites';
                currentPage = 0;
                favoritesTab.classList.add('active');
                allTab.classList.remove('active');
                updateTable();
            }
        });
    }

    // Clear history button functionality with confirmation
    document.getElementById('clearHistory').addEventListener('click', () => {
        if (confirm('Are you sure you want to clear all Instagram history? This action cannot be undone.')) {
            // Show loading state on button
            const clearBtn = document.getElementById('clearHistory');
            const originalText = clearBtn.textContent;
            clearBtn.textContent = 'Clearing...';
            clearBtn.disabled = true;
            
            clearAllItems()
                .then(() => {
                    currentPage = 0; // Reset pagination
                    updateTable();
                    clearBtn.textContent = originalText;
                    clearBtn.disabled = false;
                })
                .catch((error) => {
                    console.error('Error clearing history:', error);
                    clearBtn.textContent = originalText;
                    clearBtn.disabled = false;
                    alert('Error clearing history. Please try again.');
                });
        }
    });

    // Setup tabs and initial table load
    setupTabs();
    
    // Run migration first, then load the table
    migrateExistingItems()
        .then(() => {
            updateTable();
        })
        .catch((error) => {
            console.error('Error during migration:', error);
            updateTable(); // Still try to load the table even if migration fails
        });
});
