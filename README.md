# Market Builder

A trading game. Travel the universe, grow or harvest raw materials, create finished goods, sell them through companies, invest to company stock, and whatever else comes to mind over time.

Inspired by the old Capitalism and TradeWarz games. Meant to be some kind of intersection of the two.

## Project Structure

### Source Directory (`src/`)

The backend game logic runs in Electron's main process. Core modules include:

- **game.js** - Main game state management:
  - `Game` class - Manages universe, players, NPCs, corporations, and turn processing
  - `Player` class - Tracks player state (location, ship, cargo, credits, statistics)
  - `NPC` class - AI-controlled traders and entities
  - Game state methods: jump, dock, land, takeoff, save/load functionality

- **universe.js** - Universe generation and stellar objects:
  - `Universe` class - Container for systems and stellar objects
  - `System` class - Star systems with connections (jump routes)
  - `StellarObject` class - Planets, stations, and asteroids with properties
  - `createUniverse()` - Procedural generation with configurable parameters
  - Image management for stellar objects and systems

- **corporation.js** - Economic entities and asset management:
  - `Corporation` class - Tracks owned stellar objects, ships, and goods
  - Asset valuation methods for calculating corporate worth
  - Player-owned and NPC corporation support

- **eventBus.js** - Event system for game-wide notifications:
  - `EventBus` class - Publish/subscribe pattern for game events
  - Methods: `on()`, `once()`, `emit()`, `clear()`, `listenerCount()`
  - Used for tick events and other game state changes
  - Listeners can subscribe to events and unsubscribe when done

- **actor.js** - Base class for economic actors (players, NPCs, corporations)
- **producer.js** - Production and manufacturing logic
- **consumer.js** - Consumption and market demand
- **economy.js** - Economic simulation and market pricing

### Application Directory (`app/`)

The renderer process handles the UI and user interaction:

- **game.html** - Main game interface with:
  - Location and ship status displays
  - Dynamic location image display
  - Action buttons (navigation, docking, landing)
  - Game console for messages
  - Modal system for detailed views

- **game.js** - Game UI controller:
  - Location display updates (system info, stellar objects, images)
  - Ship status tracking (energy, cargo, health)
  - Action button management based on game state
  - IPC communication with main process
  - Modal handling (player status, settings)

- **player_creation.html/js** - Character creation interface:
  - Name and pronoun selection
  - Corporation naming and description
  - Form validation and data submission

- **new_game.html/js** - New game configuration screen
- **index.html** - Main menu and game launcher
- **interface.js** - Shared UI utilities
- **preload.js** - Secure IPC bridge between main and renderer processes

- **css/** - Stylesheets for all game screens
- **modals/** - Reusable modal templates (player status, etc.)
- **templates/** - Reusable HTML fragments (error messages, status displays)

### Time System

The game uses a tick-based time system to track the passage of time:

- **Ticks** - The fundamental unit of game time
- **advanceTicks()** - Advances game time by a specified number of ticks
- Actions consume ticks:
  - Jumping between systems: 1-20 ticks (varies by connection)
  - Docking at stations: 1 tick
  - Landing on planets: 1 tick
  - Taking off: 1 tick
- The tick count is displayed in the ship's clock interface
- Each tick advances emits a `tick` event on the EventBus with data:
  - `ticks` - Current total tick count
  - `action` - The action that triggered the tick (e.g., 'jump', 'dock', 'land', 'takeoff')

The EventBus allows game systems to react to the passage of time by subscribing to tick events.

### Message Template System

The game uses a message template system for displaying text to players with dynamic content:

**Template Loading:**

- Messages are stored in `data/default/en-us/game_messages.json`
- Templates can be loaded as message groups (`messages:group_name`) or individual messages (`message:category.key`)
- Message groups display a title and multiple related messages
- Individual messages are processed with variable substitution

**Replacement Tokens:**
All tokens use the format `{tokenName}` and are replaced at runtime:

- `{playerName}` - Player's character name
- `{corporationName}` - Player's corporation name
- `{systemId}` - System ID number
- `{systemName}` - System name
- `{objectName}` - Stellar object name (planet, station, asteroid)
- `{savePath}` - File path for saved games
- `{destinationId}` - Destination system ID for jump sequences
- `{route}` - Formatted route display (e.g., "System 1 → System 31 → System 38")
- `{current}` - Current step number in a sequence
- `{total}` - Total steps in a sequence

**Usage Examples:**

```javascript
// Load a message group (displays title + all messages)
addMessage('messages:game_start');

// Load a single message with variable substitution
addMessage('message:navigation.jump_success', { systemName: 'Alpha Centauri' });

// Direct text (no template processing)
addMessage('Custom message text');
```

**Message Categories:**

- `game_start` - Welcome messages and backstory
- `tutorial` - Getting started instructions
- `ui` - User interface messages
- `navigation` - Jump, dock, land, takeoff messages
- `save_load` - Save and load operation feedback
- `jump_planner` - Multi-jump route planning messages
- `settings` - Game settings interface messages

### Main Entry Point

- **main.js** - Electron main process:
  - Window management and app lifecycle
  - IPC handlers for game actions (jump, dock, land, save/load)
  - Game settings loading and management
  - File system access for saves and data

## Data Directory Structure

The game uses a configurable data directory system to support multiple languages and game configurations. By default, game data is stored in `data/default/en-us/`.

### Configuration Files

- **game_settings.json** - Core game configuration including:
  - `data_directory` - Path to the active data directory (default: `data/default/en-us`)
  - `initial_ship` - Starting ship type for new players
  - `starting_credits` - Initial credits for new players
  - `food_per_person` - Food consumption per person per turn
  - `population_growth_divisor` - Divisor for population growth rate calculations (default: 1000000). A reproduction rate of 2 with divisor 1000000 equals 0.0002% growth per tick. Lower divisor = faster growth
  - `starting_system` - Configuration for the home system (System 1)
  - `pronoun_options` - Available pronoun sets for player creation

### Game Content Files

- **buildings.json** - Building types with properties:
  - `value` - Base value of the building
  - `image` - Path to building image
  - Storage, energy, shields, and weapon capabilities
  - Production capabilities (manufacturing, farming, mining, etc.)
  - Build costs and operational costs

- **ships.json** - Ship types including:
  - `value` - Base value of the ship
  - `image` - Path to ship image
  - `price` - Purchase price
  - Combat stats (hitPoints, shields, weapons)
  - Cargo capacity and crew requirements
  - Energy consumption and recharge rates

- **goods.json** - Tradeable goods with manufacturing chains:
  - `value` - Base market value
  - `type` - Category (raw, intermediate, finished)
  - `category` - Production category matching productivity modifiers (food, metal, chemicals, energy, general, military)
  - `inputs` - Required materials for production
  - `finishedMass` - Weight/volume of finished product

- **stellarObjects.json** - Planet, station, and asteroid class definitions:
  - Type definitions (Planet, Space Station, Asteroid)
  - Class-specific properties (population limits, features, market capabilities)
  - `imagePath` - Directory containing images for each class

- **planet_names.json** - Name pool for randomly generated planets
- **station_names.json** - Name pool for randomly generated stations and asteroids

### Images Directory

The `images/` subdirectory contains all game assets organized by type:

- **images/stellar_objects/** - System and object images:
  - Class-specific subdirectories (Earthlike, FarmWorld, MetalWorld, etc.)
  - Each with `Surface/` and `Port/` subdirectories for landed/docked views
  - `Starfields/` - Background images for empty systems
  - System-specific images (System1.jpg, System1Surface.jpg, System1Port.jpg)

- **images/ships/** - Ship images referenced in ships.json
- **images/buildings/** - Building images referenced in buildings.json

### Creating Custom Data Sets

To create a custom language or game variant:

1. Copy the `data/default/en-us/` directory to a new location (e.g., `data/custom/fr-fr/`)
2. Translate/modify the JSON files and replace images as needed
3. Update the `data_directory` setting in your game_settings.json to point to the new location

All file paths in JSON files should be relative to the data directory root.

## Defining Goods

Goods in the game are defined in `goods.json` and control what can be traded, manufactured, and transported. The market system uses goods definitions to populate stellar object markets based on their productivity capabilities.

### Good Definition Structure

Each good is defined with the following properties:

```json
{
  "wheat": {
    "label": "Wheat",
    "value": 8,
    "type": "raw",
    "category": "food",
    "inputs": {},
    "finishedMass": {
      "units": "metric tons",
      "mass": 1
    }
  }
}
```

**Required Properties:**

- **label** (string) - Human-readable display name for the good. Defaults to title-cased version of the key (e.g., "metalOre" → "Metal Ore"). Used in trading interfaces and player status displays
- **value** (number) - Base market value in credits. This is modified by local market conditions
- **type** (string) - Manufacturing stage in the production chain:
  - `raw` - Raw materials extracted or harvested (wheat, metalOre, crudeOil)
  - `intermediate` - Processed materials used in further production (flour, refinedMetal, plastics)
  - `finished` - Final products ready for consumption (bread, electronics, consumerGoods)
- **category** (string) - Production category that determines which markets stock this good:
  - `food` - Agricultural and organic products
  - `metal` - Metals and metal-based products
  - `chemicals` - Chemical products and petrochemicals
  - `energy` - Energy-related products (future use)
  - `general` - General consumer goods (stocked on all markets)
  - `military` - Military equipment and weapons
- **inputs** (object) - Materials required to produce one unit of this good:
  - Empty `{}` for raw materials
  - Key-value pairs for manufactured goods: `{ "wheat": 1, "water": 0.5 }`
- **finishedMass** (object) - Physical properties of the good:
  - `units` - Unit of measurement (metric tons, kilograms, etc.)
  - `mass` - Weight/volume per unit (affects cargo capacity)

### Market Stocking System

Markets on stellar objects are populated based on the object's **productivity modifiers** defined in `stellarObjects.json`:

```json
"productivityModifiers": {
  "metal": 5,
  "food": 7,
  "chemicals": 6,
  "energy": 8
}
```

**How Market Stocking Works:**

1. **Category Matching** - Markets stock goods whose `category` matches their productivity modifiers
2. **Quantity Calculation** - Higher productivity modifier = more goods in stock:
   - Raw materials: modifier × 50 units (0-500)
   - Intermediate goods: modifier × 20 units (0-200)
   - Finished goods: modifier × 10 units (0-100)
3. **Price Variation** - Prices are inversely related to productivity:
   - High productivity = lower prices (abundant local supply)
   - Low productivity = higher prices (scarce local supply)
4. **General Goods** - Items with `category: "general"` are stocked on all markets at moderate levels

**Example:**

A Farm World planet with `"food": 10` productivity modifier will stock:

- Large quantities of food-category goods (wheat, water, bread, etc.)
- Lower prices for food goods (abundant local production)
- Normal quantities of general goods (furniture, clothing, etc.)
- Small or no stock of metal/chemical goods (low productivity)

### Adding New Goods

To add a new good to the game:

1. **Choose a category** that matches stellar object productivity modifiers
2. **Define the good** in `goods.json` with all required properties
3. **Set up production chain** using the `inputs` field if it's a manufactured good
4. **Test market behavior** by creating a game and visiting planets with matching productivity

**Example - Adding a new food product:**

```json
"cheese": {
  "value": 45,
  "type": "finished",
  "category": "food",
  "inputs": {
    "milk": 2,
    "salt": 0.1
  },
  "finishedMass": {
    "units": "kilograms",
    "mass": 400
  }
}
```

This cheese will automatically appear on markets of planets with high food productivity, with quantities and prices based on their food modifier value.

### Production Chains

Goods can be linked in production chains using the `inputs` field:

```
Raw: wheat → Intermediate: flour → Finished: bread
Raw: metalOre → Intermediate: refinedMetal → Intermediate: metalComponents → Finished: electronics
```

Complex goods can require multiple inputs:

```json
"electronics": {
  "inputs": {
    "metalComponents": 2,
    "plastics": 1
  }
}
```

The game will (in future updates) use these production chains to simulate manufacturing, allowing players to:

- Extract raw materials from resource-rich planets
- Process them into intermediate goods at industrial facilities
- Manufacture finished goods for sale at consumer markets
- Profit from the difference in prices at each stage

## Trading and Pricing

The game features a dynamic pricing system that adjusts buy and sell prices based on supply and demand factors. For detailed information about how market prices are calculated, see [Dynamic Pricing System](docs/DYNAMIC_PRICING.md).
