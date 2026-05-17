// Stripped-down init for AsciiScreen fire animation.
// Original control-panel wiring (asciiart.eu) removed — fixed defaults only.
// Engine: animation.min.js © Injosoft.
(() => {
    "use strict";
    const el = document.getElementById("animation-output");
    if (!el || typeof AsciiScreen === "undefined") return;

    const CHARSETS = {
        classic: " .:-=+*#%@",
        blocks:  " ░▒▓█",
        sparks:  " .,*+xX#%"
    };
    const PALETTES = {
        classic: ["#ff1010","#ff5a1c","#ff8a26","#ffa838","#ffc04a","#ffd060","#ffdc78","#ffe690","#ffeea4","#fff8b0"],
        lava:    ["#000000","#1a0000","#3d0404","#600808","#8a1010","#b82020","#e04040","#f08060","#ffc0a0","#ffffff"]
    };

    const screen = new AsciiScreen(el, {
        mode: "palette",
        defaultRows: 40,
        minCols: 40, maxCols: 400,
        minRows: 20, maxRows: 200
    });

    const S = {
        running: true,
        targetFps: 22,
        intensity: 7,
        wind: 0,
        decay: 1,
        turbulence: 5,
        thickness: 1,
        embers: true,
        sparks: true,
        pulse: false,
        pulsePhase: 0,
        fireMode: "wall",
        paletteKey: "classic",
        charsetKey: "classic"
    };

    let seed = (0xdeadbeef ^ Date.now()) >>> 0;
    function rnd32() { let x = seed; x ^= x<<13; x>>>=0; x ^= x>>17; x>>>=0; x ^= x<<5; x>>>=0; seed=x; return x; }
    function rint(n) { return rnd32() % n | 0; }
    function rand() { return rnd32() / 4294967296; }

    let cols = 0, rows = 0, total = 0;
    let heat = null, noise = null;
    let buf = screen.buffer, color = screen.color;

    const EMAX = 256, embers = { x:new Float32Array(EMAX), y:new Float32Array(EMAX), vx:new Float32Array(EMAX), vy:new Float32Array(EMAX), life:new Float32Array(EMAX), count:0 };
    const SMAX = 128, sparks = { x:new Float32Array(SMAX), y:new Float32Array(SMAX), vx:new Float32Array(SMAX), vy:new Float32Array(SMAX), life:new Float32Array(SMAX), count:0 };
    let tClock = 0;

    function resize() {
        cols = screen.cols; rows = screen.rows; total = cols * rows;
        heat = new Float32Array(total);
        noise = new Float32Array(total);
        seedNoise();
        buf = screen.buffer; color = screen.color;
    }
    function seedNoise() {
        for (let i = 0; i < total; i++) noise[i] = 0.3 * rand();
        const tmp = new Float32Array(total);
        for (let p = 0; p < 2; p++) {
            for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
                let s = 0, c = 0;
                for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                    const nx = x+dx, ny = y+dy;
                    if (nx>=0 && nx<cols && ny>=0 && ny<rows) { s += noise[ny*cols+nx]; c++; }
                }
                tmp[y*cols+x] = s/c;
            }
            for (let i = 0; i < total; i++) noise[i] = tmp[i];
        }
    }

    function applyPalette() {
        screen.setMode("palette");
        screen.setPalette(PALETTES[S.paletteKey] || PALETTES.classic);
        buf = screen.buffer; color = screen.color;
    }

    function sources() { return [{ x: 0, w: cols }]; } // wall mode
    function inSource(x, src) { for (const s of src) if (x>=s.x && x<s.x+s.w) return true; return false; }

    function injectHeat() {
        const I = S.intensity, T = Math.min(S.thickness, rows-2), src = sources();
        let pulseMul = 1;
        if (S.pulse) pulseMul = 0.7 + 0.3*Math.sin(S.pulsePhase);
        for (let s = 0; s < T; s++) {
            const y = rows-1-s;
            for (let x = 0; x < cols; x++) {
                const i = y*cols+x;
                if (!inSource(x, src)) { heat[i] *= 0.3; continue; }
                const v = I*(0.6+0.4*rand())*pulseMul;
                const cool = 0.12 / Math.sqrt(T);
                if (rand() < cool) heat[i] = 0.7*heat[i];
                else heat[i] = Math.max(heat[i], v);
            }
        }
    }
    function injectFlames() {
        const src = sources();
        const tongues = rand() < 0.5 ? 1+rint(4) : 0;
        for (let t = 0; t < tongues; t++) {
            const s = src[rint(src.length)];
            const baseX = Math.floor(s.x + rand()*s.w);
            const h = 4+rint(8);
            const peak = 7+3*rand();
            for (let k = 0; k < h; k++) {
                const yy = rows-2-S.thickness-k;
                if (yy < 0) break;
                const w = 1.5*Math.sin(k/h*Math.PI);
                for (let dx = -w; dx <= w; dx++) {
                    const x = baseX + Math.round(dx + (rand()-0.5));
                    if (x>=0 && x<cols) {
                        const i = yy*cols+x;
                        const v = peak*(1 - k/h*0.5)*(0.6+0.4*rand());
                        heat[i] = Math.max(heat[i], v);
                    }
                }
            }
        }
    }
    function diffuse() {
        tClock += 0.02;
        const top = rows - S.thickness;
        const row = new Float32Array(cols);
        for (let y = 0; y < top; y++) {
            const yNorm = 1 - y/rows;
            row.fill(0);
            for (let x = 0; x < cols; x++) {
                const ys = y+1;
                if (ys >= rows) continue;
                let sx = x;
                if (S.wind !== 0) {
                    const shift = S.wind*yNorm*(0.5+0.3*rand());
                    sx = Math.max(0, Math.min(cols-1, Math.round(x+shift)));
                }
                let sum = 0, cnt = 0;
                sum += 3*heat[ys*cols+sx]; cnt += 3;
                if (sx>0)      { sum += 2*heat[ys*cols+(sx-1)]; cnt += 2; }
                if (sx<cols-1) { sum += 2*heat[ys*cols+(sx+1)]; cnt += 2; }
                if (sx>1)      { sum += heat[ys*cols+(sx-2)];   cnt += 1; }
                if (sx<cols-2) { sum += heat[ys*cols+(sx+2)];   cnt += 1; }
                if (ys+1<rows) { sum += heat[(ys+1)*cols+sx];   cnt += 1; }
                let v = sum/cnt;
                const cool = 0.2*S.decay;
                const ni = (y + Math.floor(10*tClock)) % rows * cols + x;
                v -= cool*(0.6 + noise[Math.abs(ni)%total] + 0.4*rand());
                v += (rand()-0.5)*yNorm*S.turbulence*0.12;
                row[x] = Math.max(0, Math.min(10, v));
            }
            for (let x = 0; x < cols; x++) heat[y*cols+x] = row[x];
        }
        for (let y = Math.max(0, rows-8); y < rows-1; y++)
            for (let x = 1; x < cols-1; x++) {
                const i = y*cols+x;
                heat[i] = 0.85*heat[i] + 0.075*(heat[i-1]+heat[i+1]);
            }
    }

    function spawnEmber() {
        if (!S.embers || embers.count >= EMAX || rows < 3) return;
        const src = sources();
        const p = 0.12 + 0.02*S.thickness + 0.01*S.intensity;
        if (rand() >= p) return;
        const s = src[rint(src.length)], i = embers.count++;
        embers.x[i] = s.x + rand()*s.w;
        embers.y[i] = rows - S.thickness - 1 - 3*rand();
        embers.life[i] = 0.8 + 1.5*rand();
        embers.vx[i] = 1.2*(rand()-0.5) - 0.08*S.wind;
        embers.vy[i] = -0.6 - 0.8*rand();
    }
    function updateEmbers(dt) {
        if (!S.embers || embers.count === 0) return;
        let w = 0;
        for (let i = 0; i < embers.count; i++) {
            embers.life[i] -= dt;
            if (embers.life[i] > 0) {
                embers.x[i] += embers.vx[i]*dt*30;
                embers.y[i] += embers.vy[i]*dt*30;
                embers.vx[i] += 0.5*(rand()-0.5) - 0.02*S.wind;
                embers.vy[i] -= 0.1;
                if (embers.y[i]>=0 && embers.x[i]>=0 && embers.x[i]<cols) {
                    if (w !== i) {
                        embers.x[w]=embers.x[i]; embers.y[w]=embers.y[i];
                        embers.vx[w]=embers.vx[i]; embers.vy[w]=embers.vy[i];
                        embers.life[w]=embers.life[i];
                    }
                    w++;
                }
            }
        }
        embers.count = w;
    }
    function spawnSparks() {
        if (!S.sparks || sparks.count >= SMAX || rows < 3) return;
        const src = sources();
        const p = 0.25 + 0.03*S.intensity;
        if (rand() >= p) return;
        const n = 1 + rint(3);
        for (let k = 0; k < n && sparks.count < SMAX; k++) {
            const s = src[rint(src.length)], i = sparks.count++;
            sparks.x[i] = s.x + rand()*s.w;
            sparks.y[i] = rows - S.thickness - 2 - 2*rand();
            sparks.life[i] = 0.25 + 0.35*rand();
            sparks.vx[i] = 3*(rand()-0.5) - 0.15*S.wind;
            sparks.vy[i] = -1.5 - 2.5*rand();
        }
    }
    function updateSparks(dt) {
        if (!S.sparks || sparks.count === 0) return;
        let w = 0;
        for (let i = 0; i < sparks.count; i++) {
            sparks.life[i] -= dt;
            if (sparks.life[i] > 0) {
                sparks.x[i] += sparks.vx[i]*dt*30;
                sparks.y[i] += sparks.vy[i]*dt*30;
                sparks.vx[i] += 2*(rand()-0.5) - 0.05*S.wind;
                sparks.vy[i] += 0.3;
                if (sparks.y[i]>=0 && sparks.x[i]>=0 && sparks.x[i]<cols) {
                    if (w !== i) {
                        sparks.x[w]=sparks.x[i]; sparks.y[w]=sparks.y[i];
                        sparks.vx[w]=sparks.vx[i]; sparks.vy[w]=sparks.vy[i];
                        sparks.life[w]=sparks.life[i];
                    }
                    w++;
                }
            }
        }
        sparks.count = w;
    }

    function render() {
        const chars = CHARSETS[S.charsetKey] || CHARSETS.classic;
        const last = chars.length - 1;
        if (buf !== screen.buffer) buf = screen.buffer;
        if (color !== screen.color) color = screen.color;
        for (let i = 0; i < total; i++) {
            const v = heat[i];
            const idx = Math.min(last, Math.floor(v*last/9 + 0.5));
            buf[i] = chars[idx] || " ";
            color[i] = Math.min(9, Math.floor(v));
        }
        if (S.embers && embers.count > 0) {
            for (let k = 0; k < embers.count; k++) {
                const x = Math.floor(embers.x[k]), y = Math.floor(embers.y[k]);
                if (x>=0 && x<cols && y>=0 && y<rows) {
                    const i = y*cols+x;
                    buf[i] = embers.life[k] > 0.3 ? "*" : ".";
                    color[i] = embers.life[k] > 0.5 ? 9 : 7;
                }
            }
        }
        if (S.sparks && sparks.count > 0) {
            for (let k = 0; k < sparks.count; k++) {
                const x = Math.floor(sparks.x[k]), y = Math.floor(sparks.y[k]);
                if (x>=0 && x<cols && y>=0 && y<rows) {
                    const i = y*cols+x;
                    buf[i] = "'";
                    color[i] = 9;
                }
            }
        }
        screen.renderToElement();
    }

    function warmUp() {
        const iters = rows * 8;
        for (let i = 0; i < iters; i++) {
            injectHeat();
            injectFlames();
            diffuse();
        }
    }

    screen.onResize = (c, r) => { cols=c; rows=r; resize(); warmUp(); render(); };

    applyPalette();
    resize();
    warmUp();
    render();

    let last = 0, acc = 0;
    requestAnimationFrame(function loop(t) {
        if (!S.running) { requestAnimationFrame(loop); return; }
        if (!last) last = t;
        let dt = (t-last)/1000; last = t; if (dt > 0.1) dt = 0.1;
        const step = 1/Math.max(0.5, Math.min(60, S.targetFps));
        acc += dt;
        let n = 0;
        while (acc >= step && n < 4) {
            injectHeat(); injectFlames(); diffuse();
            spawnEmber(); updateEmbers(step);
            spawnSparks(); updateSparks(step);
            if (S.pulse) S.pulsePhase += 3*step;
            acc -= step; n++;
        }
        render();
        requestAnimationFrame(loop);
    });
})();
