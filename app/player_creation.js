document.addEventListener('DOMContentLoaded', async () => {
  // Get game settings for pronoun options
  const settings = await window.api.getGameSettings();
  const pronounSelect = document.querySelector('select[name="pronouns"]');

  // Populate pronoun options
  settings.pronoun_options.forEach((pronoun, index) => {
    const option = document.createElement('option');
    option.value = index;
    option.textContent = `${pronoun.subject}/${pronoun.object}/${pronoun.possessive}`;
    pronounSelect.appendChild(option);
  });

  document.getElementById('player-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const playerData = {
      name: formData.get('playerName'),
      pronouns: settings.pronoun_options[parseInt(formData.get('pronouns'))],
      description: formData.get('description'),
      corporation: {
        name: formData.get('corporationName'),
        description: formData.get('corporationDescription')
      }
    };

    // Send player data to main process
    window.api.send('create-player', playerData);
  });

  document.getElementById('back-btn').addEventListener('click', () => {
    window.api.send('return-to-universe-creation');
  });
});

// Listen for validation errors
window.api.receive('player-creation-error', (error) => {
  alert(error.message);
});

// Listen for success
window.api.receive('player-creation-success', () => {
  // Window will be closed by main process
});
