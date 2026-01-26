# Dynamic Pricing System

## Overview

The game now features a fuzzy logic pricing system that dynamically adjusts buy and sell prices based on local supply and demand conditions. This creates more realistic trading opportunities and encourages strategic decisions about where and when to trade.

## How It Works

### Price Calculation Factors

The `calculateMarketPrice()` method in [src/game.js](src/game.js) considers multiple factors:

1. **Base Value**: Starting point from goods.json
2. **Supply Factor**: Current inventory vs ideal stock (0.6x - 2.0x multiplier)
   - Low inventory = higher prices (scarce goods)
   - High inventory = lower prices (abundant goods)
3. **Production Factor**: Local productivity rating (0.7x - 1.5x multiplier)
   - High production capability = lower buy prices
   - Low production capability = higher buy prices
4. **Random Variation**: ±5% for market unpredictability

### Buy vs Sell Prices

- **Buy Price**: What you pay to purchase from the market
  - Formula: `baseValue × supplyFactor × productionFactor × randomVariation`
  - Higher when goods are scarce or hard to produce locally

- **Sell Price**: What you receive when selling to the market
  - Formula: `buyPrice × sellRatio (50-80%)`
  - The sell ratio varies based on how much the market needs the good:
    - 50% when market has plenty (high inventory)
    - 80% when market desperately needs it (low/no inventory)
  - This creates the buy-low/sell-high trading mechanic

### Market Categories

Markets stock goods based on stellar object productivity modifiers:

- **Metal productivity** → metalOre, refinedMetal, metalComponents, electronics, ballbarrings, furniture, smallFighters
- **Food productivity** → wheat, water, yeast, flour, bread, wood, lumber, cotton, fabric, clothing
- **Chemicals productivity** → crudeOil, plastics, chemicals, consumerGoods
- **Energy productivity** → (affects all markets slightly)

## Implementation

### Backend (Main Process)

1. **[src/game.js](src/game.js)** - Core pricing logic
   - `calculateMarketPrice(stellarObjectId, goodName, priceType)` - Returns calculated price
   - `buyGood()` - Uses dynamic pricing for purchases
   - `sellGood()` - Uses dynamic pricing for sales

2. **[main.js](main.js)** - IPC handler
   - `get-market-price` handler calls `currentGame.calculateMarketPrice()`
   - Returns price to renderer for display

### Frontend (Renderer Process)

3. **[app/preload.js](app/preload.js)** - IPC bridge
   - Whitelisted `get-market-price` channel

4. **[app/game.js](app/game.js)** - Trade UI
   - Fetches buy prices: `window.api.invoke('get-market-price', { stellarObjectId, goodName, priceType: 'buy' })`
   - Fetches sell prices: `window.api.invoke('get-market-price', { stellarObjectId, goodName, priceType: 'sell' })`
   - Displays prices in trade modal dynamically

## Trading Strategy

To maximize profits:

1. **Buy Low**: Purchase goods where they're abundant (high productivity, full inventory)
2. **Sell High**: Sell goods where they're scarce (low productivity, empty inventory)
3. **Watch Sell Ratios**: Markets with low inventory pay closer to buy price (70-80%)
4. **Plan Routes**: Use jump planner to find profitable trade routes between systems

## Example

Planet A (High metal productivity):

- Refined Metal buy price: 80 cr/unit (abundant locally)
- Refined Metal sell price: 48 cr/unit (60% ratio - market doesn't need more)

Planet B (Low metal productivity):

- Refined Metal buy price: 180 cr/unit (scarce locally)
- Refined Metal sell price: 126 cr/unit (70% ratio - market needs it)

**Profit**: Buy at Planet A for 80 cr, sell at Planet B for 126 cr = 46 cr profit per unit

## Technical Notes

- Prices are calculated on-demand, not stored (prevents stale prices)
- Each market interaction triggers a fresh price calculation
- Sell ratios dynamically adjust from 50-80% based on inventory levels
- Random variation prevents exploiting perfectly predictable prices
- All prices rounded to integers for clean display
