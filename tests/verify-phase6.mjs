import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import {
  MediaImportService,
  MediaProbe,
  MediaStorage,
  ThumbnailGenerator,
} from '../dist-electron/main/media.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('=====================================================');
console.log('FRIDAY RECORDER — PHASE 6: MEDIA IMPORT VERIFICATION');
console.log('=====================================================\n');

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passCount++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failCount++;
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runVerification() {
  const service = new MediaImportService();

  // Find real recordings produced by Friday Recorder Phase 5
  const oneDriveDocs = path.join(os.homedir(), 'OneDrive', 'Documents', 'Friday Recorder', 'Recordings');
  const localDocs = path.join(os.homedir(), 'Documents', 'Friday Recorder', 'Recordings');
  const recordingsDir = fs.existsSync(oneDriveDocs) ? oneDriveDocs : localDocs;

  console.log(`📁 Scanning for Phase 5 recordings in: ${recordingsDir}`);
  assert(fs.existsSync(recordingsDir), `Recordings directory exists at: ${recordingsDir}`);

  const recordingFiles = fs.readdirSync(recordingsDir).filter((f) => f.endsWith('.webm'));
  assert(recordingFiles.length > 0, `Found ${recordingFiles.length} real Phase 5 recordings`);

  const primaryTestRecording = path.join(recordingsDir, 'Friday_Recording_2026-09-26_20-43-16.webm');
  assert(fs.existsSync(primaryTestRecording), `Primary test recording exists: ${path.basename(primaryTestRecording)}`);

  console.log('\n--- ITEM 1 & 3: REAL PHASE 5 RECORDING IMPORT & RAW FFPROBE PARITY ---');
  // Run raw ffprobe to obtain ground truth
  const rawProbeCmd = `ffprobe -v error -show_format -show_streams -print_format json "${primaryTestRecording}"`;
  const rawProbeOutput = execSync(rawProbeCmd, { encoding: 'utf-8' });
  const rawProbeJson = JSON.parse(rawProbeOutput);

  console.log('Raw ffprobe streams summary:');
  const rawVideoStream = rawProbeJson.streams.find((s) => s.codec_type === 'video');
  const rawAudioStream = rawProbeJson.streams.find((s) => s.codec_type === 'audio');
  console.log(`  Raw Video: codec=${rawVideoStream.codec_name}, ${rawVideoStream.width}x${rawVideoStream.height}`);
  console.log(`  Raw Audio: codec=${rawAudioStream?.codec_name}, channels=${rawAudioStream?.channels}, rate=${rawAudioStream?.sample_rate}`);
  console.log(`  Raw Container: format=${rawProbeJson.format.format_name}, duration=${rawProbeJson.format.duration}s, size=${rawProbeJson.format.size} bytes`);

  // Import into Friday Recorder MediaImportService
  const importedItem = await service.importFile(primaryTestRecording);
  console.log('\nImported Media Item Metadata:');
  console.dir(importedItem.metadata, { depth: null });

  assert(importedItem.fileName === path.basename(primaryTestRecording), 'Item filename matches');
  assert(importedItem.metadata.videoCodec === rawVideoStream.codec_name, `Video codec matches raw probe (${importedItem.metadata.videoCodec})`);
  assert(importedItem.metadata.width === rawVideoStream.width, `Width matches raw probe (${importedItem.metadata.width})`);
  assert(importedItem.metadata.height === rawVideoStream.height, `Height matches raw probe (${importedItem.metadata.height})`);
  assert(importedItem.metadata.audioCodec === rawAudioStream.codec_name, `Audio codec matches raw probe (${importedItem.metadata.audioCodec})`);
  assert(importedItem.metadata.audioChannels === rawAudioStream.channels, `Audio channels match raw probe (${importedItem.metadata.audioChannels})`);
  assert(importedItem.metadata.audioSampleRate === parseInt(rawAudioStream.sample_rate, 10), `Audio sample rate matches raw probe (${importedItem.metadata.audioSampleRate} Hz)`);
  assert(importedItem.metadata.fps === 60, `FPS correctly normalized from WebM container (${importedItem.metadata.fps} FPS)`);
  assert(importedItem.isAvailable === true, 'Imported file status isAvailable is true');

  console.log('\n--- ITEM 4: THUMBNAIL GENERATION & CACHE VALIDATION (SPEC SECTION 20) ---');
  assert(typeof importedItem.thumbnailPath === 'string' && importedItem.thumbnailPath.length > 0, 'Thumbnail path is populated');
  assert(fs.existsSync(importedItem.thumbnailPath), `Thumbnail exists on disk: ${importedItem.thumbnailPath}`);

  const thumbStat = fs.statSync(importedItem.thumbnailPath);
  assert(thumbStat.size > 200, `Thumbnail file size is healthy: ${thumbStat.size} bytes`);

  // Verify JPEG magic bytes (FF D8 FF)
  const thumbBuffer = fs.readFileSync(importedItem.thumbnailPath);
  const isJpeg = thumbBuffer[0] === 0xff && thumbBuffer[1] === 0xd8 && thumbBuffer[2] === 0xff;
  assert(isJpeg, 'Thumbnail has valid JPEG magic bytes (FF D8 FF)');

  // Verify Data URI for zero-CORS UI rendering
  assert(typeof importedItem.thumbnailUrl === 'string' && importedItem.thumbnailUrl.startsWith('data:image/jpeg;base64,'), 'Thumbnail URL is valid base64 Data URI');

  // Verify cache storage location per spec section 20: Documents/Friday Recorder/Cache/Thumbnails/
  const expectedCacheDir = MediaStorage.getThumbnailsDirectory();
  console.log(`  Cache directory: ${expectedCacheDir}`);
  assert(importedItem.thumbnailPath.startsWith(expectedCacheDir), 'Thumbnail is stored strictly inside Cache/Thumbnails/ per spec section 20');

  // Verify caching hit (subsequent probe uses cached thumbnail instantly)
  const t0 = performance.now();
  const cachedThumb = await ThumbnailGenerator.generate(primaryTestRecording, importedItem.metadata.durationSeconds);
  const cacheDurationMs = performance.now() - t0;
  assert(cachedThumb.thumbnailPath === importedItem.thumbnailPath, 'Re-query returns identical cached thumbnail path');
  assert(cacheDurationMs < 20, `Cached thumbnail retrieval is near-instant (${cacheDurationMs.toFixed(2)} ms)`);

  console.log('\n--- ITEM 5: CORRUPTED / INVALID FILE ERROR HANDLING ---');
  const tempDir = path.join(__dirname, 'temp_phase6_test');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  // 1. Zero-byte file test
  const emptyFilePath = path.join(tempDir, 'zero_byte_video.webm');
  fs.writeFileSync(emptyFilePath, Buffer.alloc(0));

  let emptyRejected = false;
  try {
    await service.importFile(emptyFilePath);
  } catch (err) {
    emptyRejected = true;
    console.log(`  [Expected Error Caught for 0-byte file]: ${err.message}`);
    assert(err.message.includes('Cannot import empty file') || err.message.includes('0 bytes'), '0-byte file rejected with explicit explanation');
  }
  assert(emptyRejected, '0-byte file was successfully rejected without crash');

  // 2. Corrupted / non-video file with video extension
  const corruptFilePath = path.join(tempDir, 'corrupt_header.mp4');
  fs.writeFileSync(corruptFilePath, 'This is plain text pretending to be an mp4 video file. Definitely not a valid video stream.');

  let corruptRejected = false;
  try {
    await service.importFile(corruptFilePath);
  } catch (err) {
    corruptRejected = true;
    console.log(`  [Expected Error Caught for corrupt file]: ${err.message}`);
    assert(err.message.includes('Invalid video') || err.message.includes('Cannot import'), 'Corrupt video rejected with clear error');
  }
  assert(corruptRejected, 'Corrupted video file was successfully rejected without crash');

  // 3. Unsupported format extension test
  const docFilePath = path.join(tempDir, 'document.docx');
  fs.writeFileSync(docFilePath, 'Fake document');
  let unsupportedRejected = false;
  try {
    await service.importFile(docFilePath);
  } catch (err) {
    unsupportedRejected = true;
    console.log(`  [Expected Error Caught for unsupported format]: ${err.message}`);
    assert(err.message.includes('Unsupported video format'), 'Unsupported format rejected with format explanation');
  }
  assert(unsupportedRejected, 'Unsupported format extension rejected without crash');

  console.log('\n--- ITEM 6: DELETED / MOVED SOURCE FILE GRACEFUL HANDLING ---');
  // Create a temporary valid clip, import it, then delete it to simulate a user moving/deleting a file
  const tempValidVideo = path.join(tempDir, 'temp_for_deletion.webm');
  fs.copyFileSync(primaryTestRecording, tempValidVideo);
  const importedTempItem = await service.importFile(tempValidVideo);
  assert(importedTempItem.isAvailable === true, 'Temporary video imported successfully');

  // Now delete the underlying file from disk
  fs.unlinkSync(tempValidVideo);
  assert(!fs.existsSync(tempValidVideo), 'Simulated file deletion: file no longer on disk');

  // Check status via service
  const statusCheck = await service.checkStatus(importedTempItem.id);
  console.log('Status check result on deleted file:');
  console.dir(statusCheck);
  assert(statusCheck.exists === false, 'Service cleanly detected exists === false');
  assert(statusCheck.error !== undefined && (statusCheck.error.includes('moved') || statusCheck.error.includes('deleted')), 'Informative error message returned for deleted file');

  // Verify item in library is updated with isAvailable = false without throwing
  const updatedItem = service.list().find((i) => i.id === importedTempItem.id);
  assert(updatedItem && updatedItem.isAvailable === false, 'Library state reflects unavailable status without crashing');

  console.log('\n--- ITEM 7: LARGE / MULTI-MINUTE FILE PROBE PERFORMANCE ---');
  // Check the largest recording available in the recordings folder
  const sortedRecordings = recordingFiles
    .map((f) => ({ name: f, fullPath: path.join(recordingsDir, f), size: fs.statSync(path.join(recordingsDir, f)).size }))
    .sort((a, b) => b.size - a.size);

  const largestRecording = sortedRecordings[0];
  console.log(`  Testing largest recording: ${largestRecording.name} (${(largestRecording.size / 1024).toFixed(1)} KB)`);

  const tStart = performance.now();
  const largeImportResult = await service.importFile(largestRecording.fullPath);
  const tElapsed = performance.now() - tStart;

  console.log(`  Probed and extracted thumbnail in ${tElapsed.toFixed(2)} ms (Duration: ${largeImportResult.metadata.durationSeconds}s)`);
  assert(tElapsed < 2000, `Large file import took ${tElapsed.toFixed(2)} ms (< 2000 ms), non-blocking`);

  console.log('\n--- ITEM 8: ZERO FILE DUPLICATION VERIFICATION (SPEC SECTION 20) ---');
  // Confirm no video files exist inside Cache/ or AppData
  const cacheDir = MediaStorage.getCacheDirectory();
  const allFilesInCache = [];
  function scanDir(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) scanDir(full);
      else allFilesInCache.push(full);
    }
  }
  scanDir(cacheDir);

  const videoFilesInCache = allFilesInCache.filter((f) => {
    const ext = path.extname(f).toLowerCase();
    return ['.webm', '.mp4', '.mov', '.mkv'].includes(ext);
  });

  console.log(`  Files in Cache/ directory: ${allFilesInCache.length} total files`);
  console.log(`  Video files copied into Cache/: ${videoFilesInCache.length}`);
  assert(videoFilesInCache.length === 0, 'Zero video files copied or duplicated in cache storage (references only)');

  // Clean up test artifacts
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {}

  console.log('\n=====================================================');
  console.log(`ALL VERIFICATION TESTS COMPLETED: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('=====================================================');
}

runVerification().catch((err) => {
  console.error('\n❌ Uncaught error during verification:', err);
  process.exit(1);
});
