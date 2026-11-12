const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

function crc32(buf) {
  let crc = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i];
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const name = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([len, name, data, crc]);
}

function png(size, paint) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = paint(x, y, size);
      const i = row + 1 + x * 4;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function circle(x, y, cx, cy, r) {
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function rect(x, y, x0, y0, x1, y1) {
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

function color(on, rgb) {
  return on ? [...rgb, 255] : [0, 0, 0, 0];
}

const rust = [196, 92, 38];
const mute = [107, 94, 85];
const cream = [255, 250, 243];

function appIcon(x, y, s) {
  const c = (s - 1) / 2;
  if (!circle(x, y, c, c, s * 0.46)) return [0, 0, 0, 0];
  if (circle(x, y, c, c, s * 0.4)) {
    if (circle(x, y, c, c * 0.92, s * 0.18)) return [...cream, 255];
    if (rect(x, y, c - s * 0.22, c * 1.05, c + s * 0.22, c * 1.22) && circle(x, y, c, c * 1.08, s * 0.24)) {
      return [...cream, 255];
    }
    return [...rust, 255];
  }
  return [...rust, 255];
}

function eat(x, y, s, rgb) {
  const c = (s - 1) / 2;
  const bowl = circle(x, y, c, c * 1.15, s * 0.32) && y > c * 0.85;
  const rim = circle(x, y, c, c * 0.92, s * 0.28) && circle(x, y, c, c * 0.92, s * 0.16) === false && y < c * 1.05;
  const steam = circle(x, y, c, c * 0.42, s * 0.06);
  return color(bowl || rim || steam, rgb);
}

function listIcon(x, y, s, rgb) {
  const pad = s * 0.22;
  const h = s * 0.12;
  const gap = s * 0.18;
  const y0 = s * 0.26;
  const on =
    rect(x, y, pad, y0, s - pad, y0 + h) ||
    rect(x, y, pad, y0 + gap, s - pad, y0 + gap + h) ||
    rect(x, y, pad, y0 + gap * 2, s - pad * 1.4, y0 + gap * 2 + h);
  return color(on, rgb);
}

function gear(x, y, s, rgb) {
  const c = (s - 1) / 2;
  const hub = circle(x, y, c, c, s * 0.12);
  const ring = circle(x, y, c, c, s * 0.22) && !circle(x, y, c, c, s * 0.14);
  let tooth = false;
  for (let i = 0; i < 6; i += 1) {
    const a = (i * Math.PI) / 3;
    tooth = tooth || circle(x, y, c + Math.cos(a) * s * 0.26, c + Math.sin(a) * s * 0.26, s * 0.08);
  }
  return color(hub || ring || tooth, rgb);
}

function write(file, size, paint) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, png(size, paint));
}

write(path.join("build", "icon.png"), 256, appIcon);
const assets = path.join("miniprogram", "assets");
write(path.join(assets, "tab-eat.png"), 81, (x, y, s) => eat(x, y, s, mute));
write(path.join(assets, "tab-eat-on.png"), 81, (x, y, s) => eat(x, y, s, rust));
write(path.join(assets, "tab-places.png"), 81, (x, y, s) => listIcon(x, y, s, mute));
write(path.join(assets, "tab-places-on.png"), 81, (x, y, s) => listIcon(x, y, s, rust));
write(path.join(assets, "tab-set.png"), 81, (x, y, s) => gear(x, y, s, mute));
write(path.join(assets, "tab-set-on.png"), 81, (x, y, s) => gear(x, y, s, rust));
console.log("icons ready");
