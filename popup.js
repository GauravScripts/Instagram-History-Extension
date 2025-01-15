import { getAllItems, clearAllItems } from './indexedDB.js';

if (typeof browser === 'undefined') {
    var browser = chrome;
}

document.addEventListener('DOMContentLoaded', () => {
    let currentPage = 0; // Current page index
    const itemsPerPage = 9; // Items per page
    const worker = new Worker('worker.js'); // Initialize the worker

    // Function to update the table
    function updateTable() {
        getAllItems()
            .then((history) => {
                if (history.length === 0) {
                    updateUIWithNoData();
                } else {
                    worker.postMessage({ action: 'groupItemsByDate', data: history });
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
                    <img src="${item.thumbnail}" alt="Thumbnail" title="${item.timestamp}" class="thumbnail">
                `;
                    thumbnailDiv.addEventListener('click', () => {
                        window.open(item.url, '_blank');
                    });
                    gridContainer.appendChild(thumbnailDiv);
                });

                tableBody.appendChild(gridContainer);
            });

            updatePaginationControls(totalPages);
        }
    };

    // Function to show "No Data" UI
    function updateUIWithNoData() {
        const tableBody = document.getElementById('historyTableBody');
        tableBody.innerHTML = `
            <div class="no-data">No Instagram URLs tracked yet</div>
        `;
    }

    // Function to show error UI
    function showError() {
        const tableBody = document.getElementById('historyTableBody');
        tableBody.innerHTML = `
            <div class="no-data">Error loading history</div>
        `;
    }

    // Function to update pagination controls
    function updatePaginationControls(totalPages) {
        const paginationControls = document.getElementById('paginationControls');
        paginationControls.innerHTML = '';

        const prevButton = document.createElement('button');
        prevButton.textContent = 'Previous';
        prevButton.disabled = currentPage === 0;
        prevButton.addEventListener('click', () => {
            currentPage--;
            updateTable();
        });

        const nextButton = document.createElement('button');
        nextButton.textContent = 'Next';
        nextButton.disabled = currentPage >= totalPages - 1;
        nextButton.addEventListener('click', () => {
            currentPage++;
            updateTable();
        });

        paginationControls.appendChild(prevButton);
        paginationControls.appendChild(nextButton);
    }

    // Clear history button functionality
    document.getElementById('clearHistory').addEventListener('click', () => {
        clearAllItems()
            .then(() => {
                currentPage = 0; // Reset pagination
                updateTable();
            })
            .catch((error) => {
                console.error('Error clearing history:', error);
            });
    });

    // Initial table load
    updateTable();
});
