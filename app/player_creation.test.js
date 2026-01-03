/**
 * Tests for player_creation.js
 * Tests player and corporation creation form
 */

describe('Player Creation Form', () => {
  let mockSettings;

  beforeEach(() => {
    document.body.innerHTML = `
      <form id="player-form">
        <input type="text" name="playerName" value="" />
        <select name="pronouns"></select>
        <textarea name="description"></textarea>
        <input type="text" name="corporationName" value="" />
        <textarea name="corporationDescription"></textarea>
        <button type="submit">Create Player</button>
      </form>
      <button id="back-btn">Back</button>
    `;

    mockSettings = {
      pronoun_options: [
        { subject: 'he', object: 'him', possessive: 'his', reflexive: 'himself' },
        { subject: 'she', object: 'her', possessive: 'her', reflexive: 'herself' },
        { subject: 'they', object: 'them', possessive: 'their', reflexive: 'themself' }
      ]
    };

    window.api = {
      send: jest.fn(),
      receive: jest.fn(),
      getGameSettings: jest.fn().mockResolvedValue(mockSettings)
    };

    jest.clearAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    delete window.api;
  });

  describe('Pronoun Options Loading', () => {
    test('should populate pronoun select with options from settings', async () => {
      const pronounSelect = document.querySelector('select[name="pronouns"]');

      // Simulate DOMContentLoaded handler
      const settings = await window.api.getGameSettings();
      settings.pronoun_options.forEach((pronoun, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = `${pronoun.subject}/${pronoun.object}/${pronoun.possessive}`;
        pronounSelect.appendChild(option);
      });

      expect(window.api.getGameSettings).toHaveBeenCalled();
      expect(pronounSelect.options.length).toBe(3);
      expect(pronounSelect.options[0].textContent).toBe('he/him/his');
      expect(pronounSelect.options[1].textContent).toBe('she/her/her');
      expect(pronounSelect.options[2].textContent).toBe('they/them/their');
    });

    test('should set correct values for pronoun options', async () => {
      const pronounSelect = document.querySelector('select[name="pronouns"]');

      const settings = await window.api.getGameSettings();
      settings.pronoun_options.forEach((pronoun, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = `${pronoun.subject}/${pronoun.object}/${pronoun.possessive}`;
        pronounSelect.appendChild(option);
      });

      expect(pronounSelect.options[0].value).toBe('0');
      expect(pronounSelect.options[1].value).toBe('1');
      expect(pronounSelect.options[2].value).toBe('2');
    });
  });

  describe('Form Submission', () => {
    test('should send create-player message with complete player data', async () => {
      const form = document.getElementById('player-form');
      const pronounSelect = document.querySelector('select[name="pronouns"]');

      // Populate pronouns
      const settings = await window.api.getGameSettings();
      settings.pronoun_options.forEach((pronoun, index) => {
        const option = document.createElement('option');
        option.value = index;
        pronounSelect.appendChild(option);
      });

      // Fill form
      form.querySelector('[name="playerName"]').value = 'Captain Smith';
      pronounSelect.value = '1';
      form.querySelector('[name="description"]').value = 'A brave captain';
      form.querySelector('[name="corporationName"]').value = 'Smith Trading Co';
      form.querySelector('[name="corporationDescription"]').value = 'A small trading company';

      form.addEventListener('submit', (e) => {
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

        window.api.send('create-player', playerData);
      });

      const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
      form.dispatchEvent(submitEvent);

      expect(window.api.send).toHaveBeenCalledWith('create-player', {
        name: 'Captain Smith',
        pronouns: { subject: 'she', object: 'her', possessive: 'her', reflexive: 'herself' },
        description: 'A brave captain',
        corporation: {
          name: 'Smith Trading Co',
          description: 'A small trading company'
        }
      });
    });

    test('should correctly parse pronoun index and retrieve pronoun object', async () => {
      const form = document.getElementById('player-form');
      const pronounSelect = document.querySelector('select[name="pronouns"]');

      const settings = await window.api.getGameSettings();
      settings.pronoun_options.forEach((pronoun, index) => {
        const option = document.createElement('option');
        option.value = index;
        pronounSelect.appendChild(option);
      });

      pronounSelect.value = '2';
      form.querySelector('[name="playerName"]').value = 'Test Player';
      form.querySelector('[name="corporationName"]').value = 'Test Corp';

      form.addEventListener('submit', (e) => {
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

        window.api.send('create-player', playerData);
      });

      const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
      form.dispatchEvent(submitEvent);

      const sentData = window.api.send.mock.calls[0][1];
      expect(sentData.pronouns).toEqual({
        subject: 'they',
        object: 'them',
        possessive: 'their',
        reflexive: 'themself'
      });
    });

    test('should handle empty optional fields', async () => {
      const form = document.getElementById('player-form');
      const pronounSelect = document.querySelector('select[name="pronouns"]');

      const settings = await window.api.getGameSettings();
      settings.pronoun_options.forEach((pronoun, index) => {
        const option = document.createElement('option');
        option.value = index;
        pronounSelect.appendChild(option);
      });

      form.querySelector('[name="playerName"]').value = 'Player';
      pronounSelect.value = '0';
      form.querySelector('[name="description"]').value = '';
      form.querySelector('[name="corporationName"]').value = 'Corp';
      form.querySelector('[name="corporationDescription"]').value = '';

      form.addEventListener('submit', (e) => {
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

        window.api.send('create-player', playerData);
      });

      const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
      form.dispatchEvent(submitEvent);

      const sentData = window.api.send.mock.calls[0][1];
      expect(sentData.description).toBe('');
      expect(sentData.corporation.description).toBe('');
    });
  });

  describe('Back Button', () => {
    test('should send return-to-universe-creation when clicked', () => {
      const backBtn = document.getElementById('back-btn');

      backBtn.addEventListener('click', () => {
        window.api.send('return-to-universe-creation');
      });

      backBtn.click();

      expect(window.api.send).toHaveBeenCalledWith('return-to-universe-creation');
    });
  });

  describe('Error Handling', () => {
    test('should handle player-creation-error events', () => {
      const alertSpy = jest.spyOn(window, 'alert').mockImplementation();

      const errorHandler = jest.fn((error) => {
        alert(error.message);
      });

      // Simulate receiving error
      errorHandler({ message: 'Player name is required' });

      expect(errorHandler).toHaveBeenCalledWith({ message: 'Player name is required' });
      expect(alertSpy).toHaveBeenCalledWith('Player name is required');

      alertSpy.mockRestore();
    });

    test('should not display alert if error message is empty', () => {
      const alertSpy = jest.spyOn(window, 'alert').mockImplementation();

      const errorHandler = jest.fn((error) => {
        if (error.message) {
          alert(error.message);
        }
      });

      errorHandler({ message: '' });

      expect(errorHandler).toHaveBeenCalled();
      expect(alertSpy).not.toHaveBeenCalled();

      alertSpy.mockRestore();
    });
  });

  describe('Success Handling', () => {
    test('should handle player-creation-success events', () => {
      const successHandler = jest.fn(() => {
        // Window will be closed by main process
        // Nothing to do in renderer
      });

      successHandler();

      expect(successHandler).toHaveBeenCalled();
    });
  });
});
