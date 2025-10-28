import { PNG } from "pngjs";

// --- Catmull-Rom cubic kernel (Keys, B=0, C=0.5)
function catrom(x) {
  const t = Math.abs(x),
    t2 = t * t,
    t3 = t2 * t;
  if (t < 1) return 1.5 * t3 - 2.5 * t2 + 1;
  if (t < 2) return -0.5 * t3 + 2.5 * t2 - 4 * t + 2;
  return 0;
}
// Linear (Triangle) kernel
const triangle = (x) => {
  const t = Math.abs(x);
  return t < 1 ? 1 - t : 0;
};

function precomputeTaps(srcSize, dstSize, kernel) {
  const scale = srcSize / dstSize;
  const taps = new Array(dstSize);
  for (let j = 0; j < dstSize; j++) {
    const s = (j + 0.5) * scale - 0.5;
    const base = Math.floor(s);
    const idx = [
      Math.max(0, Math.min(srcSize - 1, base - 1)),
      Math.max(0, Math.min(srcSize - 1, base + 0)),
      Math.max(0, Math.min(srcSize - 1, base + 1)),
      Math.max(0, Math.min(srcSize - 1, base + 2)),
    ];
    const d0 = s - (base - 1);
    const d1 = s - (base + 0);
    const d2 = s - (base + 1);
    const d3 = s - (base + 2);
    const w = [kernel(d0), kernel(d1), kernel(d2), kernel(d3)];
    const sum = w[0] + w[1] + w[2] + w[3] || 1;
    taps[j] = { idx, w: [w[0] / sum, w[1] / sum, w[2] / sum, w[3] / sum] };
  }
  return taps;
}

function resizePlanar(src, srcW, srcH, dstW, dstH, kernel) {
  const tapsX = precomputeTaps(srcW, dstW, kernel);
  const tapsY = precomputeTaps(srcH, dstH, kernel);

  // Horizontal pass
  const tmp = new Float32Array(dstW * srcH);
  for (let y = 0; y < srcH; y++) {
    const rowSrc = y * srcW;
    const rowTmp = y * dstW;
    for (let x = 0; x < dstW; x++) {
      const { idx, w } = tapsX[x];
      tmp[rowTmp + x] =
        src[rowSrc + idx[0]] * w[0] +
        src[rowSrc + idx[1]] * w[1] +
        src[rowSrc + idx[2]] * w[2] +
        src[rowSrc + idx[3]] * w[3];
    }
  }

  // Vertical pass
  const out = new Uint8Array(dstW * dstH);
  for (let y = 0; y < dstH; y++) {
    const { idx: iy, w } = tapsY[y];
    for (let x = 0; x < dstW; x++) {
      const c0 = iy[0] * dstW + x;
      const c1 = iy[1] * dstW + x;
      const c2 = iy[2] * dstW + x;
      const c3 = iy[3] * dstW + x;
      let v = tmp[c0] * w[0] + tmp[c1] * w[1] + tmp[c2] * w[2] + tmp[c3] * w[3];
      v = Math.round(v);
      out[y * dstW + x] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }
  return out;
}

/**
 * Resize PNG without premultiplying alpha (Catmull-Rom for RGB, Triangle for A).
 * @param {Buffer|Uint8Array} pngBytes
 * @param {{width?:number,height?:number}} size
 * @returns {Buffer} PNG bytes
 */
export function resizePng(pngBytes, { width, height }) {
  const {
    width: srcW,
    height: srcH,
    data,
  } = PNG.sync.read(
    Buffer.isBuffer(pngBytes) ? pngBytes : Buffer.from(pngBytes)
  );
  if (!width && !height) throw new Error("Provide width and/or height");
  if (!width) width = Math.round(srcW * (height / srcH));
  if (!height) height = Math.round(srcH * (width / srcW));

  // Split to planar
  const npx = srcW * srcH;
  const R = new Uint8Array(npx),
    G = new Uint8Array(npx),
    B = new Uint8Array(npx),
    A = new Uint8Array(npx);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    R[p] = data[i];
    G[p] = data[i + 1];
    B[p] = data[i + 2];
    A[p] = data[i + 3];
  }

  // Resize: RGB with Catmull-Rom, Alpha with Triangle (no overshoot/brightening)
  const r2 = resizePlanar(R, srcW, srcH, width, height, catrom);
  const g2 = resizePlanar(G, srcW, srcH, width, height, catrom);
  const b2 = resizePlanar(B, srcW, srcH, width, height, catrom);
  const a2 = resizePlanar(A, srcW, srcH, width, height, triangle);

  // Interleave & encode
  const out = new PNG({ width, height, colorType: 6, bitDepth: 8 });
  out.data = Buffer.alloc(width * height * 4);
  for (let p = 0, i = 0; p < width * height; p++, i += 4) {
    out.data[i] = r2[p];
    out.data[i + 1] = g2[p];
    out.data[i + 2] = b2[p];
    out.data[i + 3] = a2[p];
  }
  return PNG.sync.write(out);
}
