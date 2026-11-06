// PNG iTXt retains UTF-8 attribution even when a browser blocks a second download.
// The image data is unchanged; metadata is inserted immediately after IHDR.
export function embedPngMetadata(bytes, metadata) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!(bytes instanceof Uint8Array) || bytes.length < 33 || signature.some((n, i) => bytes[i] !== n)) throw new Error("Invalid PNG export");
  const payload = new TextEncoder().encode(`Description\0\0\0\0\0${JSON.stringify(metadata)}`);
  const type = new TextEncoder().encode("iTXt");
  const chunk = new Uint8Array(payload.length + 12);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, payload.length); chunk.set(type, 4); chunk.set(payload, 8);
  let crc = 0xffffffff;
  for (const byte of chunk.subarray(4, 8 + payload.length)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  view.setUint32(8 + payload.length, (crc ^ 0xffffffff) >>> 0);
  const result = new Uint8Array(bytes.length + chunk.length);
  result.set(bytes.subarray(0, 33)); result.set(chunk, 33); result.set(bytes.subarray(33), 33 + chunk.length);
  return result;
}
