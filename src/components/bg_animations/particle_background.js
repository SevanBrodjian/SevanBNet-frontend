export default function projectAnimation(p) {
  let particles = [];

  p.setup = () => {
    p.createCanvas(p.windowWidth - 15, p.windowHeight);
    p.frameRate(30);
    p.colorMode(p.HSB, 255);
    p.background(0);
  };

  function mulVecs(vectorA, vectorB) {
    return p.createVector(vectorA.x * vectorB.x, vectorA.y * vectorB.y);
  }

  p.draw = () => {
    // Clear the background more aggressively to avoid buildup, adjust alpha as needed
    p.background(30, 0, 0, 30);

    let forceDirection = p.createVector(p.mouseX - p.width / 2, p.mouseY - p.height / 2);
    forceDirection.normalize().mult(0.1); // Reduced force to cursor
    let drivingVector = p.createVector(0, 0.2);
    forceDirection.add(drivingVector);

    let numParts = 50;
    if (p.width <= 768) {
      numParts = 20;
    }

    // Reduce particle count
    if (particles.length < numParts) {
      particles.push(new Particle(forceDirection));
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      particles[i].attract(forceDirection);
      particles[i].update();
      particles[i].display();
      if (particles[i].isDead()) {
        particles.splice(i, 1);
      }
    }
  };

  class Particle {
    constructor(forceDirection) {
      this.position = p.createVector(p.random(p.width), p.random(p.height));
      this.prevPos = this.position.copy(); // New property to store the previous position
      this.velocity = forceDirection.mult(0.4); //p.createVector(p.random(-1, 1), p.random(-1, 1));
      this.acceleration = p.createVector();
      this.lifespan = 255;
      this.hue = p.random(255);
      let defSize = 1.5;
      if (p.width <= 768) {
        defSize = 0.75;
      }
      this.size = p.random(defSize, defSize*2.25);
    }

    attract(force) {
      this.acceleration.add(force);
    }

    update() {
      this.velocity.add(this.acceleration);
      this.prevPos = this.position.copy(); // Store the current position before updating it
      this.position.add(this.velocity);
      this.acceleration.mult(0.55);
      this.lifespan -= p.random(18); // They fade faster
      this.hue = (this.hue + 2) % 255; // Cycle hue values
    }

    display() {
      p.strokeWeight(this.size); // Make the line thicker
      p.stroke(this.hue, 255, 255, this.lifespan);
      p.line(this.position.x, this.position.y, this.prevPos.x, this.prevPos.y); // Draw a line from previous position to current position
      p.noStroke();
    }

    isDead() {
      return this.lifespan < 0;
    }
  }
}
