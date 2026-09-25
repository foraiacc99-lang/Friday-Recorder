import fs from 'fs';

/**
 * Utility to patch or inject the EBML Duration element into a WebM recording file.
 * Chromium's MediaRecorder omits the duration header because it records as a streaming container.
 * Injecting the duration allows Windows Media Player, VLC, QuickTime, and ffprobe
 * to display the exact duration and seek accurately.
 */
export class WebmPatcher {
  /**
   * Patches duration in milliseconds into a WebM file on disk.
   */
  public static patchDuration(filePath: string, durationMs: number): boolean {
    try {
      if (!fs.existsSync(filePath) || durationMs <= 0) {
        return false;
      }

      const fileBuffer = fs.readFileSync(filePath);
      const patchedBuffer = this.injectDuration(fileBuffer, durationMs);

      if (patchedBuffer !== fileBuffer) {
        fs.writeFileSync(filePath, patchedBuffer);
        return true;
      }

      return false;
    } catch (err) {
      console.warn(`[WebmPatcher] Could not patch duration for ${filePath}:`, err);
      return false;
    }
  }

  /**
   * Pure buffer transformation inserting or updating EBML Duration element.
   */
  public static injectDuration(buffer: Buffer, durationMs: number): Buffer {
    // Look for Segment Info ID: 0x15, 0x49, 0xA9, 0x66
    const infoSignature = Buffer.from([0x15, 0x49, 0xa9, 0x66]);
    const infoIndex = buffer.indexOf(infoSignature);
    if (infoIndex === -1) {
      return buffer;
    }

    // Check if Duration (0x44, 0x89) is already present in Info segment (search up to 300 bytes)
    const durationSignature = Buffer.from([0x44, 0x89]);
    const existingDurationIndex = buffer.indexOf(durationSignature, infoIndex);

    if (existingDurationIndex !== -1 && existingDurationIndex < infoIndex + 300) {
      const floatLen = buffer[existingDurationIndex + 2];
      if (floatLen === 0x84 || floatLen === 4) {
        buffer.writeFloatBE(durationMs, existingDurationIndex + 3);
        return buffer;
      } else if (floatLen === 0x88 || floatLen === 8) {
        buffer.writeDoubleBE(durationMs, existingDurationIndex + 3);
        return buffer;
      }
    }

    // If Duration is not in Info, insert it into the Info element
    // Info element header: [15 49 A9 66] [VINT size] [content...]
    const pos = infoIndex + 4;
    const firstByte = buffer[pos];
    if (firstByte === undefined) return buffer;

    let vintLen = 1;
    while ((firstByte & (0x80 >> (vintLen - 1))) === 0 && vintLen < 8) {
      vintLen++;
    }

    let infoSize = firstByte & ((1 << (8 - vintLen)) - 1);
    for (let i = 1; i < vintLen; i++) {
      const b = buffer[pos + i];
      if (b !== undefined) {
        infoSize = (infoSize << 8) | b;
      }
    }

    const infoHeaderLen = 4 + vintLen;
    const insertPos = infoIndex + infoHeaderLen;

    // EBML Duration element:
    // ID: 0x44 0x89 (2 bytes)
    // Length VINT: 0x88 (8 bytes)
    // Value: 8-byte IEEE 754 double precision float
    const durationElem = Buffer.alloc(11);
    durationElem[0] = 0x44;
    durationElem[1] = 0x89;
    durationElem[2] = 0x88;
    durationElem.writeDoubleBE(durationMs, 3);

    const newInfoSize = infoSize + 11;
    const newBuffer = Buffer.concat([
      buffer.subarray(0, insertPos),
      durationElem,
      buffer.subarray(insertPos),
    ]);

    // Re-encode info size VINT
    if (vintLen === 1 && newInfoSize < 127) {
      newBuffer[infoIndex + 4] = 0x80 | newInfoSize;
    } else {
      const mask = 0x80 >> (vintLen - 1);
      let temp = newInfoSize;
      for (let i = vintLen - 1; i >= 0; i--) {
        newBuffer[infoIndex + 4 + i] = temp & 0xff;
        temp >>= 8;
      }
      const existing = newBuffer[infoIndex + 4];
      if (existing !== undefined) {
        newBuffer[infoIndex + 4] = existing | mask;
      }
    }

    return newBuffer;
  }
}
