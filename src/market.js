const fs = require('fs');
const path = require('path');
const { createLogger } = require('./logger');

const logger = createLogger('Market');

/**
 * Market manager for handling trading and pricing in the game
 */
class Market {
  constructor(universe, settings) {
    this.universe = universe;
    this.settings = settings;
  }

  /**
   * Initialize market conditions across all systems
   */
  initializeMarkets() {
    const dataDir = this.settings.data_directory || 'data/default/en-us';
    const goodsData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', dataDir, 'goods.json'), 'utf-8'));

    // Categorize goods dynamically based on their category field from goods.json
    const categorizeGoods = () => {
      const categories = {};

      Object.keys(goodsData).forEach(goodName => {
        const category = goodsData[goodName].category || 'general';
        if (!categories[category]) {
          categories[category] = [];
        }
        categories[category].push(goodName);
      });

      return categories;
    };

    const categories = categorizeGoods();

    // Populate markets for all stellar objects with market capability
    this.universe.stellarObjects.forEach(obj => {
      if (!obj.marketState) {
        return; // Skip objects without markets
      }

      // Initialize empty inventory and prices
      obj.marketState.inventory = {};
      obj.marketState.prices = {};

      // Determine which goods to stock based on productivity modifiers
      const stockGoods = (category, modifier) => {
        const goodsList = categories[category] || [];
        goodsList.forEach(goodName => {
          const baseValue = goodsData[goodName].value;
          const goodType = goodsData[goodName].type;

          // Quantity based on productivity modifier (0-10 scale)
          // Higher modifier = more goods
          let baseQuantity = 0;
          if (goodType === 'raw') {
            baseQuantity = modifier * 50; // 0-500 units
          } else if (goodType === 'intermediate') {
            baseQuantity = modifier * 20; // 0-200 units
          } else if (goodType === 'finished') {
            baseQuantity = modifier * 10; // 0-100 units
          }

          // Add some randomness (±30%)
          const randomFactor = 0.7 + Math.random() * 0.6;
          const quantity = Math.floor(baseQuantity * randomFactor);

          if (quantity > 0) {
            obj.marketState.inventory[goodName] = quantity;
            // Prices will be calculated dynamically when accessed
          }
        });
      };

      // Stock goods based on all productivity modifiers dynamically
      // This ensures planets with any productivity modifier get their relevant goods
      Object.keys(obj.productivityModifiers).forEach(modifierKey => {
        const modifier = obj.productivityModifiers[modifierKey] || 0;
        stockGoods(modifierKey, modifier);
      });

      // Stock general category goods at moderate levels on all markets
      if (categories.general) {
        categories.general.forEach(goodName => {
          const baseValue = goodsData[goodName].value;
          const goodType = goodsData[goodName].type;

          let baseQuantity = 0;
          if (goodType === 'raw') {
            baseQuantity = 100;
          } else if (goodType === 'intermediate') {
            baseQuantity = 50;
          } else if (goodType === 'finished') {
            baseQuantity = 25;
          }

          const randomFactor = 0.5 + Math.random();
          const quantity = Math.floor(baseQuantity * randomFactor);

          if (quantity > 0) {
            obj.marketState.inventory[goodName] = quantity;
            // Prices will be calculated dynamically when accessed
          }
        });
      }
    });
  }

  /**
   * Calculate dynamic market price for a good based on fuzzy logic
   * Considers: base value, local supply, production capability, and market type
   * @param {Object} stellarObject - The stellar object with the market
   * @param {string} goodName - Name of the good
   * @param {string} priceType - 'buy' (player buying from market) or 'sell' (player selling to market)
   * @returns {number} Calculated price per unit
   */
  calculateMarketPrice(stellarObject, goodName, priceType = 'buy') {
    logger.debug('[DEBUG calculateMarketPrice] stellarObject:', stellarObject?.id, 'goodName:', goodName, 'priceType:', priceType);
    const dataDir = this.settings.data_directory || 'data/default/en-us';
    const goodsData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', dataDir, 'goods.json'), 'utf-8'));
    const good = goodsData[goodName];

    if (!good) return 0;

    const baseValue = good.value;
    const category = good.category;
    const goodType = good.type;

    // Get current inventory level
    const currentStock = stellarObject.marketState?.inventory[goodName] || 0;

    // Determine production capability for this good
    const productivityModifier = stellarObject.productivityModifiers?.[category] || 0;
    logger.debug('[DEBUG calculateMarketPrice] baseValue:', baseValue, 'currentStock:', currentStock, 'productivityModifier:', productivityModifier);

    // Calculate ideal stock levels based on productivity and good type
    let idealStock = 0;
    if (category === 'general' || category === 'military') {
      // General goods have moderate ideal stock
      idealStock = goodType === 'raw' ? 100 : goodType === 'intermediate' ? 50 : 25;
    } else {
      // Category-specific goods based on productivity
      if (goodType === 'raw') {
        idealStock = productivityModifier * 50;
      } else if (goodType === 'intermediate') {
        idealStock = productivityModifier * 20;
      } else {
        idealStock = productivityModifier * 10;
      }
    }

    // Supply factor: how current stock compares to ideal
    // Low stock = higher prices, high stock = lower prices
    let supplyFactor = 1.0;
    if (idealStock > 0) {
      const stockRatio = currentStock / idealStock;

      if (stockRatio < 0.25) {
        // Very low supply: 1.5x to 2.0x price
        supplyFactor = 2.0 - (stockRatio * 2);
      } else if (stockRatio < 0.5) {
        // Low supply: 1.25x to 1.5x price
        supplyFactor = 1.5 - ((stockRatio - 0.25) * 1.0);
      } else if (stockRatio < 1.0) {
        // Below ideal: 1.0x to 1.25x price
        supplyFactor = 1.25 - ((stockRatio - 0.5) * 0.5);
      } else if (stockRatio < 2.0) {
        // Above ideal: 0.8x to 1.0x price
        supplyFactor = 1.0 - ((stockRatio - 1.0) * 0.2);
      } else {
        // Oversupply: 0.6x to 0.8x price
        supplyFactor = Math.max(0.6, 0.8 - ((stockRatio - 2.0) * 0.1));
      }
    } else if (currentStock > 0) {
      // No local production but have stock - slightly elevated prices
      supplyFactor = 1.2;
    } else {
      // No production, no stock - not available for purchase
      return 0;
    }

    // Production factor: local production capability affects price
    // High production = lower prices (abundant), low production = higher prices (imported)
    let productionFactor = 1.0;
    if (category !== 'general' && category !== 'military') {
      if (productivityModifier >= 8) {
        productionFactor = 0.7; // Excellent local production
      } else if (productivityModifier >= 6) {
        productionFactor = 0.85; // Good local production
      } else if (productivityModifier >= 4) {
        productionFactor = 1.0; // Moderate local production
      } else if (productivityModifier >= 2) {
        productionFactor = 1.15; // Limited local production
      } else if (productivityModifier > 0) {
        productionFactor = 1.3; // Very limited local production
      } else {
        productionFactor = 1.5; // No local production (imported goods)
      }
    }

    // Calculate final buy price
    let finalPrice = Math.round(baseValue * supplyFactor * productionFactor);
    logger.debug('[DEBUG calculateMarketPrice] supplyFactor:', supplyFactor, 'productionFactor:', productionFactor, 'finalPrice:', finalPrice);

    // For selling to the market, players get 50-80% of the buy price
    if (priceType === 'sell') {
      // Better deals when market has low stock (needs goods)
      // Worse deals when market has high stock (oversupplied)
      let sellRatio = 0.65; // Base 65% of buy price

      if (idealStock > 0) {
        const stockRatio = currentStock / idealStock;
        if (stockRatio < 0.5) {
          // Market desperately needs this good: 70-80%
          sellRatio = 0.8 - (stockRatio * 0.2);
        } else if (stockRatio < 1.0) {
          // Market wants this good: 65-70%
          sellRatio = 0.7 - ((stockRatio - 0.5) * 0.1);
        } else if (stockRatio < 2.0) {
          // Market somewhat oversupplied: 55-65%
          sellRatio = 0.65 - ((stockRatio - 1.0) * 0.1);
        } else {
          // Market very oversupplied: 50-55%
          sellRatio = Math.max(0.5, 0.55 - ((stockRatio - 2.0) * 0.025));
        }
      }

      finalPrice = Math.round(finalPrice * sellRatio);
    }

    logger.debug('[DEBUG calculateMarketPrice] FINAL PRICE:', finalPrice, 'for', goodName, priceType);
    return Math.max(1, finalPrice); // Minimum price of 1 credit
  }

  /**
   * Buy goods from a stellar object
   * @param {Object} player - The player making the purchase
   * @param {number} stellarObjectId - ID of the stellar object
   * @param {string} goodName - Name of the good to buy
   * @param {number} quantity - Quantity to buy
   * @param {number} price - Price per unit (optional, will be recalculated for verification)
   * @returns {Object} Result object with success status and message
   */
  buyGood(player, stellarObjectId, goodName, quantity, price) {
    const stellarObject = this.universe.stellarObjects.find(obj => obj.id === stellarObjectId);
    if (!stellarObject) {
      return { success: false, message: 'Stellar object not found' };
    }

    if (!stellarObject.marketState) {
      return { success: false, message: 'No market available at this location' };
    }

    // Check if good is available
    const availableQuantity = stellarObject.marketState.inventory[goodName] || 0;
    if (availableQuantity < quantity) {
      return { success: false, message: `Only ${availableQuantity} units available` };
    }

    // Calculate dynamic price
    const actualPrice = this.calculateMarketPrice(stellarObject, goodName, 'buy');
    const totalCost = quantity * actualPrice;

    if (!player.canAfford(totalCost)) {
      return { success: false, message: `Insufficient credits. Need ${totalCost} credits` };
    }

    // Calculate cargo space needed
    const dataDir = this.settings.data_directory || 'data/default/en-us';
    const goodsData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', dataDir, 'goods.json'), 'utf-8'));
    const good = goodsData[goodName];
    if (!good) {
      return { success: false, message: 'Unknown good' };
    }

    const mass = good.finishedMass.mass;
    const units = good.finishedMass.units;
    let cargoNeeded = 0;
    if (units === 'metric tons') {
      cargoNeeded = mass * quantity;
    } else if (units === 'kilograms') {
      cargoNeeded = (mass * quantity) / 1000;
    }

    // Check cargo capacity
    const currentCargo = this.calculateCargoUsed(player);
    const shipsData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', dataDir, 'ships.json'), 'utf-8'));
    const shipData = shipsData[player.ship];
    const cargoCapacity = shipData.cargoCapacity;

    if (currentCargo + cargoNeeded > cargoCapacity) {
      return { success: false, message: `Insufficient cargo space. Need ${cargoNeeded.toFixed(2)} tons, only ${(cargoCapacity - currentCargo).toFixed(2)} available` };
    }

    // Execute transaction
    player.removeCredits(totalCost);
    stellarObject.marketState.inventory[goodName] -= quantity;
    player.addCargo(goodName, quantity);

    return { success: true, message: `Bought ${quantity} units of ${good.label || goodName} for ${totalCost} credits` };
  }

  /**
   * Sell goods to a stellar object
   * @param {Object} player - The player making the sale
   * @param {number} stellarObjectId - ID of the stellar object
   * @param {string} goodName - Name of the good to sell
   * @param {number} quantity - Quantity to sell
   * @param {number} price - Price per unit (optional, will be recalculated for verification)
   * @returns {Object} Result object with success status and message
   */
  sellGood(player, stellarObjectId, goodName, quantity, price) {
    const stellarObject = this.universe.stellarObjects.find(obj => obj.id === stellarObjectId);
    if (!stellarObject) {
      return { success: false, message: 'Stellar object not found' };
    }

    if (!stellarObject.marketState) {
      return { success: false, message: 'No market available at this location' };
    }

    // Check if player has the goods
    const playerQuantity = player.getCargoQuantity(goodName);
    if (playerQuantity < quantity) {
      return { success: false, message: `You only have ${playerQuantity} units` };
    }

    // Calculate dynamic sell price (market buys at 50-80% of buy price based on supply)
    const actualPrice = this.calculateMarketPrice(stellarObject, goodName, 'sell');
    const totalRevenue = quantity * actualPrice;

    // Get good label for display
    const dataDir = this.settings.data_directory || 'data/default/en-us';
    const goodsData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', dataDir, 'goods.json'), 'utf-8'));
    const good = goodsData[goodName];

    // Execute transaction
    player.addCredits(totalRevenue);
    stellarObject.marketState.inventory[goodName] = (stellarObject.marketState.inventory[goodName] || 0) + quantity;
    player.removeCargo(goodName, quantity);

    return { success: true, message: `Sold ${quantity} units of ${good?.label || goodName} for ${totalRevenue} credits` };
  }

  /**
   * Calculate total cargo space used
   * @param {Object} player - The player whose cargo to calculate
   * @returns {number} Cargo space used in tons
   */
  calculateCargoUsed(player) {
    let cargoUsed = 0;
    const dataDir = this.settings.data_directory || 'data/default/en-us';
    const goodsData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', dataDir, 'goods.json'), 'utf-8'));

    for (const [goodName, quantity] of Object.entries(player.cargo)) {
      if (goodName === 'passengers') {
        cargoUsed += quantity / 10; // 10 people per ton
      } else {
        const good = goodsData[goodName];
        if (good && good.finishedMass) {
          const mass = good.finishedMass.mass;
          const units = good.finishedMass.units;
          if (units === 'metric tons') {
            cargoUsed += mass * quantity;
          } else if (units === 'kilograms') {
            cargoUsed += (mass * quantity) / 1000;
          }
        }
      }
    }

    return cargoUsed;
  }
}

module.exports = { Market };
