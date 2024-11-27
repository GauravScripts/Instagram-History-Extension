import { getAllItems, clearAllItems } from './indexedDB.js';

if (typeof browser === 'undefined') {
    var browser = chrome;
}

document.addEventListener('DOMContentLoaded', () => {
    function updateTable() {
        getAllItems().then((history) => {
            const tableBody = document.getElementById('historyTableBody');
            tableBody.innerHTML = '';

            if (history.length === 0) {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td colspan="3" class="no-data">No Instagram URLs tracked yet</td>
                `;
                tableBody.appendChild(row);
            } else {
                [...history].reverse().forEach(item => {
                    const displayUrl = item.url.replace('https://www.instagram.com/', '');
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td class="thumbnail-cell"><img src="${item.thumbnail}" alt="Thumbnail"></td>
                        <td class="url-cell" title="${item.url}"><a href="${item.url}" target="_blank">${displayUrl}</a></td>
                        <td class="time-cell">${item.timestamp}</td>
                    `;
                    tableBody.appendChild(row);
                });
            }
        }).catch(error => {
            console.error('Error loading history:', error);
            const tableBody = document.getElementById('historyTableBody');
            tableBody.innerHTML = `
                <tr>
                    <td colspan="3" class="no-data">Error loading history</td>
                </tr>
            `;
        });
    }

    // Initial table load
    updateTable();

    // Clear history button functionality
    document.getElementById('clearHistory').addEventListener('click', () => {
        clearAllItems().then(() => {
            updateTable();
        }).catch(error => {
            console.error('Error clearing history:', error);
        });
    });

    // Handle middle-click to open in new tab without closing the popup
    document.addEventListener('click', (event) => {
        if (event.target.tagName === 'A' && event.button === 1) {
            event.preventDefault();
            browser.tabs.create({ url: event.target.href, active: false });
        }
    });
});