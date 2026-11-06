import { describe, it, expect } from 'vitest';
import {
  chunkDataChannelMessage,
  RtcMessageReassembler,
  RTC_MAX_CHUNK_SIZE,
} from '../src/transport/RtcTransport.js';

describe('WebRTC DataChannel Chunking & Reassembly Suite', () => {
  it('delivers small payloads (<56KB) in a single chunk with zero fragmentation', () => {
    const payload = Buffer.from('Hello AeroKin WebRTC DataChannel!');
    const chunks = chunkDataChannelMessage(payload, 101);

    expect(chunks.length).toBe(1);
    expect(chunks[0].byteLength).toBe(12 + payload.length);

    const reassembler = new RtcMessageReassembler();
    const result = reassembler.processChunk(chunks[0]);

    expect(result).not.toBeNull();
    expect(Buffer.from(result!).toString('utf8')).toBe('Hello AeroKin WebRTC DataChannel!');
  });

  it('fragments large payloads (>56KB) and reassembles into byte-identical buffer', () => {
    // 150 KB test buffer
    const size = 150 * 1024;
    const original = Buffer.alloc(size);
    for (let i = 0; i < size; i++) {
      original[i] = i % 256;
    }

    const chunks = chunkDataChannelMessage(original, 202);
    const expectedChunks = Math.ceil(size / RTC_MAX_CHUNK_SIZE);
    expect(chunks.length).toBe(expectedChunks);

    const reassembler = new RtcMessageReassembler();
    let reassembled: Uint8Array | null = null;

    for (let i = 0; i < chunks.length; i++) {
      const res = reassembler.processChunk(chunks[i]);
      if (i < chunks.length - 1) {
        expect(res).toBeNull();
      } else {
        reassembled = res;
      }
    }

    expect(reassembled).not.toBeNull();
    expect(reassembled!.byteLength).toBe(size);
    expect(Buffer.from(reassembled!).equals(original)).toBe(true);
  });

  it('correctly reassembles chunks received out of order', () => {
    const size = 120 * 1024; // 3 chunks
    const original = Buffer.alloc(size, 42);

    const chunks = chunkDataChannelMessage(original, 303);
    expect(chunks.length).toBe(3);

    // Feed in out-of-order: chunk 1, chunk 2, then chunk 0
    const reassembler = new RtcMessageReassembler();
    expect(reassembler.processChunk(chunks[1])).toBeNull();
    expect(reassembler.processChunk(chunks[2])).toBeNull();

    const reassembled = reassembler.processChunk(chunks[0]);
    expect(reassembled).not.toBeNull();
    expect(reassembled!.byteLength).toBe(size);
    expect(Buffer.from(reassembled!).equals(original)).toBe(true);
  });
});
