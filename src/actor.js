const { v4: uuidv4 } = require('uuid');

class actor {
  constructor(type, subtype, name, people, goodsList, xcoordinate, ycoordinate) {
    this.name = name;
    this.type = type;
    this.subtype = subtype;
    this.goods = goodsList;
    this.location.x = xcoordinate;
    this.location.y = ycoordinate;
    this.id = uuidv4();
    this.inventory = {};
    this.peopleLimit = people;
    this.age = 0;
  }

  /**
   * Called on each cycle of the clock to update the current stocks.
   */
  tick() {
    this.age += 1;
  }
}

module.exports = actor;
