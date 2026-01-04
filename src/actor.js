const { v4: uuidv4 } = require('uuid');

class actor {
  constructor(type, subtype, name, people, goodsList, xCoordinate, yCoordinate) {
    this.name = name;
    this.type = type;
    this.subtype = subtype;
    this.goods = goodsList;
    this.location.x = xCoordinate;
    this.location.y = yCoordinate;
    this.id = uuidv4();
    this.inventory = {};
    this.peopleLimit = people;
    this.age = 0;
  }
}

module.exports = actor;
