// Wait for the page to load
window.onload = function() {
    const canvas = document.getElementById('amslerCanvas');
    const ctx = canvas.getContext('2d');
    
    // Drawing state
    let isDrawing = false;
    let lastX = 0;
    let lastY = 0;

    // --- Buttons ---
    const saveButton = document.getElementById('saveButton');
    const compareButton = document.getElementById('compareButton');
    const clearButton = document.getElementById('clearButton');
    
    // --- Message Area ---
    const messageEl = document.getElementById('message');
    const comparisonImage = document.getElementById('comparisonImage');
    const resultLegend = document.getElementById('resultLegend'); // For the legend

    // Function to draw the Amsler grid background
    function drawGrid() {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height); // canvas.width is 300
        
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1; // Thinner lines for a smaller grid
        
        // Draw a 10x10 grid (300px / 10 lines = 30px steps)
        const step = 30; 
        
        for (let i = step; i < canvas.width; i += step) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i, canvas.height);
            ctx.stroke();
            
            ctx.beginPath();
            ctx.moveTo(0, i);
            ctx.lineTo(canvas.width, i);
            ctx.stroke();
        }
        
        // Draw center dot (smaller for a 300px grid)
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(canvas.width / 2, canvas.height / 2, 4, 0, Math.PI * 2); // 4px radius
        ctx.fill();
        
        // Reset drawing style for user
        ctx.strokeStyle = 'black'; // User will draw in BLACK
        ctx.lineWidth = 3;
    }

    // --- Drawing Functions ---
    function startDrawing(e) {
        isDrawing = true;
        [lastX, lastY] = [e.offsetX, e.offsetY];
    }

    function draw(e) {
        if (!isDrawing) return;
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(e.offsetX, e.offsetY);
        ctx.stroke();
        [lastX, lastY] = [e.offsetX, e.offsetY];
    }

    function stopDrawing() {
        isDrawing = false;
    }

    // --- Button Event Listeners ---
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);

    clearButton.addEventListener('click', () => {
        drawGrid();
        resultLegend.classList.add('hidden'); // Hide legend
        messageEl.textContent = ''; // Clear message
        comparisonImage.style.display = 'none'; // Hide image
    });

    saveButton.addEventListener('click', saveTest);
    compareButton.addEventListener('click', compareTests);

    // --- API Functions (Talk to Python) ---

    async function saveTest() {
        // Get the canvas drawing as a Base64 image
        const imageBase64 = canvas.toDataURL('image/png');
        
        messageEl.textContent = "Saving...";
        comparisonImage.style.display = 'none';
        resultLegend.classList.add('hidden'); // Hide legend

        try {
            // Send the image to the Python backend
            const response = await fetch('http://127.0.0.1:5000/save_test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: imageBase64 })
            });

            const data = await response.json();

            if (data.success) {
                messageEl.textContent = data.message;
            } else {
                messageEl.textContent = `Error: ${data.message}`;
            }

        } catch (error) {
            console.error('Error saving test:', error);
            messageEl.textContent = "Error: Could not connect to server.";
        }
    }

    async function compareTests() {
        messageEl.textContent = "Comparing...";
        comparisonImage.style.display = 'none';
        resultLegend.classList.add('hidden');
        
        try {
            // Ask the Python backend to run the comparison
            const response = await fetch('http://127.0.0.1:5000/compare_tests');
            const data = await response.json();

            if (data.success) {
                messageEl.textContent = data.message;
                // The '?' + new Date().getTime() is a trick to force the browser to reload the image
                comparisonImage.src = `http://127.0.0.1:5000/${data.diff_image_url}?` + new Date().getTime();
                comparisonImage.style.display = 'block';
                resultLegend.classList.remove('hidden'); // Show legend
            } else {
                messageEl.textContent = `Error: ${data.message}`;
            }

        } catch (error) {
            console.error('Error comparing tests:', error);
            messageEl.textContent = "Error: Could not connect to server.";
        }
    }

    // Draw the grid when the page first loads
    drawGrid();
};