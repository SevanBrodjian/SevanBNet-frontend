// homeAnimation.js
export default function homeAnimation(p) {
    let particles = [];
    const insertDistance = 10;
    const repulsionDistance = insertDistance * 15;
    const k = 1;
    const maxParts = 1500;

    class Particle {
        constructor(x, y) {
            this.pos = p.createVector(x, y);
            this.vel = p.createVector(0, 0);
        }

        update(n) {
            let diff;
            let forces = p.createVector(0, 0);
            let distance;

            particles.forEach(particle => {
                if (particle != this) {
                    diff = particle.pos.copy();
                    diff.sub(this.pos);
                    distance = diff.mag();
                    if (distance < 1) distance = 1; // Prevent division by zero or extremely small distances
                    if (distance < repulsionDistance) {
                        // diff.normalize();
                        diff.mult(-k / (distance * distance)); // Apply k here to reduce magnitude
                        forces.add(diff);
                    }
                }
            });
            
            let neighbor = (n + 1) % particles.length;
            let temp = particles[neighbor];
            diff = temp.pos.copy();
            diff.sub(this.pos);
            distance = diff.mag();
            diff.normalize();
            if (distance < 1) distance = 1;
            diff.mult(1.0 / (distance * distance));
            if (distance < insertDistance * 0.5) {
                diff.mult(-1);
            }
            forces.add(diff);

            neighbor = (n - 1 + particles.length) % particles.length;
            temp = particles[neighbor];
            diff = temp.pos.copy();
            diff.sub(this.pos);
            distance = diff.mag();
            diff.normalize();
            if (distance < 1) distance = 1;
            diff.mult(1.0 / (distance * distance));
            if (distance < insertDistance * 0.5) {
                diff.mult(-1);
            }
            forces.add(diff);

            forces.mult(k);
            let acceleration = forces.copy();
            acceleration.div(1.0);
            this.vel.add(acceleration);
        }

        updatePosition() {
            this.pos.add(this.vel);
            this.vel.mult(0.7);
        }

        display() {
            p.fill(0, 0, 0); //'rgba(255, 255, 255, 0.5)');
            p.circle(this.pos.x, this.pos.y, 6);
        }
    }

    p.setup = () => {
        p.createCanvas(p.windowWidth, p.windowHeight);
        p.colorMode(p.HSB, 360, 100, 100);
                
        const particlesLength = 20;
        let radius = 40;
        let angle = 0;
        for (let i = 0; i < particlesLength; i++) {
            angle = p.map(i, 0, particlesLength, 0, 2*p.PI);
            particles.push(new Particle(0.5*p.width+radius*Math.cos(angle), 0.5*p.height+radius*Math.sin(angle)));
        }
        p.stroke(0, 100, 100);
    };

    p.draw = () => {
        p.background(0);

        for (let i = 0; i < particles.length; i++) {
            let p1 = particles[i];
            let p2 = particles[(i + 1) % particles.length];
            p.line(p1.pos.x, p1.pos.y, p2.pos.x, p2.pos.y);
            particles[i].display();
        }

        for (let i = 0; i < particles.length; i++) {
            particles[i].update(i);
        }

        particles.forEach(particle => {
            particle.updatePosition();
        });

        insert();
    };

    p.windowResized = () => {
        p.resizeCanvas(p.windowWidth, p.windowHeight);
    };

    function insert() {
        for (let i = 0; i < particles.length; i++) {
            let p1 = particles[i];
            let p2 = particles[(i + 1) % particles.length];
            let diff = p2.pos.copy();
            diff.sub(p1.pos);

            if ((diff.mag() > insertDistance) && (particles.length < maxParts)) {
                diff.mult(0.5);
                particles.splice((i + 1) % particles.length, 0, new Particle(p1.pos.x + diff.x, p1.pos.y + diff.y));
            }
        }
    }
}