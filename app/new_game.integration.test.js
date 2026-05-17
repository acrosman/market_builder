/**
 * Integration tests for new_game.js
 * Loads the actual module and exercises all code paths.
 */

// d3 must be available globally before new_game.js is loaded since it uses d3 inside callbacks.
const d3Callbacks = {};

function createD3MockEl() {
  const el = {
    attr: jest.fn(function () { return this; }),
    style: jest.fn(function () { return this; }),
    call: jest.fn(function () { return this; }),
    on: jest.fn(function (event, handler) {
      d3Callbacks[event] = handler;
      return this;
    }),
    text: jest.fn(function () { return this; }),
    append: jest.fn(function () { return createD3MockEl(); }),
    selectAll: jest.fn(function () { return createD3MockEl(); }),
    data: jest.fn(function () { return this; }),
    join: jest.fn(function () { return this; }),
    node: jest.fn(() => ({ getBBox: () => ({ x: 0, y: 0, width: 100, height: 100 }) })),
    transition: jest.fn(function () {
      return { duration: jest.fn(function () { return { call: jest.fn() }; }) };
    }),
    remove: jest.fn(function () { return this; }),
    insert: jest.fn(function () { return this; })
  };
  return el;
}

global.d3 = {
  select: jest.fn(() => createD3MockEl()),
  scaleOrdinal: jest.fn(() => {
    const scale = jest.fn(type => `color-${type}`);
    scale.domain = jest.fn(function () { return this; });
    scale.range = jest.fn(function () { return this; });
    return scale;
  }),
  schemeCategory10: ['#1f77b4', '#ff7f0e', '#2ca02c'],
  forceSimulation: jest.fn(() => ({
    force: jest.fn(function () { return this; }),
    on: jest.fn(function () { return this; }),
    alphaTarget: jest.fn(function () { return this; }),
    restart: jest.fn()
  })),
  forceLink: jest.fn(() => ({ id: jest.fn(function () { return this; }), distance: jest.fn(function () { return this; }) })),
  forceManyBody: jest.fn(() => ({ strength: jest.fn(function () { return this; }) })),
  forceCenter: jest.fn(() => ({})),
  zoom: jest.fn(() => ({
    scaleExtent: jest.fn(function () { return this; }),
    on: jest.fn(function () { return this; })
  })),
  zoomIdentity: { translate: jest.fn(function () { return this; }), scale: jest.fn(function () { return this; }) },
  drag: jest.fn(() => ({ on: jest.fn(function () { return this; }) }))
};

describe('new_game.js (integration)', () => {
  let registeredCallbacks;

  const mockGraph = {
    systems: [
      { id: 1, name: 'Alpha', connections: { 2: 5 } },
      { id: 2, name: 'Beta', connections: { 1: 5 } }
    ],
    stellarObjects: [
      { type: 'Planet', location: 1 },
      { type: 'Space Station', location: 2 }
    ]
  };

  const mockSummary = {
    typeTotals: { Planet: 1, 'Space Station': 1 }
  };

  beforeEach(() => {
    document.body.innerHTML = `
      <div class="universe-view">
        <form id="new-game-form">
          <input type="text" name="systemCount" value="10" />
          <input type="text" name="connectionCount" value="2" />
          <input type="text" name="stellarObjectCount" value="3" />
          <button id="generate-btn" type="submit">Generate Universe</button>
        </form>
        <button id="close-btn">Close</button>
        <button id="proceed-btn" style="display:none" disabled>Proceed</button>
        <div id="universe-diagram" style="width:800px;height:600px;"></div>
        <div class="universe-info"></div>
      </div>
    `;

    registeredCallbacks = {};
    window.api = {
      send: jest.fn(),
      receive: jest.fn().mockImplementation((channel, cb) => {
        registeredCallbacks[channel] = cb;
      })
    };

    jest.isolateModules(() => {
      require('./new_game');
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    delete window.api;
  });

  test('submitting the form sends create-universe with parsed numbers', () => {
    const form = document.getElementById('new-game-form');
    form.dispatchEvent(new Event('submit'));
    expect(window.api.send).toHaveBeenCalledWith('create-universe', {
      systemCount: 10,
      connectionCount: 2,
      stellarObjectCount: 3
    });
  });

  test('submitting the form disables the generate button', () => {
    const form = document.getElementById('new-game-form');
    form.dispatchEvent(new Event('submit'));
    const btn = document.getElementById('generate-btn');
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toBe('Generating...');
  });

  test('clicking close-btn calls window.close', () => {
    const closeSpy = jest.fn();
    global.window.close = closeSpy;
    document.getElementById('close-btn').click();
    expect(closeSpy).toHaveBeenCalled();
  });

  test('universe-created receive handler is registered', () => {
    expect(registeredCallbacks['universe-created']).toBeInstanceOf(Function);
  });

  describe('universe-created callback', () => {
    let payload;

    beforeEach(() => {
      payload = { graph: mockGraph, summary: mockSummary };
    });

    test('re-enables generate button after universe is created', async () => {
      const generateBtn = document.getElementById('generate-btn');
      generateBtn.disabled = true;

      await registeredCallbacks['universe-created'](payload);
      await new Promise(r => setTimeout(r, 0));

      expect(generateBtn.disabled).toBe(false);
      expect(generateBtn.textContent).toBe('Generate Universe');
    });

    test('shows and enables the proceed button', async () => {
      await registeredCallbacks['universe-created'](payload);
      await new Promise(r => setTimeout(r, 0));

      // The original proceedBtn is replaced by cloneNode; find the new one
      const proceedBtn = document.getElementById('proceed-btn');
      expect(proceedBtn).toBeTruthy();
      expect(proceedBtn.style.display).toBe('block');
      expect(proceedBtn.disabled).toBe(false);
    });

    test('clicking proceed btn sends proceed-to-player-creation', async () => {
      await registeredCallbacks['universe-created'](payload);
      await new Promise(r => setTimeout(r, 0));

      const proceedBtn = document.getElementById('proceed-btn');
      proceedBtn.click();
      expect(window.api.send).toHaveBeenCalledWith('proceed-to-player-creation');
    });

    test('renders the universe diagram using d3', async () => {
      await registeredCallbacks['universe-created'](payload);
      await new Promise(r => setTimeout(r, 0));
      expect(global.d3.select).toHaveBeenCalled();
    });

    test('displays stellar object type counts', async () => {
      await registeredCallbacks['universe-created'](payload);
      await new Promise(r => setTimeout(r, 0));

      const summaryDiv = document.getElementById('stellar-object-summary');
      expect(summaryDiv).toBeTruthy();
      expect(summaryDiv.innerHTML).toContain('Planet: 1');
      expect(summaryDiv.innerHTML).toContain('Space Station: 1');
    });

    test('displays color key for stellar objects', async () => {
      await registeredCallbacks['universe-created'](payload);
      await new Promise(r => setTimeout(r, 0));

      const keyDiv = document.getElementById('stellar-object-color-key');
      expect(keyDiv).toBeTruthy();
      expect(keyDiv.innerHTML).toContain('Planet');
      expect(keyDiv.innerHTML).toContain('Space Station');
    });

    test('existing stellar-object-summary div is reused on second call', async () => {
      await registeredCallbacks['universe-created'](payload);
      await new Promise(r => setTimeout(r, 0));
      await registeredCallbacks['universe-created'](payload);
      await new Promise(r => setTimeout(r, 0));

      const summaryDivs = document.querySelectorAll('#stellar-object-summary');
      expect(summaryDivs.length).toBe(1);
    });
  });
});
