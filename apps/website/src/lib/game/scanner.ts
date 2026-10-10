import type {Scanner} from '@whocards/game'

const SCAN_EVERY_MS = 250
// Decoding a full 1080p frame is slow on older phones; a QR at arm's length survives the shrink.
const MAX_FRAME_EDGE = 640

export const frameSize = (width: number, height: number, maxEdge = MAX_FRAME_EDGE) => {
  const scale = Math.min(1, maxEdge / Math.max(width, height, 1))
  return {width: Math.round(width * scale), height: Math.round(height * scale)}
}

const loadReader = async () => {
  const [zxing, wasm] = await Promise.all([
    import('zxing-wasm/reader'),
    import('zxing-wasm/reader/zxing_reader.wasm?url'),
  ])
  // Self-host the wasm instead of the library's CDN default.
  zxing.prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) =>
        path.endsWith('.wasm') ? wasm.default : prefix + path,
    },
  })
  return zxing.readBarcodes
}

/** Rear-camera QR scanning into `video`; works on iOS Safari, where BarcodeDetector is missing. */
export const createVideoScanner = (video: HTMLVideoElement): Scanner => {
  let stream: MediaStream | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let running = false

  const stop = async () => {
    running = false
    if (timer) clearTimeout(timer)
    timer = null
    for (const track of stream?.getTracks() ?? []) track.stop()
    stream = null
    video.srcObject = null
  }

  return {
    async start(onCode) {
      if (running) return
      running = true
      const readBarcodes = await loadReader()
      stream = await navigator.mediaDevices.getUserMedia({
        video: {facingMode: {ideal: 'environment'}},
        audio: false,
      })
      if (!running) {
        await stop()
        return
      }
      // iOS only plays camera video inline when muted and playsInline.
      video.muted = true
      video.playsInline = true
      video.srcObject = stream
      await video.play()

      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d', {willReadFrequently: true})
      const scan = async () => {
        if (!running || !context) return
        if (video.readyState >= video.HAVE_CURRENT_DATA && video.videoWidth > 0) {
          const {width, height} = frameSize(video.videoWidth, video.videoHeight)
          canvas.width = width
          canvas.height = height
          context.drawImage(video, 0, 0, width, height)
          const results = await readBarcodes(context.getImageData(0, 0, width, height), {
            formats: ['QRCode'],
            maxNumberOfSymbols: 1,
          }).catch(() => [])
          const text = results.find((r) => r.isValid)?.text
          if (text && running) onCode(text)
        }
        if (running) timer = setTimeout(() => void scan(), SCAN_EVERY_MS)
      }
      void scan()
    },
    stop,
  }
}
