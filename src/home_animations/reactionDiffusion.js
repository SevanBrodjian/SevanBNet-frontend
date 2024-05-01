// homeAnimation.js
export default function homeAnimation(p) {
    let A, B, nextA, nextB;
    const dA = 1.0;
    const dB = 0.5;
    const f = 0.035;
    const k = 0.058;
    let scale = 5;
    let rows, cols;
    let isResizing = false;
    let mouseDown = false;

    let greenCol = p.random(255);
    const col1 = p.color(p.random(128, 255), greenCol, 0);
    const col2 = p.color(0, 255 - greenCol, p.random(128, 255));

    p.windowResized = () => {
        if ((p.abs(p.windowWidth - p.width) / p.width < 0.2)  && (p.abs(p.windowHeight - p.height) / p.height < 0.2))
            return;
 
        isResizing = true;
        p.resizeCanvas(p.windowWidth, p.windowHeight);
        scale = getScaleForScreenSize();
        initArrays();
        isResizing = false;
    };

    p.setup = function() {
        p.createCanvas(p.windowWidth, p.windowHeight);
        p.frameRate(10);
        scale = getScaleForScreenSize();
        p.noStroke();
        initArrays();
        
        for (let i = 0; i < 5; i++) {
            update();
        }
    };
 
    p.draw = function() {
        if (isResizing) {
            return;
        }

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                let col = p.lerpColor(col1, col2, A[r][c]);
                p.fill(col);
                p.rect(c * scale, r * scale, scale, scale);
            } 
        }

        for (let i = 0; i < 6; i++) {
            update();
        }


        if (mouseDown) {
            let mouseR = Math.floor(p.mouseX / scale);
            let mouseC = Math.floor(p.mouseY / scale);
            for (let x = -5; x < 6; x++) {
                for (let y = -5; y < 6; y++) {
                    if (p.abs(x) + p.abs(y) > 7)
                        continue;
                    let valX = p.constrain(mouseR + x, 0, cols-1);
                    let valY = p.constrain(mouseC + y, 0, rows-1);
                    A[valY][valX] = 0.0;
                    B[valY][valX] = 1.0;
                }
            }
        }
    };

    p.mousePressed = function() {
        mouseDown = true;
    }

    p.mouseReleased = function() {
        mouseDown = false;
    }

    function getScaleForScreenSize() {
        // return Math.floor(p.width / 215);
        if (p.width < 768) {
            return 6; // Small
        } else if (p.width >= 768 && p.width <= 1200) {
            return 10; // Medium
        } else {
            return 14; //Large
        }
    }

    function initArrays() {
        rows = Math.floor(p.height / scale);
        cols = Math.floor(p.width / scale);
        A = new Array(rows);
        B = new Array(rows);
        nextA = new Array(rows);
        nextB = new Array(rows);

        for (let r = 0; r < rows; r++) {
            A[r] = new Array(cols).fill(1.0);
            B[r] = new Array(cols).fill(0.0);
            nextA[r] = new Array(cols).fill(1.0);
            nextB[r] = new Array(cols).fill(0.0);

            for (let c = 0; c < cols; c++) {
                if (p.random(1) > 0.95) {
                    A[r][c] = 0.0;
                    B[r][c] = 1.0;
                }
            }
        }
    }

    function update() {
        // Temporary variables for storing wrapped indices
        let rN, rS, cE, cW;
    
        for (let r = 0; r < rows; r++) {
            // Compute north and south wrap indices once per row
            rN = (r - 1 + rows) % rows;
            rS = (r + 1) % rows;
    
            for (let c = 0; c < cols; c++) {
                // Compute east and west wrap indices once per column
                cE = (c + 1) % cols;
                cW = (c - 1 + cols) % cols;
    
                // Cache the central cell values
                let centralA = A[r][c];
                let centralB = B[r][c];
    
                // Compute next values using cached indices and values
                nextA[r][c] = centralA +
                              A[rN][cW] * dA * 0.05 +
                              A[rN][cE] * dA * 0.05 +
                              A[rS][cW] * dA * 0.05 +
                              A[rS][cE] * dA * 0.05 +
                              A[rN][c] * dA * 0.2 +
                              A[rS][c] * dA * 0.2 +
                              A[r][cW] * dA * 0.2 +
                              A[r][cE] * dA * 0.2 +
                              -centralA * dA -
                              centralA * centralB * centralB +
                              f * (1 - centralA);
    
                nextB[r][c] = centralB +
                              B[rN][cW] * dB * 0.05 +
                              B[rN][cE] * dB * 0.05 +
                              B[rS][cW] * dB * 0.05 +
                              B[rS][cE] * dB * 0.05 +
                              B[rN][c] * dB * 0.2 +
                              B[rS][c] * dB * 0.2 +
                              B[r][cW] * dB * 0.2 +
                              B[r][cE] * dB * 0.2 +
                              -centralB * dB +
                              centralA * centralB * centralB -
                              (f + k) * centralB;
    
                // Optionally, you might update A and B here directly
            }
        }
    
        // Update the actual arrays if not done in the main loop
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                A[r][c] = nextA[r][c];
                B[r][c] = nextB[r][c];
            }
        }
    }    
}