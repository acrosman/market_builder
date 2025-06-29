document.getElementById('new-game-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());
  // Send data to main process or parent window as needed
  window.close(); // Placeholder: close window after submit
});

document.getElementById('cancel-btn').addEventListener('click', () => {
  window.close();
});
