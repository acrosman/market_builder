document.getElementById('new-game-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());

  // Convert numeric fields from string to number
  data.systemCount = parseInt(data.systemCount, 10);
  data.connectionCount = parseInt(data.connectionCount, 10);
  data.stellarObjectCount = parseInt(data.stellarObjectCount, 10);

  // Send data to main process to create the universe
  window.api.send('create-universe', data);

  window.close();
});

document.getElementById('cancel-btn').addEventListener('click', () => {
  window.close();
});
