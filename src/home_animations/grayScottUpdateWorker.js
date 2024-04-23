// grayScottUpdateWorker.js
self.onmessage = function(e) {
    const data = e.data;

    const A = data.A;
    const B = data.B;
    const rows = A.len;
    const cols = A[-1].len;
    
    rows = Math.floor(height / scale);
    cols = Math.floor(width / scale);

    nextA = new Array(rows);
    nextB = new Array(rows);

    // Temporary variables for storing wrapped indices
    let rN, rS, cE, cW;
    
    for (let r = 0; r < rows; r++) {
        // Compute north and south wrap indices once per row
        rN = (r - 1 + rows) % rows;
        rS = (r + 1) % rows;

        nextA[r] = new Array(cols).fill(1.0);
        nextB[r] = new Array(cols).fill(0.0);

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
        }
    }

    self.postMessage({nextA: nextA, nextB: nextB});
}