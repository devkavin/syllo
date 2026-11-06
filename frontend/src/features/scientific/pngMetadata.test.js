import { crc32 } from "node:zlib";
import { Buffer } from "node:buffer";
import { expect, it } from "vitest";
import { embedPngMetadata } from "./pngMetadata";

it("embeds Unicode license credits as a valid PNG iTXt chunk without changing pixels", () => {
  const original = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2v8AAAAASUVORK5CYII=", "base64"));
  const metadata = { author: "Cléber-Gomes", license: "CC0-1.0", attribution: "H₂O → Δψ" };
  const result = embedPngMetadata(original, metadata);
  const length = new DataView(result.buffer).getUint32(33);
  expect(new TextDecoder().decode(result.subarray(37, 41))).toBe("iTXt");
  const payload = new TextDecoder().decode(result.subarray(41, 41 + length));
  expect(JSON.parse(payload.slice(payload.indexOf("{") ))).toEqual(metadata);
  expect(new DataView(result.buffer).getUint32(41 + length)).toBe(crc32(result.subarray(37, 41 + length)));
  expect(result.subarray(0, 33)).toEqual(original.subarray(0, 33));
  expect(result.subarray(45 + length)).toEqual(original.subarray(33));
});

it("rejects an invalid image instead of producing a corrupt download", () => {
  expect(() => embedPngMetadata(new Uint8Array(50), {})).toThrow("Invalid PNG");
});
