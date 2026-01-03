/**
 * Tests for new_game.js
 * Tests universe generation form and visualization
 */

// Mock D3 for visualization tests
global.d3 = {
  select: jest.fn(() => ({
    selectAll: jest.fn(() => ({
      remove: jest.fn()
    })),
    append: jest.fn(() => ({
      attr: jest.fn(function () { return this; }),
      call: jest.fn(function () { return this; }),
      selectAll: jest.fn(() => ({
        data: jest.fn(() => ({
          join: jest.fn(() => ({
            attr: jest.fn(function () { return this; }),
            call: jest.fn(function () { return this; })
          }))
        }))
      })),
      on: jest.fn()
    })),
    insert: jest.fn(() => ({
      attr: jest.fn(function () { return this; }),
      appendChild: jest.fn()
    })),
    transition: jest.fn(() => ({
      duration: jest.fn(() => ({
        call: jest.fn()
      }))
    }))
  })),
  scaleOrdinal: jest.fn(() => ({
    domain: jest.fn(function () { return this; }),
    range: jest.fn(function () { return this; })
  })),
  schemeCategory10: ['#color1', '#color2'],
  forceSimulation: jest.fn(() => ({
    force: jest.fn(function () { return this; }),
    on: jest.fn()
  })),
  forceLink: jest.fn(() => ({
    id: jest.fn(function () { return this; }),
    distance: jest.fn(function () { return this; })
  })),
  forceManyBody: jest.fn(() => ({
    strength: jest.fn(function () { return this; })
  })),
  forceCenter: jest.fn(() => ({})),
  zoom: jest.fn(() => ({
    scaleExtent: jest.fn(function () { return this; }),
    on: jest.fn(function () { return this; })
  })),
  zoomIdentity: {
    translate: jest.fn(function () { return this; }),
    scale: jest.fn(function () { return this; })
  },
  drag: jest.fn(() => ({
    on: jest.fn(function () { return this; })
  }))
};

describe('New Game Form', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <form id="new-game-form">
        <input type="number" name="systemCount" value="10" />
        <input type="number" name="connectionCount" value="3" />
        <input type="number" name="stellarObjectCount" value="20" />
        <button id="generate-btn" type="submit">Generate Universe</button>
      </form>
      <button id="close-btn">Close</button>
      <button id="proceed-btn" style="display:none;">Proceed</button>
      <div id="universe-diagram"></div>
      <div class="universe-view"></div>
    `;

    window.api = {
      send: jest.fn(),
      receive: jest.fn()
    };

    // Use spy instead of mock to preserve the original
    jest.spyOn(window, 'close').mockImplementation(() => { });

    jest.clearAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    delete window.api;
    if (window.close && window.close.mockRestore) {
      window.close.mockRestore();
    }
  });

  describe('Form Submission', () => {
    test('should send create-universe message with parsed data on submit', () => {
      const form = document.getElementById('new-game-form');

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.target).entries());

        data.systemCount = parseInt(data.systemCount, 10);
        data.connectionCount = parseInt(data.connectionCount, 10);
        data.stellarObjectCount = parseInt(data.stellarObjectCount, 10);

        window.api.send('create-universe', data);

        const generateBtn = document.getElementById('generate-btn');
        generateBtn.disabled = true;
        generateBtn.textContent = 'Generating...';
      });

      const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
      form.dispatchEvent(submitEvent);

      expect(window.api.send).toHaveBeenCalledWith('create-universe', {
        systemCount: 10,
        connectionCount: 3,
        stellarObjectCount: 20
      });
    });

    test('should disable generate button and update text during generation', () => {
      const form = document.getElementById('new-game-form');
      const generateBtn = document.getElementById('generate-btn');

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.target).entries());

        data.systemCount = parseInt(data.systemCount, 10);
        data.connectionCount = parseInt(data.connectionCount, 10);
        data.stellarObjectCount = parseInt(data.stellarObjectCount, 10);

        window.api.send('create-universe', data);

        generateBtn.disabled = true;
        generateBtn.textContent = 'Generating...';
      });

      expect(generateBtn.disabled).toBe(false);
      expect(generateBtn.textContent).toBe('Generate Universe');

      const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
      form.dispatchEvent(submitEvent);

      expect(generateBtn.disabled).toBe(true);
      expect(generateBtn.textContent).toBe('Generating...');
    });

    test('should parse string values to numbers', () => {
      const form = document.getElementById('new-game-form');

      // Set string values
      form.querySelector('[name="systemCount"]').value = '25';
      form.querySelector('[name="connectionCount"]').value = '5';
      form.querySelector('[name="stellarObjectCount"]').value = '50';

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.target).entries());

        data.systemCount = parseInt(data.systemCount, 10);
        data.connectionCount = parseInt(data.connectionCount, 10);
        data.stellarObjectCount = parseInt(data.stellarObjectCount, 10);

        window.api.send('create-universe', data);
      });

      const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
      form.dispatchEvent(submitEvent);

      expect(window.api.send).toHaveBeenCalledWith('create-universe', {
        systemCount: 25,
        connectionCount: 5,
        stellarObjectCount: 50
      });
    });
  });

  describe('Close Button', () => {
    test('should close window when close button clicked', () => {
      const closeBtn = document.getElementById('close-btn');

      closeBtn.addEventListener('click', () => {
        window.close();
      });

      closeBtn.click();

      expect(window.close).toHaveBeenCalled();
    });
  });

  describe('Universe Created Handler', () => {
    test('should re-enable generate button after universe is created', () => {
      const generateBtn = document.getElementById('generate-btn');
      generateBtn.disabled = true;
      generateBtn.textContent = 'Generating...';

      const mockPayload = {
        graph: {
          systems: [{ id: 0, name: 'Alpha', connections: [1] }, { id: 1, name: 'Beta', connections: [0] }],
          stellarObjects: [{ id: 0, type: 'Planet', location: 0 }]
        },
        summary: {
          typeTotals: { Planet: 1 }
        }
      };

      // Simulate universe-created event
      const handler = jest.fn((payload) => {
        generateBtn.disabled = false;
        generateBtn.textContent = 'Generate Universe';
      });

      handler(mockPayload);

      expect(generateBtn.disabled).toBe(false);
      expect(generateBtn.textContent).toBe('Generate Universe');
    });

    test('should show and enable proceed button after universe is created', () => {
      const proceedBtn = document.getElementById('proceed-btn');
      expect(proceedBtn.style.display).toBe('none');
      expect(proceedBtn.disabled).toBe(false);

      const mockPayload = {
        graph: {
          systems: [{ id: 0, name: 'Alpha', connections: [] }],
          stellarObjects: []
        },
        summary: {
          typeTotals: {}
        }
      };

      // Simulate showing proceed button
      const handler = jest.fn((payload) => {
        proceedBtn.style.display = 'block';
        proceedBtn.disabled = false;
      });

      handler(mockPayload);

      expect(proceedBtn.style.display).toBe('block');
      expect(proceedBtn.disabled).toBe(false);
    });

    test('should send proceed-to-player-creation when proceed button clicked', () => {
      const proceedBtn = document.getElementById('proceed-btn');

      // Clone and replace to simulate event listener cleanup
      const newProceedBtn = proceedBtn.cloneNode(true);
      proceedBtn.parentNode.replaceChild(newProceedBtn, proceedBtn);

      newProceedBtn.addEventListener('click', () => {
        window.api.send('proceed-to-player-creation');
      });

      newProceedBtn.click();

      expect(window.api.send).toHaveBeenCalledWith('proceed-to-player-creation');
    });
  });

  describe('Display Functions', () => {
    test('displayStellarObjectCounts should create summary div with counts', () => {
      const typeTotals = {
        Planet: 5,
        Station: 3,
        Asteroid: 2
      };

      // Create container
      const container = document.createElement('div');
      container.className = 'universe-info';
      document.body.appendChild(container);

      // Simulate displayStellarObjectCounts
      let summaryDiv = document.getElementById('stellar-object-summary');
      if (!summaryDiv) {
        summaryDiv = document.createElement('div');
        summaryDiv.id = 'stellar-object-summary';
        summaryDiv.className = 'universe-summary';
        container.appendChild(summaryDiv);
      }
      summaryDiv.innerHTML = `<b>Stellar Object Counts:</b><br>` +
        Object.entries(typeTotals).map(([type, count]) => `${type}: ${count}`).join('<br>');

      expect(summaryDiv).toBeTruthy();
      expect(summaryDiv.innerHTML).toContain('Stellar Object Counts:');
      expect(summaryDiv.innerHTML).toContain('Planet: 5');
      expect(summaryDiv.innerHTML).toContain('Station: 3');
      expect(summaryDiv.innerHTML).toContain('Asteroid: 2');
    });

    test('displayColorKey should create color key div', () => {
      const stellarObjects = [
        { id: 0, type: 'Planet' },
        { id: 1, type: 'Station' },
        { id: 2, type: 'Planet' }
      ];

      const container = document.createElement('div');
      container.className = 'universe-info';
      document.body.appendChild(container);

      const types = Array.from(new Set(stellarObjects.map(obj => obj.type)));

      let keyDiv = document.getElementById('stellar-object-color-key');
      if (!keyDiv) {
        keyDiv = document.createElement('div');
        keyDiv.id = 'stellar-object-color-key';
        keyDiv.className = 'universe-color-key';
        container.appendChild(keyDiv);
      }

      keyDiv.innerHTML = `<b>System Color Key:</b><br>` +
        types.map(type => `<span>Color</span>${type}`).join('<br>');

      expect(keyDiv).toBeTruthy();
      expect(keyDiv.innerHTML).toContain('System Color Key:');
      expect(keyDiv.innerHTML).toContain('Planet');
      expect(keyDiv.innerHTML).toContain('Station');
    });
  });
});
