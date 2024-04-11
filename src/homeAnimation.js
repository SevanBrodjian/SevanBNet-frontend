// homeAnimation.js
export default function homeAnimation(p) {
    let particles = [];
  
    class Particle {
        constructor() {
            this.pos = p.createVector(p.random(p.width), p.random(p.height));
            this.vel = p.createVector(p.random(-2, 2), p.random(-2, 2));
            this.size = 10;
        }
  
        update() {
            this.pos.add(this.vel);
            this.edges();
        }
  
        display() {
            p.noStroke();
            p.fill('rgba(255, 255, 255, 0.5)');
            p.circle(this.pos.x, this.pos.y, this.size);
        }
  
        edges() {
            if (this.pos.x < 0 || this.pos.x > p.width) {
                this.pos.x = p.constrain(this.pos.x, 0, p.width);
                this.vel.x *= -1;
            }
  
            if (this.pos.y < 0 || this.pos.y > p.height) {
                this.pos.y = p.constrain(this.pos.y, 0, p.height);
                this.vel.y *= -1;
            }
        }
    }
  
    p.setup = () => {
        p.createCanvas(p.windowWidth, p.windowHeight);
        const particlesLength = Math.min(Math.floor(window.innerWidth / 10), 100); // Adjust for number of particles based on screen width
        for (let i = 0; i < particlesLength; i++) {
            particles.push(new Particle());
        }
    };
  
    p.draw = () => {
        p.background(55, 100, 144);
        particles.forEach(particle => {
            particle.update();
            particle.display();
        });
    };
  
    p.windowResized = () => {
        p.resizeCanvas(p.windowWidth, p.windowHeight);
    };
  }