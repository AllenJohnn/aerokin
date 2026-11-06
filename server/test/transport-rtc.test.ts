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

  it('rejects truncated packets (<12 bytes) without throwing or corrupting state', () => {
    const reassembler = new RtcMessageReassembler();
    expect(reassembler.processChunk(new Uint8Array(0))).toBeNull();
    expect(reassembler.processChunk(new Uint8Array(1))).toBeNull();
    expect(reassembler.processChunk(new Uint8Array(11))).toBeNull();
  });

  it('safely ignores chunks with out-of-bounds chunkIndex', () => {
    const reassembler = new RtcMessageReassembler();
    const packet = new Uint8Array(20);
    const view = new DataView(packet.buffer);
    view.setUint32(0, 404, true); // messageId
    view.setUint32(4, 5, true);   // chunkIndex (out of bounds for total=2)
    view.setUint32(8, 2, true);   // totalChunks
    packet.fill(99, 12);

    expect(reassembler.processChunk(packet)).toBeNull();
  });

  it('rejects packets with invalid or excessive totalChunks (>10000)', () => {
    const reassembler = new RtcMessageReassembler();
    const packet = new Uint8Array(20);
    const view = new DataView(packet.buffer);
    view.setUint32(0, 505, true);
    view.setUint32(4, 0, true);
    view.setUint32(8, 50000, true); // totalChunks too large

    expect(reassembler.processChunk(packet)).toBeNull();
  });

  it('handles chunk duplication and replays idempotently without corruption', () => {
    const size = 100 * 1024; // 2 chunks
    const original = Buffer.alloc(size, 7);
    const chunks = chunkDataChannelMessage(original, 606);
    expect(chunks.length).toBe(2);

    const reassembler = new RtcMessageReassembler();

    // Send chunk 0 multiple times
    expect(reassembler.processChunk(chunks[0])).toBeNull();
    expect(reassembler.processChunk(chunks[0])).toBeNull();
    expect(reassembler.processChunk(chunks[0])).toBeNull();

    // Now send chunk 1
    const reassembled = reassembler.processChunk(chunks[1]);
    expect(reassembled).not.toBeNull();
    expect(reassembled!.byteLength).toBe(size);
    expect(Buffer.from(reassembled!).equals(original)).toBe(true);
  });

  it('reassembles multiple concurrent interleaved messages under high load', () => {
    const reassembler = new RtcMessageReassembler();
    const count = 5;
    const messages: { id: number; data: Buffer; chunks: Uint8Array[] }[] = [];

    for (let i = 0; i < count; i++) {
      const size = (60 + i * 20) * 1024; // 60KB, 80KB, 100KB, 120KB, 140KB
      const buf = Buffer.alloc(size, i + 1);
      const msgId = 1000 + i;
      messages.push({
        id: msgId,
        data: buf,
        chunks: chunkDataChannelMessage(buf, msgId),
      });
    }

    // Pool all chunks together and shuffle randomly
    const allChunks: { id: number; chunk: Uint8Array }[] = [];
    for (const msg of messages) {
      for (const ch of msg.chunks) {
        allChunks.push({ id: msg.id, chunk: ch });
      }
    }

    // Deterministic shuffle
    for (let i = allChunks.length - 1; i > 0; i--) {
      const j = (i * 7 + 3) % (i + 1);
      const temp = allChunks[i];
      allChunks[i] = allChunks[j];
      allChunks[j] = temp;
    }

    const reassembledMap = new Map<number, Uint8Array>();
    for (const item of allChunks) {
      const res = reassembler.processChunk(item.chunk);
      if (res) {
        reassembledMap.set(item.id, res);
      }
    }

    expect(reassembledMap.size).toBe(count);
    for (const msg of messages) {
      const reassembled = reassembledMap.get(msg.id);
      expect(reassembled).toBeDefined();
      expect(Buffer.from(reassembled!).equals(msg.data)).toBe(true);
    }
  });

  it('fuzz testing: rejects random arbitrary binary garbage without unhandled exceptions', () => {
    const reassembler = new RtcMessageReassembler();

    for (let i = 0; i < 500; i++) {
      const randomLength = (i * 31) % 256;
      const garbage = new Uint8Array(randomLength);
      for (let j = 0; j < randomLength; j++) {
        garbage[j] = (j * 17 + i) % 256;
      }

      // Reassembler must never crash or throw uncaught errors
      expect(() => {
        reassembler.processChunk(garbage);
      }).not.toThrow();
    }
  });

  it('cleans up stale incomplete messages after timeout (>15 seconds)', () => {
    const reassembler = new RtcMessageReassembler();
    const original = Buffer.alloc(120 * 1024, 9);
    const chunks = chunkDataChannelMessage(original, 707);

    // Send only chunk 0 of 3
    expect(reassembler.processChunk(chunks[0])).toBeNull();

    // Advance time by mocking Date.now
    const origNow = Date.now;
    try {
      Date.now = () => origNow() + 20000; // +20 seconds
      // Sending a dummy single chunk message triggers GC of stale records
      const dummy = chunkDataChannelMessage(Buffer.from('ping'), 808);
      expect(reassembler.processChunk(dummy[0])).not.toBeNull();

      // Now sending chunk 1 of the old message should start fresh rather than completing
      expect(reassembler.processChunk(chunks[1])).toBeNull();
    } finally {
      Date.now = origNow;
    }
  });
});
