const fs = require('fs');
const path = require('path');
const { StellarObject } = require('./stellarObject');

/**
 * Get list of image files from a directory
 * @param {string} imageDir - Directory path relative to data directory
 * @param {string} dataDir - Data directory path (defaults to data/default/en-us)
 * @returns {string[]} Array of image paths
 */
function getImagesFromDirectory(imageDir, dataDir = 'data/default/en-us') {
  try {
    const fullPath = path.join(__dirname, '..', dataDir, imageDir);
    if (!fs.existsSync(fullPath)) {
      console.warn(`Image directory not found: ${imageDir}`);
      return [];
    }
    const files = fs.readdirSync(fullPath);
    return files
      .filter(file => /\.(jpg|jpeg|png|gif)$/i.test(file))
      .map(file => path.join(imageDir, file).replace(/\\/g, '/'));
  } catch (error) {
    console.error(`Error reading image directory ${imageDir}:`, error);
    return [];
  }
}

/**
 * Generic loader for JSON data files in the configured data directory.
 * @param {string} fileName - The name of the JSON file to load (without extension).
 * @param {string} dataDirectory - Optional data directory path (defaults to data/default/en-us).
 * @returns {Object} The parsed JSON data.
 */
function loadDataFile(fileName, dataDirectory = 'data/default/en-us') {
  const dataFile = path.join(__dirname, '..', dataDirectory, `${fileName}.json`);
  return JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
}

/**
 * Represents a Universe in Universe Market Builder.
 */
class Universe {
  constructor() {
    this.systems = [];
    this.stellarObjects = [];
  }

  /**
   * Returns an object mapping each system id to a count of each type of stellar object it contains.
   * Example return:
   * {
   *   1: { Planet: 2, Asteroid: 1 },
   *   2: { Planet: 1 },
   *   ...
   * }
   */
  getStellarObjectTypeCountsBySystem() {
    const counts = {};
    this.systems.forEach(system => {
      counts[system.id] = {};
    });
    this.stellarObjects.forEach(obj => {
      const sysId = obj.location;
      const type = obj.type;
      if (!counts[sysId]) counts[sysId] = {};
      if (!counts[sysId][type]) counts[sysId][type] = 0;
      counts[sysId][type]++;
    });
    return counts;
  }

  /**
   * Returns an object mapping each stellar object type to the total count in the universe.
   * Example return:
   * { Planet: 10, Asteroid: 5 }
   */
  getStellarObjectTypeTotals() {
    const totals = {};
    this.stellarObjects.forEach(obj => {
      if (!totals[obj.type]) totals[obj.type] = 0;
      totals[obj.type]++;
    });
    return totals;
  }

  /**
   * Finds the shortest path between two systems using Dijkstra's algorithm
   * Returns the path with minimum total tick cost
   * @param {number} startSystemId - The starting system ID
   * @param {number} targetSystemId - The target system ID
   * @returns {Object|null} Object with {path: number[], cost: number} or null if no path exists
   */
  findShortestPath(startSystemId, targetSystemId) {
    if (startSystemId === targetSystemId) {
      return { path: [startSystemId], cost: 0 };
    }

    // Initialize distances and previous nodes
    const distances = {};
    const previous = {};
    const unvisited = new Set();

    // Set all distances to infinity except start
    this.systems.forEach(system => {
      distances[system.id] = system.id === startSystemId ? 0 : Infinity;
      previous[system.id] = null;
      unvisited.add(system.id);
    });

    while (unvisited.size > 0) {
      // Find unvisited node with minimum distance
      let currentId = null;
      let minDistance = Infinity;
      for (const id of unvisited) {
        if (distances[id] < minDistance) {
          minDistance = distances[id];
          currentId = id;
        }
      }

      // If no reachable unvisited nodes remain
      if (currentId === null || minDistance === Infinity) {
        break;
      }

      // Remove current from unvisited
      unvisited.delete(currentId);

      // If we reached the target, reconstruct path
      if (currentId === targetSystemId) {
        const path = [];
        let node = targetSystemId;
        while (node !== null) {
          path.unshift(node);
          node = previous[node];
        }
        return { path, cost: distances[targetSystemId] };
      }

      // Update distances to neighbors
      const currentSystem = this.systems.find(s => s.id === currentId);
      if (!currentSystem) continue;

      for (const [neighborIdStr, cost] of Object.entries(currentSystem.connections)) {
        const neighborId = Number(neighborIdStr);
        if (!unvisited.has(neighborId)) continue;

        const newDistance = distances[currentId] + cost;
        if (newDistance < distances[neighborId]) {
          distances[neighborId] = newDistance;
          previous[neighborId] = currentId;
        }
      }
    }

    return null; // No path found
  }
}

/**
 * Represents a star system in the universe.
 */
class System {
  constructor(id, name) {
    this.id = id;
    this.name = name;
    this.connections = {}; // Map of systemId -> tick cost for jump to that system
    this.image = ''; // Will be set during universe creation
  }
}

/**
 * Gets a random image for a stellar object type
 * @param {string} type - Type of stellar object
 * @param {string} className - Class of stellar object
 * @param {object} stellarObjectsData - The stellar objects data from stellarObjects.json
 * @param {string} dataDir - Data directory path (defaults to data/default/en-us)
 * @returns {string} Path to image
 */
function getRandomImage(type, className, stellarObjectsData, dataDir = 'data/default/en-us') {
  const typeData = stellarObjectsData[type];
  if (!typeData || !typeData.classes) {
    console.warn(`No type data found for: ${type}`);
    return '';
  }

  const classData = typeData.classes[className];
  if (!classData || !classData.imagePath) {
    console.warn(`No image path found for type: ${type}, class: ${className}`);
    return '';
  }

  const imageDir = classData.imagePath;
  const imageList = getImagesFromDirectory(imageDir, dataDir);
  if (imageList.length === 0) {
    console.warn(`No images found in directory: ${imageDir}`);
    return '';
  }

  const randomIndex = Math.floor(Math.random() * imageList.length);
  return path.join(dataDir, imageList[randomIndex]).replace(/\\/g, '/');
}

/**
 * Gets a landed/docked image for a stellar object (surface or port)
 * @param {string} type - Type of stellar object
 * @param {string} className - Class of stellar object
 * @param {object} stellarObjectsData - The stellar objects data from stellarObjects.json
 * @param {string} dataDir - Data directory path (defaults to data/default/en-us)
 * @returns {string} Path to landed/port image
 */
function getLandedImage(type, className, stellarObjectsData, dataDir = 'data/default/en-us') {
  const typeData = stellarObjectsData[type];
  if (!typeData || !typeData.classes) {
    console.warn(`No type data found for: ${type}`);
    return '';
  }

  const classData = typeData.classes[className];
  if (!classData || !classData.imagePath) {
    console.warn(`No image path found for type: ${type}, class: ${className}`);
    return '';
  }

  // Determine subfolder based on type: planets use "Surface", stations and asteroids use "Port"
  const subfolder = type === 'Planet' ? 'Surface' : 'Port';
  const imageDir = path.join(classData.imagePath, subfolder).replace(/\\/g, '/');

  const imageList = getImagesFromDirectory(imageDir, dataDir);
  if (imageList.length === 0) {
    console.warn(`No landed images found in directory: ${imageDir}`);
    return '';
  }

  const randomIndex = Math.floor(Math.random() * imageList.length);
  return path.join(dataDir, imageList[randomIndex]).replace(/\\/g, '/');
}

/**
 * Creates a new Universe instance.
 * @param {number} systemCount - Number of star systems in the universe.
 * @param {number} connectionCount - Number of connections between systems.
 * @param {number} objectsCount - Number of objects (e.g., planets, stations).
 * @returns {Universe} The created Universe instance.
 */
// Create a set of used names to avoid duplicates (module scope for test access)
const usedPlanetNames = new Set();
const usedStationNames = new Set();

/**
 * Get a random unique name for a stellar object
 * @param {string} type - The type of object (Planet, Space Station, Asteroid)
 * @param {object} typeDetails - The stellar object type details from stellarObjects.json
 * @returns {string} A unique name for the object
 */
function getUniqueName(type, typeDetails) {
  // These must be loaded each call to ensure fresh data for tests
  const planetNamesData = loadDataFile('planet_names');
  const stationNamesData = loadDataFile('station_names');
  let nameList, usedNames;
  // Determine which name source to use
  const nameSource = typeDetails?.nameSource;

  if (nameSource === 'planets') {
    nameList = planetNamesData?.names;
    usedNames = usedPlanetNames;
  } else if (nameSource === 'stations') {
    nameList = stationNamesData?.names;
    usedNames = usedStationNames;
  } else {
    // For types without name data, generate a generic name
    return `${type} ${Math.floor(Math.random() * 1000000)}`;
  }

  // If name data is missing, fall back to generic name
  if (!nameList || !Array.isArray(nameList) || nameList.length === 0) {
    return `${type} ${Math.floor(Math.random() * 1000000)}`;
  }

  // Get a random name that hasn't been used yet
  let name;
  let attempts = 0;
  do {
    name = nameList[Math.floor(Math.random() * nameList.length)];
    attempts++;
  } while (usedNames.has(name) && attempts < 100);

  usedNames.add(name);
  return name;
}

function createUniverse(systemCount, connectionCount, objectsCount) {
  const universe = new Universe();
  const settings = loadDataFile('game_settings');
  const dataDir = settings.data_directory || 'data/default/en-us';
  const stellarObjectsData = loadDataFile('stellarObjects', dataDir);
  const planetNamesData = loadDataFile('planet_names', dataDir);
  const stationNamesData = loadDataFile('station_names', dataDir);

  // Create systems starting from 1
  for (let i = 1; i <= systemCount; i++) {
    universe.systems.push(new System(i, `System ${i}`));
  }

  // Shuffle systems to ensure all are connected in a chain
  const shuffled = universe.systems.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  // Connect each system to the next in the shuffled list
  for (let i = 0; i < shuffled.length - 1; i++) {
    const sysA = shuffled[i];
    const sysB = shuffled[i + 1];
    const tickCost = Math.floor(Math.random() * 20) + 1; // Random 1-20
    if (!sysA.connections[sysB.id]) {
      sysA.connections[sysB.id] = tickCost;
    }
    if (!sysB.connections[sysA.id]) {
      sysB.connections[sysA.id] = tickCost;
    }
  }

  let remainingConnections = connectionCount - (systemCount - 1);

  // Sort systems by id for consistent random selection
  universe.systems.sort((a, b) => a.id - b.id);

  // Add remaining random connections
  while (remainingConnections > 0) {
    const first = universe.systems[Math.floor(Math.random() * universe.systems.length)];
    const second = universe.systems[Math.floor(Math.random() * universe.systems.length)];
    if (first.id === second.id) continue;
    if (first.connections[second.id]) continue;
    const tickCost = Math.floor(Math.random() * 20) + 1; // Random 1-20
    first.connections[second.id] = tickCost;
    second.connections[first.id] = tickCost;
    remainingConnections--;
  }


  // Add required objects to system one (home system)
  let objectId = 0;
  if (settings.starting_system && settings.starting_system.required_objects) {
    settings.starting_system.required_objects.forEach(required => {
      const typeDetails = stellarObjectsData[required.type];
      const name = getUniqueName(required.type, typeDetails);
      const obj = new StellarObject(
        objectId++,
        required.type,
        required.class,
        1,
        typeDetails,
        name,
        dataDir
      );
      // System 1 objects use specific images based on type
      if (obj.type === 'Planet') {
        obj.landedImage = path.join(dataDir, 'images/stellar_objects/System1Surface.jpg').replace(/\\/g, '/');
      } else if (obj.type === 'Space Station' || obj.type === 'Asteroid') {
        obj.landedImage = path.join(dataDir, 'images/stellar_objects/System1Port.jpg').replace(/\\/g, '/');
      }
      universe.stellarObjects.push(obj);
    });
  }

  // Create remaining stellar objects and assign to random systems (avoiding system 1)
  const stellarTypes = Object.keys(stellarObjectsData);
  const remainingObjects = objectsCount - objectId;

  // Check if we need to ensure a Farm World exists outside system 1
  const needsFarmWorld = systemCount > 1 && remainingObjects > 0;
  let farmWorldCreated = false;

  for (let i = 0; i < remainingObjects; i++) {
    // Randomly select a type and class
    let type, className;

    // On the first iteration, create a Farm World if needed
    if (needsFarmWorld && i === 0) {
      type = 'Planet';
      className = 'Farm World';
      farmWorldCreated = true;
    } else {
      type = stellarTypes[Math.floor(Math.random() * stellarTypes.length)];
      const typeDetails = stellarObjectsData[type];
      const classNames = Object.keys(typeDetails.classes);
      className = classNames[Math.floor(Math.random() * classNames.length)];
    }

    const typeDetails = stellarObjectsData[type];

    // Assign to random system (but not system 1)
    const location = Math.floor(Math.random() * (systemCount - 1)) + 2;

    const name = getUniqueName(type, typeDetails);
    const obj = new StellarObject(objectId++, type, className, location, typeDetails, name, dataDir);

    // Assign landed/port image
    obj.landedImage = getLandedImage(type, className, stellarObjectsData, dataDir);

    universe.stellarObjects.push(obj);

    // Add an image for the system.
    const imagePath = getRandomImage(type, className, stellarObjectsData, dataDir);
    universe.systems.find(s => s.id === location).image = imagePath;

  }

  // Set system 1 image
  const system1 = universe.systems.find(s => s.id === 1);
  if (system1) {
    system1.image = path.join(dataDir, 'images/stellar_objects/System1.jpg').replace(/\\/g, '/');
  }

  // Get starfield images for systems without objects
  const starfieldImages = getImagesFromDirectory('images/stellar_objects/Starfields', dataDir);

  universe.systems.forEach(system => {
    if (system.id === 1) return; // Skip system 1, already set

    const hasObjects = universe.stellarObjects.some(obj => obj.location === system.id);
    if (!hasObjects && starfieldImages.length > 0) {
      const randomIndex = Math.floor(Math.random() * starfieldImages.length);
      system.image = path.join(dataDir, starfieldImages[randomIndex]).replace(/\\/g, '/');
    }
  });

  return universe;
}

module.exports = {
  Universe,
  System,
  StellarObject,
  createUniverse,
  getUniqueName,
  getRandomImage,
  getLandedImage
}
