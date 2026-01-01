// Preload script.
const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object.
// Big hat tip: https://stackoverflow.com/a/59814127/24215.
contextBridge.exposeInMainWorld('api', {
  send: (channel, data) => {
    // List channels to allow.
    const validChannels = [
      'open-new-game',
      'create-universe',
      'create-player',
      'return-to-universe-creation',
      'proceed-to-player-creation',
      'get-location-info',
      'jump-to-system',
      'dock-at-station',
      'land-on-surface',
      'save-game',
      'load-game',
      'get-save-files',
      'take-off'
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  invoke: (channel, data) => {
    // List channels to allow.
    const validChannels = ['get-location-state', 'get-game-settings', 'get-ship-data', 'get-universe-graph', 'get-universe-summary', 'open-load-game-dialog'];
    if (validChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, data);
    }
  },
  receive: (channel, func) => {
    // List channels to allow.
    const validChannels = [
      'universe-created',
      'player-creation-error',
      'player-creation-success',
      'location-update',
      'jump-result',
      'dock-result',
      'land-result',
      'save-game-result',
      'load-game-result',
      'save-files-list',
      'takeoff-result'
    ];
    if (validChannels.includes(channel)) {
      // Remove the event to avoid information leaks.
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    }
  },
  getLocationState: () => ipcRenderer.invoke('get-location-state'),  // Add this
  getGameSettings: () => ipcRenderer.invoke('get-game-settings'), // Add this line
  getShipData: () => ipcRenderer.invoke('get-ship-data'),
});
