All game content data is in this directory. In theory the game could be configured to load data from different subdirectories. The `default` directory is the default game messages, with US English messages in `en-us`. If the game is translated into other languages the default location would be in a new language encoding directory like `es-mx` (Mexican Spanish), `en-gr` (British English), or `jp` (Japanese).

Within that pattern the files are as follows:

- **game_settings.json** - Core config (starting ship, credits, data directory path)
- **game_messages.json** - Localized text with token replacement (e.g., `{playerName}`, `{systemName}`)
  - Load with: `addMessage('messages:game_start')` (group) or `addMessage('message:navigation.jump_success', { systemName })`
- **ships.json**, **goods.json**, **buildings.json**, **stellarObjects.json** - Game content definitions
- **images/** - Asset files organized by type/class

To support new languages/variants, copy entire `data/default/en-us/` directory and update `data_directory` in game_settings.json.
