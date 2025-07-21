// worker.js
self.onmessage = function (e) {
    const { action, data } = e.data;

    if (action === 'groupItemsByDate') {
        const grouped = data.reduce((acc, item) => {
            const date = new Date(item.timestamp).toLocaleDateString();
            if (!acc[date]) acc[date] = [];
            acc[date].push(item);
            return acc;
        }, {});

        const groupedArray = Object.entries(grouped).map(([date, items]) => ({
            date,
            items,
        }));

        self.postMessage({ action: 'groupedData', groupedData: groupedArray });
    }
};
