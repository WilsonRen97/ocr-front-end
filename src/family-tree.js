// each person has a name, a parent, list of siblings, list of children
// an array of 4 ints, representing a bounding box [x1, y1, width, height]
class Person {
  constructor(name, boundingBox) {
    this.name = name;
    this.boundingBox = boundingBox; // [x1, y1, width, height]
    this.parent = null;
    this.siblings = [];
    this.children = [];
  }

  setParent(parent) {
    this.parent = parent;
    if (!parent.children.includes(this)) parent.children.push(this);
  }

  addSibling(sibling) {
    if (sibling === this) return; // 不要加自己

    if (!this.siblings.includes(sibling)) this.siblings.push(sibling);
    if (!sibling.siblings.includes(this)) sibling.siblings.push(this);

    // 所有兄弟姊妹都要互相加進彼此的 siblings
    this.siblings.forEach((sib) => {
      if (sib !== sibling && !sib.siblings.includes(sibling))
        sib.siblings.push(sibling);
      if (sib !== sibling && !sibling.siblings.includes(sib))
        sibling.siblings.push(sib);
    });

    // 同步父母資訊
    if (!this.parent && sibling.parent) {
      this.parent = sibling.parent;
    }
    if (this.parent && !sibling.parent) {
      sibling.parent = this.parent;
    }
  }

  addChild(child) {
    if (!this.children.includes(child)) this.children.push(child);
    child.parent = this;
  }
}
class FamilyTree {
  constructor() {
    this.people = {};
  }

  addPerson(name, boundingBox) {
    if (!this.people[name]) {
      this.people[name] = new Person(name, boundingBox);
    }
    return this.people[name];
  }

  getPerson(name) {
    return this.people[name];
  }
  getAllPeople() {
    return Object.values(this.people);
  }

  printTree() {
    for (let personName in this.people) {
      const person = this.people[personName];
      console.log(`Person: ${person.name}`);
      if (person.parent) {
        console.log(`  Parent: ${person.parent.name}`);
      }
      if (person.siblings.length > 0) {
        console.log(
          `  Siblings: ${person.siblings.map((sib) => sib.name).join(", ")}`
        );
      }
      if (person.children.length > 0) {
        console.log(
          `  Children: ${person.children.map((child) => child.name).join(", ")}`
        );
      }
    }
  }
}

module.exports.Person = Person;
module.exports.FamilyTree = FamilyTree;
