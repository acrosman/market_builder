// Preload script.
const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object.
// Big hat tip: https://stackoverflow.com/a/59814127/24215.
contextBridge.exposeInMainWorld('api', {
  send: (channel, data) => {
    // List channels to allow.
    const validChannels = ['open-new-game', 'create-universe', 'create-player', 'return-to-universe-creation', 'proceed-to-player-creation'];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  receive: (channel, func) => {
    // List channels to allow.
    const validChannels = ['universe-created', 'player-creation-error', 'player-creation-success'];
    if (validChannels.includes(channel)) {
      // Remove the event to avoid information leaks.
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    }
  },
  getGameSettings: () => ipcRenderer.invoke('get-game-settings'), // Add this line
});
