document.addEventListener('DOMContentLoaded', () => {
    // Thay thế chuỗi rỗng này bằng URL CloudFront của bạn sau khi triển khai
    // Ví dụ: const API_BASE_URL = 'https://d123456abcdef.cloudfront.net';
    const API_BASE_URL = ''; 

    const quoteForm = document.getElementById('quoteForm');
    const quotesTableBody = document.querySelector('#quotesTable tbody');
    const serviceSelect = document.getElementById('service_needed');
    const messageDiv = document.getElementById('message');

    // Hàm hiển thị thông báo
    function showMessage(text, type) {
        messageDiv.textContent = text;
        messageDiv.className = type; // 'success' or 'error'
        messageDiv.style.display = 'block';
        setTimeout(() => { messageDiv.style.display = 'none'; }, 5000);
    }

    // Tải danh sách dịch vụ
    async function loadServices() {
        if (!API_BASE_URL) return;
        try {
            const response = await fetch(`${API_BASE_URL}/api/services`);
            if (!response.ok) throw new Error('Failed to load services');
            const services = await response.json();
            services.forEach(service => {
                const option = document.createElement('option');
                option.value = service.name;
                option.textContent = service.name;
                serviceSelect.appendChild(option);
            });
        } catch (error) {
            console.error('Error loading services:', error);
            showMessage('Could not load services from the server.', 'error');
        }
    }

    // Tải danh sách các báo giá đã gửi
    async function loadQuotes() {
        if (!API_BASE_URL) {
            console.warn("API_BASE_URL is not set. Cannot fetch quotes.");
            quotesTableBody.innerHTML = '<tr><td colspan="4">Please configure the API_BASE_URL in script.js</td></tr>';
            return;
        }
        try {
            const response = await fetch(`${API_BASE_URL}/api/quotes`);
             if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const quotes = await response.json();

            quotesTableBody.innerHTML = ''; // Xóa dữ liệu cũ
            if (quotes.length === 0) {
                quotesTableBody.innerHTML = '<tr><td colspan="4">No quotes submitted yet.</td></tr>';
            } else {
                quotes.forEach(quote => {
                    const row = document.createElement('tr');
                    const formattedDate = new Date(quote.created_at).toLocaleDateString();
                    row.innerHTML = `
                        <td>${quote.customer_name}</td>
                        <td>${quote.email}</td>
                        <td>${quote.service_needed}</td>
                        <td>${formattedDate}</td>
                    `;
                    quotesTableBody.appendChild(row);
                });
            }
        } catch (error) {
            console.error('Error loading quotes:', error);
            showMessage('Could not load quotes from the server.', 'error');
            quotesTableBody.innerHTML = `<tr><td colspan="4">Error loading data. Check console.</td></tr>`;
        }
    }

    // Xử lý việc gửi form
    quoteForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!API_BASE_URL) {
             showMessage('API endpoint is not configured. Please set API_BASE_URL in script.js', 'error');
             return;
        }

        const quoteData = {
            customer_name: document.getElementById('customer_name').value,
            email: document.getElementById('email').value,
            service_needed: document.getElementById('service_needed').value,
            details: document.getElementById('details').value,
        };

        try {
            const response = await fetch(`${API_BASE_URL}/api/quotes`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(quoteData),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to submit quote'); }
            showMessage('Quote submitted successfully!', 'success');
            quoteForm.reset();
            loadQuotes(); // Tải lại danh sách báo giá
        } catch (error) {
            console.error('Error submitting quote:', error);
            showMessage(error.message, 'error');
        }
    });

    // Tải dữ liệu ban đầu
    loadServices();
    loadQuotes();
});
