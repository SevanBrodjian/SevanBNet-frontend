// homeAnimation.js
export default function homeAnimation(p) {
    const workerCode = `
        self.onmessage = function(e) {
            const { A, B, rows, cols, dA, dB, f, k } = e.data;
            let rN, rS, cE, cW;

            let bufA = new Array(rows);
            let bufB = new Array(rows);
            for (let r = 0; r < rows; r++) {
                bufA[r] = new Array(cols);
                bufB[r] = new Array(cols);
                for (let c = 0; c < cols; c++) {
                    bufA[r][c] = A[r][c];
                    bufB[r][c] = B[r][c];
                }
            }
            let count = 4;
            let nextA;
            let nextB;

            for (let i = 0; i < count; i++) {
                nextA = new Array(rows);
                nextB = new Array(rows);

                for (let r = 0; r < rows; r++) {
                    nextA[r] = new Array(cols);
                    nextB[r] = new Array(cols);
                    rN = (r - 1 + rows) % rows;
                    rS = (r + 1) % rows;

                    for (let c = 0; c < cols; c++) {
                        cE = (c + 1) % cols;
                        cW = (c - 1 + cols) % cols;

                        const centralA = bufA[r][c];
                        const centralB = bufB[r][c];

                        nextA[r][c] = centralA +
                                    (bufA[rN][cW] + bufA[rN][cE] + bufA[rS][cW] + bufA[rS][cE] +
                                    bufA[rN][c] * 4 + bufA[rS][c] * 4 +
                                    bufA[r][cW] * 4 + bufA[r][cE] * 4) * dA * 0.05 -
                                    centralA * dA - centralA * centralB * centralB + f * (1 - centralA);

                        nextB[r][c] = centralB +
                                    (bufB[rN][cW] + bufB[rN][cE] + bufB[rS][cW] + bufB[rS][cE] +
                                    bufB[rN][c] * 4 + bufB[rS][c] * 4 +
                                    bufB[r][cW] * 4 + bufB[r][cE] * 4) * dB * 0.05 -
                                    centralB * dB + centralA * centralB * centralB - (f + k) * centralB;
                    }
                }
                if (i < count - 1) {
                    for (let r = 0; r < rows; r++) {
                        for (let c = 0; c < cols; c++) {
                            bufA[r][c] = nextA[r][c];
                            bufB[r][c] = nextB[r][c];
                        }
                    }
                }
            }

            self.postMessage({nextA, nextB});
        }
    `;
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const updateWorker = new Worker(URL.createObjectURL(blob));

    let A, B, nextA, nextB;
    const dA = 1.0;
    const dB = 0.5;
    const f = 0.035;
    const k = 0.058;
    let scale = 5;
    let rows, cols;
    let isResizing = false;
    let gotDataFromWorker = false;

    let greenCol = p.random(255);
    const col1 = p.color(p.random(128, 255), greenCol, 0);
    const col2 = p.color(0, 255 - greenCol, p.random(128, 255));

    p.windowResized = () => {
        if (p.abs(p.windowWidth - p.width) / p.width < 0.2) 
            return;
 
        isResizing = true;
        p.resizeCanvas(p.windowWidth, p.windowHeight);
        scale = getScaleForScreenSize();
        initArrays();
        isResizing = false;
    };

    p.setup = function() {
        p.createCanvas(p.windowWidth, p.windowHeight);
        scale = getScaleForScreenSize();
        p.noStroke();
        initArrays();

        updateWorker.onmessage = function(event) {
            const { nextA, nextB } = event.data;
            gotDataFromWorker = true;
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    A[r][c] = nextA[r][c];
                    B[r][c] = nextB[r][c];
                }
            }
        };
        console.log(A.length);
        updateWorker.postMessage({ A, B, rows, cols, dA, dB, f, k });
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

        if (gotDataFromWorker) {
            updateWorker.postMessage({ A, B, rows, cols, dA, dB, f, k });
            gotDataFromWorker = false;
        }
    };

    function getScaleForScreenSize() {
        // return Math.floor(p.width / 215);
        if (p.width < 768) {
            return 3; // Small
        } else if (p.width >= 768 && p.width <= 1200) {
            return 6; // Medium
        } else {
            return 10; //Large
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
}
