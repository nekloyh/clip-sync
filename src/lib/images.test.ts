import { describe, it, expect } from 'vitest';
import {
  sniffImageType,
  isAllowedImageType,
  extensionFor,
  sanitizeFilename,
} from './images';

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => Array.from(text, (c) => c.charCodeAt(0));

describe('sniffImageType', () => {
  it('recognises the raster formats we accept', () => {
    expect(sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png');
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
    expect(sniffImageType(bytes(...ascii('GIF89a')))).toBe('image/gif');
    expect(sniffImageType(bytes(...ascii('BM'), 0x00, 0x00))).toBe('image/bmp');
    expect(sniffImageType(bytes(...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP')))).toBe('image/webp');
    expect(sniffImageType(bytes(0, 0, 0, 0x20, ...ascii('ftypavif')))).toBe('image/avif');
  });

  it('rejects SVG — it would run script on our own origin', () => {
    expect(sniffImageType(bytes(...ascii('<svg xmlns=')))).toBeNull();
    expect(sniffImageType(bytes(...ascii('<?xml version')))).toBeNull();
  });

  it('rejects HTML, scripts and truncated input', () => {
    expect(sniffImageType(bytes(...ascii('<!DOCTYPE html>')))).toBeNull();
    expect(sniffImageType(bytes(...ascii('#!/bin/sh')))).toBeNull();
    expect(sniffImageType(bytes())).toBeNull();
    expect(sniffImageType(bytes(0x89, 0x50))).toBeNull();
  });

  it('does not accept RIFF containers that are not WebP', () => {
    expect(sniffImageType(bytes(...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WAVE')))).toBeNull();
  });
});

describe('isAllowedImageType', () => {
  it('excludes svg and everything non-image', () => {
    expect(isAllowedImageType('image/png')).toBe(true);
    expect(isAllowedImageType('image/svg+xml')).toBe(false);
    expect(isAllowedImageType('text/html')).toBe(false);
    expect(isAllowedImageType('application/octet-stream')).toBe(false);
  });
});

describe('extensionFor', () => {
  it('maps each allowed type to a fixed extension', () => {
    expect(extensionFor('image/jpeg')).toBe('jpg');
    expect(extensionFor('image/png')).toBe('png');
    expect(extensionFor('image/webp')).toBe('webp');
  });
});

describe('sanitizeFilename', () => {
  it('drops directory components', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('C:\\Users\\me\\shot.png')).toBe('shot.png');
  });

  it('strips control characters and quotes that would break headers', () => {
    expect(sanitizeFilename('a\u0000b"c\'.png')).toBe('abc.png');
  });

  it('always returns something usable', () => {
    expect(sanitizeFilename('')).toBe('image');
    expect(sanitizeFilename('   ')).toBe('image');
    expect(sanitizeFilename('a'.repeat(500))).toHaveLength(120);
  });
});
