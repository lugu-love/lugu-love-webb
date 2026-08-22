
import Foundation
import AVFoundation
import CoreImage
import CoreGraphics
import CoreText
import AppKit

guard CommandLine.arguments.count == 10 else { exit(2) }
let input = URL(fileURLWithPath: CommandLine.arguments[1])
let output = URL(fileURLWithPath: CommandLine.arguments[2])
let text = CommandLine.arguments[3]
let W = Int(CommandLine.arguments[5])!
let H = Int(CommandLine.arguments[6])!
let fps = Int32(CommandLine.arguments[7])!
let seconds = Double(CommandLine.arguments[8])!
let bitrate = Int(CommandLine.arguments[9])!

let asset = AVURLAsset(url: input)
let generator = AVAssetImageGenerator(asset: asset)
generator.appliesPreferredTrackTransform = true
generator.maximumSize = CGSize(width: W, height: W * 4 / 3)
generator.requestedTimeToleranceBefore = .zero
generator.requestedTimeToleranceAfter = .zero
let ciContext = CIContext(options: [.useSoftwareRenderer: false])

let keyKernel = CIColorKernel(source: """
kernel vec4 keyColor(__sample s) {
  float r = s.r, g = s.g, b = s.b;
  float blue = b - r;
  float screen = smoothstep(0.04, 0.16, blue);
  float lum = max(max(r, g), b);
  float dark = (1.0 - smoothstep(0.0, 0.12, lum)) * smoothstep(0.03, 0.30, blue);
  float sat = max(max(r, g), b) - min(min(r, g), b);
  float gray = (1.0 - smoothstep(0.02, 0.20, sat)) * smoothstep(0.015, 0.20, blue);
  float alpha = 1.0 - max(max(screen, dark), gray);
  float spill = 1.0 - smoothstep(0.25, 0.80, alpha);
  vec3 rgb = vec3(r, g, b);
  rgb.b = mix(rgb.b, min(rgb.b, rgb.g), spill);
  rgb.g = mix(rgb.g, r, spill * 0.35);
  return vec4(rgb * alpha, alpha);
}
""")

func loadCG(_ path: String) -> CGImage? {
  guard let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil) else { return nil }
  return CGImageSourceCreateImageAtIndex(src, 0, nil)
}
let space = loadCG("/Users/liangminghua/Desktop/2026.7.1/deepseek-codex-test/space-bg.webp")
let earth = loadCG("/Users/liangminghua/Desktop/2026.7.1/deepseek-codex-test/earth.webp")

let charH = Int(Double(W) * 4.0 / 3.0)
let textH = H - charH
if textH < 80 { print("textH too small"); exit(2) }

let fill = NSColor(calibratedRed: 1.0, green: 0.95, blue: 0.86, alpha: 1.0)
let stroke = NSColor(calibratedRed: 0.25, green: 0.14, blue: 0.07, alpha: 1.0)

func charImage(at t: Double) -> CGImage? {
  guard let raw = try? generator.copyCGImage(at: CMTime(seconds: t, preferredTimescale: 600), actualTime: nil) else { return nil }
  let ci = CIImage(cgImage: raw)
  guard let k = keyKernel?.apply(extent: ci.extent, arguments: [ci]) else { return nil }
  return ciContext.createCGImage(k, from: ci.extent)
}

func drawFrame(pixelBuffer: CVPixelBuffer, char: CGImage) {
  CVPixelBufferLockBaseAddress(pixelBuffer, [])
  let ctx = CGContext(data: CVPixelBufferGetBaseAddress(pixelBuffer), width: W, height: H, bitsPerComponent: 8,
                      bytesPerRow: CVPixelBufferGetBytesPerRow(pixelBuffer),
                      space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue)!
  // space background (cover fill)
  if let sp = space {
    let sw = CGFloat(sp.width), sh = CGFloat(sp.height)
    let scale = max(CGFloat(W)/sw, CGFloat(H)/sh)
    let dw = sw*scale, dh = sh*scale
    ctx.draw(sp, in: CGRect(x: (CGFloat(W)-dw)/2, y: (CGFloat(H)-dh)/2, width: dw, height: dh))
  } else {
    ctx.setFillColor(CGColor(red: 0.06, green: 0.07, blue: 0.16, alpha: 1))
    ctx.fill(CGRect(x:0,y:0,width:W,height:H))
  }
  // earth (planet cutout, behind the character)
  if let e = earth {
    let ew = CGFloat(e.width), eh = CGFloat(e.height)
    let planetD = CGFloat(W) * 0.86
    let scale = planetD / 677.0
    let cx = CGFloat(W)/2, cy = CGFloat(H) * 0.44
    let dx = cx - 518.5*scale, dy = cy - 850.5*scale
    ctx.draw(e, in: CGRect(x: dx, y: dy, width: ew*scale, height: eh*scale))
  }
  // character
  ctx.draw(char, in: CGRect(x: 0, y: textH, width: W, height: charH))
  // user copy (centered, outlined)
  let copyFont = CTFontCreateWithName("PingFangSC-Medium" as CFString, CGFloat(W) * 0.085, nil)
  let para = NSMutableParagraphStyle(); para.alignment = .center; para.lineBreakMode = .byCharWrapping
  let copyAttr = NSAttributedString(string: text, attributes: [
    NSAttributedString.Key("NSFont"): copyFont,
    NSAttributedString.Key("NSColor"): fill,
    NSAttributedString.Key("NSStrokeColor"): stroke,
    NSAttributedString.Key("NSStrokeWidth"): -2.5,
    NSAttributedString.Key("NSParagraphStyle"): para
  ])
  let fs = CTFramesetterCreateWithAttributedString(copyAttr)
  let path = CGPath(rect: CGRect(x: CGFloat(W)*0.05, y: 6, width: CGFloat(W)*0.90, height: max(10, CGFloat(textH) - 10)), transform: nil)
  let frame = CTFramesetterCreateFrame(fs, CFRangeMake(0,0), path, nil)
  CTFrameDraw(frame, ctx)
  CVPixelBufferUnlockBaseAddress(pixelBuffer, [])
}

let writer = try! AVAssetWriter(outputURL: output, fileType: .mp4)
let vsettings: [String: Any] = [
  AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: W, AVVideoHeightKey: H,
  AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: bitrate*1000, AVVideoExpectedSourceFrameRateKey: fps, AVVideoMaxKeyFrameIntervalKey: fps*2]
]
let vinput = AVAssetWriterInput(mediaType: .video, outputSettings: vsettings)
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: vinput, sourcePixelBufferAttributes: [
  kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
  kCVPixelBufferWidthKey as String: W, kCVPixelBufferHeightKey as String: H
])
writer.add(vinput); writer.startWriting(); writer.startSession(atSourceTime: .zero)

let frameCount = Int(seconds * Double(fps))
for i in 0..<frameCount {
  let t = Double(i) / Double(fps)
  guard let char = charImage(at: t) else { continue }
  var pb: CVPixelBuffer?
  CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &pb)
  guard let buf = pb else { continue }
  drawFrame(pixelBuffer: buf, char: char)
  adaptor.append(buf, withPresentationTime: CMTime(value: CMTimeValue(i), timescale: fps))
}
vinput.markAsFinished()
let sem = DispatchSemaphore(value: 0)
writer.finishWriting { sem.signal() }; sem.wait()
print("ok space-mp4 \(W)x\(H) fps=\(fps) sec=\(seconds) frames=\(frameCount) status=\(writer.status.rawValue)")
