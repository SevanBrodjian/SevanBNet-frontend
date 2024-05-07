export default function homeAnimation(p) {
    let NUM_POINTS = 1000;
    let points = [];
    let numProperties = 6;
    // let t = 0;
    let epsilon = 0.00001;
    let maxQuadSize = 200;
    let QT;
  
    // Universal Properties
    let numElementary;
    let G;
    // let R;
    let densityDistance;
    let maxForce;
    let speedColoring;
    let maxDensity;
    let explosionForce;
    let initialSpread;
  
    p.setup = () => {
      p.createCanvas(p.windowWidth, p.windowHeight);
      p.noStroke();
  
      // Initialize Universe
      numElementary = p.round(p.random(2, 10));
      G = p.random(0.01, 0.4);
      // R = p.random(20);
      densityDistance = 20;
      maxForce = 4;
      speedColoring = p.random(3, 15);
      maxDensity = p.random(80, 120);
      explosionForce = p.int(p.random(50, 150));
      initialSpread = p.random(0.05, 0.35);
  
      // Create Elementary Particles
      let elementaryParticles = Array.from({
          length: numElementary
        },
        () => new Array(numProperties)
      );
      for (let i = 0; i < numElementary; i++) {
        elementaryParticles[i][0] = p.random(2, 10) * (p.int(p.random(0, 2)) * 2 - 1); // weight
        elementaryParticles[i][1] = p.random(0.3); // decay
        elementaryParticles[i][2] = p.round(p.random(100, 255)); // col
        elementaryParticles[i][3] = p.random(-15, 15); // charge
        elementaryParticles[i][4] = p.random(0.2); // excitability
        elementaryParticles[i][5] = p.random(-2, 2); // spin
      }
  
      // Initialize Points
      for (let i = 0; i < NUM_POINTS; i++) {
        let particleClass = p.int(p.random(numElementary));
        let properties = elementaryParticles[particleClass];
        points[i] = new Point(properties);
      }
  
      QT = new QuadTree(0.0, 0.0, p.width, p.height);
      points.forEach((p) => {
        QT.insert(p); 
      });
    };
  
    p.draw = () => {
      p.background(0);
  
      // Calculate QuadTree
      QT = new QuadTree(0.0, 0.0, p.width, p.height);
      points.forEach((p) => {
        QT.insert(p);
      });
  
      // Calculate Point Interactions
      points.forEach((p) => {
        let neighbors = QT.query(p);
        p.interact(neighbors);
        p.update();
      });
  
      points.forEach((p) => {
        p.drawPoint();
      });
  
      // p.print(p.frameRate());
    };
  
    class Point {
      constructor(properties) {
        this.xpos = p.random(p.width / 2 - p.width * initialSpread, p.width / 2 + p.width * initialSpread);
        this.ypos = p.random(p.height / 2 - p.height * initialSpread, p.height / 2 + p.height * initialSpread);
        this.xvel = p.random(-explosionForce, explosionForce);
        this.yvel = p.random(-explosionForce, explosionForce);
        this.density = 0;
  
        this.weight = properties[0];
        this.decay = properties[1];
        this.col = properties[2];
        this.charge = properties[3];
        this.excitability = properties[4];
        this.spin = properties[5];
      }
  
      interact(neighbors) {
        let force = p.createVector(0, 0);
  
        neighbors.forEach((n) => {
          let d = p.dist(this.xpos, this.ypos, n.xpos, n.ypos);
          let direction = p.createVector(n.xpos - this.xpos, n.ypos - this.ypos);
          direction.normalize();
  
          let gravityForce = direction.copy().mult(G * this.weight * n.weight / (d + epsilon));
          force.add(gravityForce);
  
          let chargeForce = direction.copy().mult(this.charge * n.charge / (d + epsilon));
          force.add(chargeForce);
  
          let magneticForce = direction.copy().mult((this.spin * n.spin) / (d + epsilon));
          force.add(magneticForce);
  
          if (d < densityDistance) {
            this.density += n.weight;
          }
        });
  
        let densityForce = p.createVector(p.random(-1, 1), p.random(-1, 1)).normalize();
        densityForce.mult(this.excitability * this.density * this.density / (maxDensity * maxDensity));
        force.add(densityForce);
  
        force.limit(maxForce);
  
        if (this.density > maxDensity && p.random(1) > 0.9) {
          let expPower = 15 * this.density / maxDensity;
          force.add(p.createVector(p.random(-expPower, expPower), p.random(-expPower, expPower)));
        }
  
        this.xvel += force.x;
        this.yvel += force.y;
      }
  
      update() {
        this.xpos += this.xvel;
        this.ypos += this.yvel;
        if (this.xpos < 0 || this.xpos > p.width) this.xvel *= -1;
        if (this.ypos < 0 || this.ypos > p.height) this.yvel *= -1;
  
        this.xpos = p.constrain(this.xpos, 0, p.width);
        this.ypos = p.constrain(this.ypos, 0, p.height);
  
        this.xvel *= 1 - this.decay;
        this.yvel *= 1 - this.decay;
      }
  
      drawPoint() {
        let speedColor = (p.abs(this.xvel) + p.abs(this.yvel)) / speedColoring;
        let densityColor = this.density / maxDensity;
        p.fill(speedColor * 255, this.col, densityColor * 255);
        p.ellipse(this.xpos, this.ypos, p.abs(this.weight), p.abs(this.weight));
      }
    }
    
    // The QuadTree class would similarly be modified to use instance-specific calls, like p.createVector.
    class QuadTree {
        constructor(xLoc, yLoc, xDim, yDim) {
          this.xLoc = xLoc;
          this.yLoc = yLoc;
          this.xDim = xDim;
          this.yDim = yDim;
          
          this.northwest = null;
          this.northeast = null;
          this.southwest = null;
          this.southeast = null;
          
          this.quadPoints = [];
          this.leaf = true;
        }
        
        insert(p) {
          if (this.leaf) {
            if (this.quadPoints.length < maxQuadSize) {
              this.quadPoints.push(p);
            } else {
              this.subdivide();
              this.insertIntoSubtrees(p);
            }
          } else {
            this.insertIntoSubtrees(p);
          }
        }
        
        subdivide() {
          this.northwest = new QuadTree(this.xLoc, this.yLoc, this.xDim / 2, this.yDim / 2);
          this.northeast = new QuadTree(this.xLoc + this.xDim / 2, this.yLoc, this.xDim / 2, this.yDim / 2);
          this.southwest = new QuadTree(this.xLoc, this.yLoc + this.yDim / 2, this.xDim / 2, this.yDim / 2);
          this.southeast = new QuadTree(this.xLoc + this.xDim / 2, this.yLoc + this.yDim / 2, this.xDim / 2, this.yDim / 2);
          
          while (this.quadPoints.length > 0) {
            let p = this.quadPoints.pop();
            this.insertIntoSubtrees(p);
          }
          this.leaf = false;
        }
        
        insertIntoSubtrees(p) {
          if (p.xpos > (this.xLoc + this.xDim / 2)) {
            if (p.ypos > (this.yLoc + this.yDim / 2)) {
              this.northeast.insert(p); // Northeast
            } else {
              this.southeast.insert(p); // Southeast
            }
          } else {
            if (p.ypos > (this.yLoc + this.yDim / 2)) {
              this.northwest.insert(p); // Northwest
            } else {
              this.southwest.insert(p); // Southwest
            }
          }
        }
        
        query(p) {
          if (this.leaf) {
            return this.quadPoints;
          } else {
            if (p.xpos > (this.xLoc + this.xDim / 2)) {
              if (p.ypos > (this.yLoc + this.yDim / 2)) {
                return this.northeast.query(p); // Northeast
              } else {
                return this.southeast.query(p); // Southeast
              }
            } else {
              if (p.ypos > (this.yLoc + this.yDim / 2)) {
                return this.northwest.query(p); // Northwest
              } else {
                return this.southwest.query(p); // Southwest
              }
            }
          }
        }
      }
      
}
  