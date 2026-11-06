import {
  Connection,
  ConnectionState,
  ConnectionMode,
  ChannelName,
} from './Connection.js';

export interface RtcChunkHeader {
  messageId: number;
  chunkIndex: number;
  totalChunks: number;
}

export const RTC_MAX_CHUNK_SIZE = 56 * 1024; // 56 KB to stay safely below 64KB DataChannel limits

/**
 * Splits a binary buffer or string into chunked DataChannel packets with a 12-byte header:
 * [0..3]: uint32 messageId
 * [4..7]: uint32 chunkIndex
 * [8..11]: uint32 totalChunks
 * [12..]: payload slice
 */
export function chunkDataChannelMessage(
  data: Buffer | Uint8Array | string,
  messageId: number
): Uint8Array[] {
  let rawBytes: Uint8Array;
  if (typeof data === 'string') {
    rawBytes = Buffer.from(data, 'utf8');
  } else if (Buffer.isBuffer(data)) {
    rawBytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  } else {
    rawBytes = data;
  }

  const totalLength = rawBytes.byteLength;
  const totalChunks = Math.max(1, Math.ceil(totalLength / RTC_MAX_CHUNK_SIZE));
  const chunks: Uint8Array[] = [];

  for (let i = 0; i < totalChunks; i++) {
    const start = i * RTC_MAX_CHUNK_SIZE;
    const end = Math.min(start + RTC_MAX_CHUNK_SIZE, totalLength);
    const slice = rawBytes.subarray(start, end);

    const packet = new Uint8Array(12 + slice.byteLength);
    const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);

    view.setUint32(0, messageId, true);
    view.setUint32(4, i, true);
    view.setUint32(8, totalChunks, true);
    packet.set(slice, 12);

    chunks.push(packet);
  }

  return chunks;
}

/**
 * Reassembles chunked DataChannel packets into complete messages.
 */
export class RtcMessageReassembler {
  private pending = new Map<
    number,
    {
      totalChunks: number;
      receivedCount: number;
      chunks: (Uint8Array | null)[];
      totalBytes: number;
      timestamp: number;
    }
  >();

  public processChunk(packet: Uint8Array): Uint8Array | null {
    if (packet.byteLength < 12) {
      return null;
    }

    const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
    const messageId = view.getUint32(0, true);
    const chunkIndex = view.getUint32(4, true);
    const totalChunks = view.getUint32(8, true);
    const payload = packet.subarray(12);

    // Single chunk message fast-path
    if (totalChunks === 1 && chunkIndex === 0) {
      return payload;
    }

    let record = this.pending.get(messageId);
    if (!record) {
      record = {
        totalChunks,
        receivedCount: 0,
        chunks: new Array(totalChunks).fill(null),
        totalBytes: 0,
        timestamp: Date.now(),
      };
      this.pending.set(messageId, record);
    }

    if (chunkIndex < totalChunks && !record.chunks[chunkIndex]) {
      record.chunks[chunkIndex] = payload;
      record.receivedCount++;
      record.totalBytes += payload.byteLength;
    }

    // Check if message is fully reassembled
    if (record.receivedCount === record.totalChunks) {
      this.pending.delete(messageId);
      const fullMessage = new Uint8Array(record.totalBytes);
      let offset = 0;
      for (let i = 0; i < record.totalChunks; i++) {
        const slice = record.chunks[i];
        if (slice) {
          fullMessage.set(slice, offset);
          offset += slice.byteLength;
        }
      }
      return fullMessage;
    }

    // Cleanup stale incomplete messages (>15s old)
    const now = Date.now();
    for (const [id, r] of this.pending) {
      if (now - r.timestamp > 15000) {
        this.pending.delete(id);
      }
    }

    return null;
  }
}
