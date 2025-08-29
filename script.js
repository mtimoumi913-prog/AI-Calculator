document.getElementById('submit').addEventListener('click', () => {
    const input = document.getElementById('input').value;
    const output = document.getElementById('output');
    
    // Simple math evaluation (for demo purposes)
    try {
        const result = eval(input.replace(/[^0-9+\-*/(). ]/g, '')); // Basic security filter
        output.innerHTML = `<strong>Result:</strong> ${result}`;
    } catch (error) {
        output.innerHTML = `<strong>Error:</strong> Please enter a valid math expression`;
    }
});