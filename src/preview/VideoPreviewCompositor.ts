/**
 * VideoPreviewCompositor — GPU-Accelerated WebGL Video Preview Engine
 * 
 * Per Friday Recorder Specification Sections 4, 6, and 14:
 * - Renders source video frames via WebGL GPU hardware acceleration.
 * - Architected with a multi-layer transform pipeline ready for:
 *     - Phase 10: Canvas Viewport Transform & Crop (texture coordinate matrix)
 *     - Phase 11: Dynamic Smooth Zoom & Pan (content scale/translation matrix)
 *     - Phase 12: Smooth Cursor Overlay (coordinate tracking layer)
 *     - Phase 13: Webcam PiP Overlay (secondary video texture)
 * - NON-DESTRUCTIVE: All operations occur in real-time GPU shaders. The source
 *   video file on disk is NEVER re-rendered, transcoded, or modified for playback.
 */

export interface CompositorOptions {
  canvas: HTMLCanvasElement;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onPlayStateChange?: (isPlaying: boolean) => void;
  onLoadedMetadata?: (width: number, height: number, duration: number) => void;
  onError?: (error: string) => void;
  onBuffering?: (isBuffering: boolean) => void;
}

export interface CompositorTransforms {
  // Phase 10 Crop Transform placeholder
  crop: { x: number; y: number; width: number; height: number };
  // Phase 11 Camera Zoom & Pan placeholder
  zoom: { scale: number; panX: number; panY: number };
}

const VERTEX_SHADER_SOURCE = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  uniform mat3 u_matrix;
  varying vec2 v_texCoord;

  void main() {
    vec3 pos = u_matrix * vec3(a_position, 1.0);
    gl_Position = vec4(pos.xy, 0.0, 1.0);
    v_texCoord = a_texCoord;
  }
`;

const FRAGMENT_SHADER_SOURCE = `
  precision mediump float;
  uniform sampler2D u_image;
  uniform vec4 u_cropRect; // x, y, width, height (normalized 0.0 to 1.0)
  varying vec2 v_texCoord;

  void main() {
    // Phase 10 Crop boundary check
    if (v_texCoord.x < u_cropRect.x || v_texCoord.x > (u_cropRect.x + u_cropRect.z) ||
        v_texCoord.y < u_cropRect.y || v_texCoord.y > (u_cropRect.y + u_cropRect.w)) {
      discard;
    }
    gl_FragColor = texture2D(u_image, v_texCoord);
  }
`;

export class VideoPreviewCompositor {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | null = null;
  private video: HTMLVideoElement;
  private program: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;
  private positionBuffer: WebGLBuffer | null = null;
  private texCoordBuffer: WebGLBuffer | null = null;

  // Shader Uniform Locations
  private uMatrixLoc: WebGLUniformLocation | null = null;
  private uImageLoc: WebGLUniformLocation | null = null;
  private uCropRectLoc: WebGLUniformLocation | null = null;

  // Shader Attribute Locations
  private aPosLoc: number = -1;
  private aTexLoc: number = -1;

  // Animation & Rendering Loop
  private animFrameId: number | null = null;
  private videoFrameCallbackId: number | null = null;
  private isDestroyed: boolean = false;
  private isPlayingState: boolean = false;
  private pendingPlayPromise: Promise<void> | null = null;
  private lastRenderedTime: number = -1;

  // Callbacks
  private onTimeUpdate?: (currentTime: number, duration: number) => void;
  private onPlayStateChange?: (isPlaying: boolean) => void;
  private onLoadedMetadata?: (width: number, height: number, duration: number) => void;
  private onError?: (error: string) => void;
  private onBuffering?: (isBuffering: boolean) => void;

  // Transforms Hierarchy (Phase 10 & Phase 11 Hooks)
  private transforms: CompositorTransforms = {
    crop: { x: 0, y: 0, width: 1, height: 1 },
    zoom: { scale: 1, panX: 0, panY: 0 },
  };

  constructor(options: CompositorOptions) {
    this.canvas = options.canvas;
    this.onTimeUpdate = options.onTimeUpdate;
    this.onPlayStateChange = options.onPlayStateChange;
    this.onLoadedMetadata = options.onLoadedMetadata;
    this.onError = options.onError;
    this.onBuffering = options.onBuffering;

    // 1. Initialize hidden/decoding video element
    this.video = document.createElement('video');
    this.video.playsInline = true;
    this.video.crossOrigin = 'anonymous';
    this.video.preload = 'auto';

    // 2. Initialize WebGL GPU Context
    this.initWebGL();

    // 3. Attach video event listeners
    this.attachVideoEvents();
  }

  /**
   * Initializes the WebGL rendering context, shaders, and geometry buffers.
   */
  private initWebGL(): void {
    const gl =
      this.canvas.getContext('webgl', {
        alpha: false,
        antialias: true,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
      }) ||
      (this.canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);

    if (!gl) {
      console.warn('[VideoPreviewCompositor] WebGL context unavailable. Falling back to 2D canvas.');
      return;
    }
    this.gl = gl;

    // Compile Shaders
    const vertexShader = this.compileShader(gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
    const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);

    if (!vertexShader || !fragmentShader) {
      console.error('[VideoPreviewCompositor] Failed to compile WebGL shaders.');
      return;
    }

    const program = gl.createProgram();
    if (!program) return;

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('[VideoPreviewCompositor] WebGL program link error:', gl.getProgramInfoLog(program));
      return;
    }

    this.program = program;
    gl.useProgram(program);

    // Locations
    this.aPosLoc = gl.getAttribLocation(program, 'a_position');
    this.aTexLoc = gl.getAttribLocation(program, 'a_texCoord');
    this.uMatrixLoc = gl.getUniformLocation(program, 'u_matrix');
    this.uImageLoc = gl.getUniformLocation(program, 'u_image');
    this.uCropRectLoc = gl.getUniformLocation(program, 'u_cropRect');

    // Create quad geometry (-1 to 1 clip space)
    this.positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        -1.0, -1.0,
         1.0, -1.0,
        -1.0,  1.0,
        -1.0,  1.0,
         1.0, -1.0,
         1.0,  1.0,
      ]),
      gl.STATIC_DRAW
    );

    // Texture UV coordinates (flipped Y for canvas coordinate system)
    this.texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        0.0, 1.0,
        1.0, 1.0,
        0.0, 0.0,
        0.0, 0.0,
        1.0, 1.0,
        1.0, 0.0,
      ]),
      gl.STATIC_DRAW
    );

    // Texture allocation
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // Default clear
    gl.clearColor(0.04, 0.05, 0.08, 1.0); // #0a0e17 dark slate theme background
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  private compileShader(type: number, source: string): WebGLShader | null {
    if (!this.gl) return null;
    const shader = this.gl.createShader(type);
    if (!shader) return null;

    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);

    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      console.error('[VideoPreviewCompositor] Shader compilation error:', this.gl.getShaderInfoLog(shader));
      this.gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  /**
   * Binds HTMLVideoElement lifecycle and telemetry events.
   */
  private attachVideoEvents(): void {
    this.video.addEventListener('loadedmetadata', () => {
      if (this.isDestroyed) return;
      this.renderCurrentFrame();
      if (this.onLoadedMetadata) {
        this.onLoadedMetadata(this.video.videoWidth, this.video.videoHeight, this.video.duration);
      }
      if (this.onTimeUpdate) {
        this.onTimeUpdate(this.video.currentTime, this.video.duration);
      }
    });

    this.video.addEventListener('timeupdate', () => {
      if (this.isDestroyed) return;
      if (this.onTimeUpdate) {
        this.onTimeUpdate(this.video.currentTime, this.video.duration);
      }
    });

    this.video.addEventListener('play', () => {
      if (this.isDestroyed) return;
      this.isPlayingState = true;
      if (this.onPlayStateChange) this.onPlayStateChange(true);
      this.startRenderLoop();
    });

    this.video.addEventListener('pause', () => {
      if (this.isDestroyed) return;
      this.isPlayingState = false;
      if (this.onPlayStateChange) this.onPlayStateChange(false);
      this.stopRenderLoop();
      this.renderCurrentFrame();
    });

    this.video.addEventListener('ended', () => {
      if (this.isDestroyed) return;
      this.isPlayingState = false;
      if (this.onPlayStateChange) this.onPlayStateChange(false);
      this.stopRenderLoop();
    });

    this.video.addEventListener('waiting', () => {
      if (this.isDestroyed) return;
      if (this.onBuffering) this.onBuffering(true);
    });

    this.video.addEventListener('playing', () => {
      if (this.isDestroyed) return;
      if (this.onBuffering) this.onBuffering(false);
    });

    this.video.addEventListener('error', () => {
      if (this.isDestroyed) return;
      const err = this.video.error;
      const msg = err
        ? `Video decode error (${err.code}): ${err.message || 'The video file could not be read or decoded.'}`
        : 'Unknown video playback error.';
      console.error('[VideoPreviewCompositor]', msg);
      if (this.onError) this.onError(msg);
    });
  }

  /**
   * Loads a video into the compositor by URL.
   */
  public async loadVideo(mediaUrl: string, expectedDuration?: number): Promise<void> {
    if (this.isDestroyed) return;

    this.pause();
    this.video.src = mediaUrl;
    this.video.load();

    await new Promise<void>((resolve, reject) => {
      const onLoaded = () => {
        cleanup();
        resolve();
      };

      const onError = () => {
        cleanup();
        const err = this.video.error;
        reject(
          new Error(
            err
              ? `Failed to load video (${err.code}): ${err.message || 'File unreadable or missing'}`
              : 'Failed to load video into preview compositor.'
          )
        );
      };

      const cleanup = () => {
        this.video.removeEventListener('loadeddata', onLoaded);
        this.video.removeEventListener('error', onError);
      };

      this.video.addEventListener('loadeddata', onLoaded);
      this.video.addEventListener('error', onError);

      // Fast fallback if already ready
      if (this.video.readyState >= 2) {
        cleanup();
        resolve();
      }
    });

    // Render initial frame
    this.renderCurrentFrame();

    if (this.onLoadedMetadata) {
      this.onLoadedMetadata(
        this.video.videoWidth,
        this.video.videoHeight,
        this.video.duration || expectedDuration || 0
      );
    }
  }

  /**
   * Starts high-performance requestVideoFrameCallback / requestAnimationFrame render loop.
   */
  private startRenderLoop(): void {
    if (this.isDestroyed) return;

    // Use Chromium's requestVideoFrameCallback for exact frame-clock synchronization
    if ('requestVideoFrameCallback' in this.video) {
      const onFrame = () => {
        if (this.isDestroyed || !this.isPlayingState) return;
        this.renderCurrentFrame();
        this.videoFrameCallbackId = (
          this.video as HTMLVideoElement & {
            requestVideoFrameCallback: (cb: () => void) => number;
          }
        ).requestVideoFrameCallback(onFrame);
      };
      this.videoFrameCallbackId = (
        this.video as HTMLVideoElement & {
          requestVideoFrameCallback: (cb: () => void) => number;
        }
      ).requestVideoFrameCallback(onFrame);
    } else {
      const loop = () => {
        if (this.isDestroyed || !this.isPlayingState) return;
        this.renderCurrentFrame();
        this.animFrameId = requestAnimationFrame(loop);
      };
      this.animFrameId = requestAnimationFrame(loop);
    }
  }

  private stopRenderLoop(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.videoFrameCallbackId !== null && 'cancelVideoFrameCallback' in this.video) {
      (
        this.video as HTMLVideoElement & {
          cancelVideoFrameCallback: (id: number) => void;
        }
      ).cancelVideoFrameCallback(this.videoFrameCallbackId);
      this.videoFrameCallbackId = null;
    }
  }

  /**
   * Renders the current video frame to the WebGL canvas with letterboxing and transform hierarchy.
   */
  public renderCurrentFrame(): void {
    if (this.isDestroyed || !this.video || this.video.readyState < 2) return;

    const gl = this.gl;
    if (!gl || !this.program || !this.texture) {
      // 2D Fallback
      this.render2DFallback();
      return;
    }

    const canvasWidth = this.canvas.width;
    const canvasHeight = this.canvas.height;
    if (canvasWidth <= 0 || canvasHeight <= 0) return;

    gl.viewport(0, 0, canvasWidth, canvasHeight);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.program);

    // Upload video frame to WebGL texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.video);
    } catch {
      // Frame read skipped (e.g. video context switching)
      return;
    }
    if (this.uImageLoc) gl.uniform1i(this.uImageLoc, 0);

    // Compute aspect-ratio-preserving letterbox scale matrix
    const videoAspect = (this.video.videoWidth || 16) / (this.video.videoHeight || 9);
    const canvasAspect = canvasWidth / canvasHeight;

    let scaleX = 1.0;
    let scaleY = 1.0;

    if (canvasAspect > videoAspect) {
      // Canvas is wider than video: Pillarbox (black bars left/right)
      scaleX = videoAspect / canvasAspect;
    } else {
      // Canvas is taller than video: Letterbox (black bars top/bottom)
      scaleY = canvasAspect / videoAspect;
    }

    // Apply Phase 11 Zoom & Pan matrix hooks
    const zoomScale = this.transforms.zoom.scale;
    const panX = this.transforms.zoom.panX;
    const panY = this.transforms.zoom.panY;

    scaleX *= zoomScale;
    scaleY *= zoomScale;

    // 3x3 2D Affine Transformation Matrix
    // [ sx   0   tx ]
    // [  0  sy   ty ]
    // [  0   0    1 ]
    const transformMatrix = new Float32Array([
      scaleX, 0, 0,
      0, scaleY, 0,
      panX, panY, 1,
    ]);

    if (this.uMatrixLoc) {
      gl.uniformMatrix3fv(this.uMatrixLoc, false, transformMatrix);
    }

    // Phase 10 Crop Rect Uniform
    if (this.uCropRectLoc) {
      const c = this.transforms.crop;
      gl.uniform4f(this.uCropRectLoc, c.x, c.y, c.width, c.height);
    }

    // Bind Position Buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.enableVertexAttribArray(this.aPosLoc);
    gl.vertexAttribPointer(this.aPosLoc, 2, gl.FLOAT, false, 0, 0);

    // Bind TexCoord Buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.enableVertexAttribArray(this.aTexLoc);
    gl.vertexAttribPointer(this.aTexLoc, 2, gl.FLOAT, false, 0, 0);

    // Draw textured quad
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    this.lastRenderedTime = this.video.currentTime;
  }

  /**
   * Software 2D Canvas fallback if WebGL is unavailable.
   */
  private render2DFallback(): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;

    const cw = this.canvas.width;
    const ch = this.canvas.height;
    ctx.fillStyle = '#0a0e17';
    ctx.fillRect(0, 0, cw, ch);

    const vw = this.video.videoWidth || 16;
    const vh = this.video.videoHeight || 9;
    const videoAspect = vw / vh;
    const canvasAspect = cw / ch;

    let dw = cw;
    let dh = ch;
    let dx = 0;
    let dy = 0;

    if (canvasAspect > videoAspect) {
      dw = ch * videoAspect;
      dx = (cw - dw) / 2;
    } else {
      dh = cw / videoAspect;
      dy = (ch - dh) / 2;
    }

    try {
      ctx.drawImage(this.video, dx, dy, dw, dh);
    } catch {
      // Ignored
    }
  }

  /**
   * Resizes canvas rendering resolution to match display container.
   */
  public resize(width: number, height: number): void {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.renderCurrentFrame();
    }
  }

  /**
   * Play video with race condition guard.
   */
  public async play(): Promise<void> {
    if (this.isDestroyed || this.video.ended) {
      if (this.video.ended) this.video.currentTime = 0;
    }

    try {
      this.pendingPlayPromise = this.video.play();
      await this.pendingPlayPromise;
      this.pendingPlayPromise = null;
    } catch (err: unknown) {
      this.pendingPlayPromise = null;
      if (err instanceof Error && err.name === 'AbortError') {
        // Expected when play/pause toggled rapidly
        return;
      }
      console.warn('[VideoPreviewCompositor] Play error:', err);
    }
  }

  /**
   * Pause video safely.
   */
  public pause(): void {
    if (this.isDestroyed) return;

    if (this.pendingPlayPromise) {
      this.pendingPlayPromise
        .then(() => {
          this.video.pause();
        })
        .catch(() => {});
    } else {
      this.video.pause();
    }
  }

  /**
   * Toggles play/pause state.
   */
  public togglePlay(): void {
    if (this.isPlaying()) {
      this.pause();
    } else {
      void this.play();
    }
  }

  /**
   * Seeks to target timestamp in seconds.
   * Uses fastSeek for rapid scrubbing when available, and exact currentTime assignment when settled.
   */
  public async seek(targetTimeSeconds: number, exact: boolean = false): Promise<void> {
    if (this.isDestroyed) return;

    const clamped = Math.max(0, Math.min(targetTimeSeconds, this.video.duration || 0));

    if (!exact && 'fastSeek' in this.video && typeof (this.video as HTMLVideoElement & { fastSeek: (t: number) => void }).fastSeek === 'function') {
      (this.video as HTMLVideoElement & { fastSeek: (t: number) => void }).fastSeek(clamped);
    } else {
      this.video.currentTime = clamped;
    }

    // If paused, wait for seeked event or render next available frame
    if (!this.isPlayingState) {
      await new Promise<void>((resolve) => {
        const onSeeked = () => {
          this.video.removeEventListener('seeked', onSeeked);
          this.renderCurrentFrame();
          resolve();
        };
        this.video.addEventListener('seeked', onSeeked, { once: true });
        // Fallback timeout in case seeked was already fired
        setTimeout(() => {
          this.video.removeEventListener('seeked', onSeeked);
          this.renderCurrentFrame();
          resolve();
        }, 100);
      });
    }
  }

  /**
   * Steps forward or backward by a single frame (~16.6ms at 60 FPS).
   */
  public stepFrame(forward: boolean = true, fps: number = 60): void {
    this.pause();
    const frameDuration = 1.0 / (fps > 0 ? fps : 60);
    const newTime = this.video.currentTime + (forward ? frameDuration : -frameDuration);
    void this.seek(newTime, true);
  }

  public isPlaying(): boolean {
    return !this.video.paused && !this.video.ended && this.video.readyState > 2;
  }

  public getLastRenderedTime(): number {
    return this.lastRenderedTime;
  }

  public getCurrentTime(): number {
    return this.video.currentTime;
  }

  public getDuration(): number {
    return this.video.duration || 0;
  }

  public setVolume(volume: number): void {
    this.video.volume = Math.max(0, Math.min(1, volume));
  }

  public getVolume(): number {
    return this.video.volume;
  }

  public setMuted(muted: boolean): void {
    this.video.muted = muted;
  }

  public isMuted(): boolean {
    return this.video.muted;
  }

  public getVideoElement(): HTMLVideoElement {
    return this.video;
  }

  public setTransforms(transforms: Partial<CompositorTransforms>): void {
    if (transforms.crop) this.transforms.crop = { ...this.transforms.crop, ...transforms.crop };
    if (transforms.zoom) this.transforms.zoom = { ...this.transforms.zoom, ...transforms.zoom };
    this.renderCurrentFrame();
  }

  public getTransforms(): CompositorTransforms {
    return { ...this.transforms };
  }

  /**
   * Destroys compositor, releases GPU buffers, textures, and video handles.
   */
  public destroy(): void {
    this.isDestroyed = true;
    this.stopRenderLoop();
    this.pause();

    this.video.src = '';
    this.video.load();

    const gl = this.gl;
    if (gl) {
      if (this.texture) gl.deleteTexture(this.texture);
      if (this.positionBuffer) gl.deleteBuffer(this.positionBuffer);
      if (this.texCoordBuffer) gl.deleteBuffer(this.texCoordBuffer);
      if (this.program) gl.deleteProgram(this.program);
    }

    this.gl = null;
    this.program = null;
    this.texture = null;
    this.positionBuffer = null;
    this.texCoordBuffer = null;
  }
}
