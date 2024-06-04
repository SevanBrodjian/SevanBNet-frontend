export default function homeAnimation(p) {
    const n = 3000;
    const dt = 0.01;
    const frictionHalfLife = 0.040;
    const rMax = 0.1;
    const m = 6;
    let matrix;
    const forceFactor = 10;
  
    let frictionFactor;
  
    const colors = new Int32Array(n);
    const positionsX = new Float32Array(n);
    const positionsY = new Float32Array(n);
    const velocitiesX = new Float32Array(n);
    const velocitiesY = new Float32Array(n);
  
    const gridSize = 0.1;
    let grid;
    let gridN;
    // const gridPositionsX = new Int32Array(n);
    // const gridPositionsY = new Int32Array(n);

    const mouseEffectRadius = 0.05;
    const mouseForceStrength = 2;
  
    p.setup = () => {
      p.createCanvas(p.windowWidth, p.windowHeight);
      p.noStroke();
      p.colorMode(p.HSB, 360, 100, 100);
      
      matrix = makeRandomMatrix();
      frictionFactor = p.pow(0.5, dt / frictionHalfLife);
      gridN = p.int(1.0 / gridSize) + 1;
      
      for (let i = 0; i < n; i++) {
        colors[i] = p.floor(p.random(m));
        positionsX[i] = p.random(1);
        positionsY[i] = p.random(1);
        velocitiesX[i] = 0;
        velocitiesY[i] = 0;
      }
      
      grid = Array.from({ length: gridN }, () => Array.from({ length: gridN }, () => []));
    };
  
    p.draw = () => {
      if ((p.width != p.windowWidth) || (p.height != p.windowHeight)){
        p.resizeCanvas(p.windowWidth, p.windowHeight);
      }
      console.log(p.width, p.windowWidth);


      p.background(0);
      
      updateGrid();
      
      updateParticles();
      
      for (let i = 0; i < n; i++) {
        p.fill(360 * colors[i] / m, 100, 100);
        p.ellipse(positionsX[i] * p.width, positionsY[i] * p.height, 5, 5);
      }
      
      // p.print(p.frameRate());
    };
  
    function makeRandomMatrix() {
      const rows = [];
      for (let i = 0; i < m; i++) {
        const row = [];
        for (let j = 0; j < m; j++) {
          row.push(p.random(-1, 1));
        }
        rows.push(row);
      }
      return rows;
    }
  
    function updateGrid() {
      grid = Array.from({ length: gridN }, () => Array.from({ length: gridN }, () => []));
      for (let i = 0; i < n; i++) {
        const gridX = p.int(positionsX[i] / gridSize);
        const gridY = p.int(positionsY[i] / gridSize);
        grid[gridX][gridY].push(i);
      }
    }
  
    function updateParticles() {
      for (let i = 0; i < n; i++) {
        let totalForceX = 0;
        let totalForceY = 0;
        
        const xposConst = p.constrain(positionsX[i], 0, 1);
        
        const thisGridX = p.int(xposConst / gridSize);
        const thisGridY = p.int(positionsY[i] / gridSize);
        
        for (let curGridX = thisGridX - 1; curGridX <= thisGridX + 1; curGridX++) {
          for (let curGridY = thisGridY - 1; curGridY <= thisGridY + 1; curGridY++) {
            let wrappedX = curGridX;
            let wrappedY = curGridY;
            if (wrappedX === -1) wrappedX = gridN - 1;
            if (wrappedX === gridN) wrappedX = 0;
            if (wrappedY === -1) wrappedY = gridN - 1;
            if (wrappedY === gridN) wrappedY = 0;
          
            grid[wrappedX][wrappedY].forEach((j) => {
              if (j === i) return;
              const rxReg = positionsX[j] - positionsX[i];
              const rxRight = positionsX[j] + 1 - positionsX[i];
              const rxLeft = positionsX[j] - 1 - positionsX[i];
              let rx;
              if (p.abs(rxReg) < p.abs(rxRight) && p.abs(rxReg) < p.abs(rxLeft)) rx = rxReg;
              else if (p.abs(rxRight) < p.abs(rxLeft)) rx = rxRight;  
              else rx = rxLeft;
              
              const ryReg = positionsY[j] - positionsY[i];
              const ryTop = positionsY[j] + 1 - positionsY[i];
              const ryBottom = positionsY[j] - 1 - positionsY[i];
              let ry;
              if (p.abs(ryReg) < p.abs(ryTop) && p.abs(ryReg) < p.abs(ryBottom)) ry = ryReg;
              else if (p.abs(ryTop) < p.abs(ryBottom)) ry = ryTop;
              else ry = ryBottom;
              
              const r = p.pow(rx * rx + ry * ry, 0.5);
              if (r > 0 && r < rMax) {
                const f = force(r / rMax, matrix[colors[i]][colors[j]]);
                totalForceX += rx / r * f;
                totalForceY += ry / r * f;
              }
            });
          }
        }

        const mouseX = p.mouseX / p.width;
        const mouseY = p.mouseY / p.height;
        const distToMouse = p.dist(mouseX, mouseY, positionsX[i], positionsY[i]);

        if (distToMouse < mouseEffectRadius && distToMouse > 0) {
            const dx = positionsX[i] - mouseX;
            const dy = positionsY[i] - mouseY;
            const distanceFactor = (mouseEffectRadius - distToMouse) / mouseEffectRadius;
            const forceMagnitude = mouseForceStrength * distanceFactor / (distToMouse * distToMouse);

            totalForceX += dx * forceMagnitude;
            totalForceY += dy * forceMagnitude;
        }
        
        totalForceX *= rMax * forceFactor;
        totalForceY *= rMax * forceFactor;
        
        velocitiesX[i] *= frictionFactor;
        velocitiesY[i] *= frictionFactor;
        
        velocitiesX[i] += totalForceX * dt;
        velocitiesY[i] += totalForceY * dt;
      }
      
      for (let i = 0; i < n; i++) {
        positionsX[i] += velocitiesX[i] * dt;
        positionsY[i] += velocitiesY[i] * dt;
        
        if (positionsX[i] < 0) positionsX[i] += 1;
        else if (positionsX[i] >= 1) positionsX[i] -= 1;
        
        if (positionsY[i] < 0) positionsY[i] += 1;
        else if (positionsY[i] >= 1) positionsY[i] -= 1;
      }
    }
  
    function force(r, a) {
      const beta = 0.3;
      if (r < beta) {
        return r / beta - 1;
      } else if (beta < r && r < 1) {
        return a * (1 - p.abs(2 * r - 1 - beta) / (1 - beta));
      } else {
        return 0;
      }
    }
  }
  