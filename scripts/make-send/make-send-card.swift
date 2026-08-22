
import Foundation
import AVFoundation
import CoreImage
import CoreGraphics
import CoreText
import ImageIO
import UniformTypeIdentifiers

guard CommandLine.arguments.count == 10 else { exit(2) }
let input = URL(fileURLWithPath: CommandLine.arguments[1])
let output = URL(fileURLWithPath: CommandLine.arguments[2])
let text = CommandLine.arguments[3]
let emotionName = CommandLine.arguments[4]
let style = CommandLine.arguments[5]
let W = Int(CommandLine.arguments[6])!
let H = Int(CommandLine.arguments[7])!
let fps = Double(CommandLine.arguments[8])!
let seconds = Double(CommandLine.arguments[9])!

// exact 1x pixel canvas; char area = W x (W*4/3), text area below.
let charH = min(Int(Double(W) * 4.0 / 3.0), H - 90)
let textH = H - charH

let asset = AVURLAsset(url: input)
let generator = AVAssetImageGenerator(asset: asset)
generator.appliesPreferredTrackTransform = true
generator.maximumSize = CGSize(width: W, height: charH)
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
  float a = alpha > 0.45 ? 1.0 : 0.0;
  return vec4(rgb * a, a);
}
""")

let styles: [String:(CGColor, CGColor)] = [
  "warm-white": (CGColor(red: 1.0, green: 0.95, blue: 0.86, alpha: 1.0), CGColor(red: 0.28, green: 0.16, blue: 0.08, alpha: 1.0)),
  "warm-yellow": (CGColor(red: 1.0, green: 0.84, blue: 0.45, alpha: 1.0), CGColor(red: 0.28, green: 0.16, blue: 0.08, alpha: 1.0)),
  "dark-brown": (CGColor(red: 0.30, green: 0.17, blue: 0.09, alpha: 1.0), CGColor(red: 1.0, green: 0.95, blue: 0.86, alpha: 1.0))
]
let (fill, stroke) = styles[style] ?? styles["warm-white"]!

func makeFrame(_ raw: CGImage) -> CGImage? {
  let ci = CIImage(cgImage: raw)
  guard let keyed = keyKernel?.apply(extent: ci.extent, arguments: [ci]),
        let charCG = ciContext.createCGImage(keyed, from: ci.extent) else { return nil }
  let ctx = CGContext(data: nil, width: W, height: H, bitsPerComponent: 8, bytesPerRow: 0,
                      space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  ctx.clear(CGRect(x: 0, y: 0, width: W, height: H))
  ctx.draw(charCG, in: CGRect(x: 0, y: textH, width: W, height: charH))

  // Emotion name (centered single line with outline)
  let nameFont = CTFontCreateWithName("PingFangSC-Semibold" as CFString, CGFloat(W) * 0.115, nil)
  let nameAttr = NSAttributedString(string: emotionName, attributes: [
    NSAttributedString.Key(kCTFontAttributeName as String): nameFont,
    NSAttributedString.Key(kCTForegroundColorAttributeName as String): fill,
    NSAttributedString.Key(kCTStrokeColorAttributeName as String): stroke,
    NSAttributedString.Key(kCTStrokeWidthAttributeName as String): -3.0
  ])
  let nameLine = CTLineCreateWithAttributedString(nameAttr)
  var nameAscent: CGFloat = 0, nameDescent: CGFloat = 0, nameLeading: CGFloat = 0
  let nameWidth = CGFloat(CTLineGetTypographicBounds(nameLine, &nameAscent, &nameDescent, &nameLeading))
  ctx.textPosition = CGPoint(x: (CGFloat(W) - nameWidth) / 2.0, y: CGFloat(textH) - CGFloat(W) * 0.08 - nameAscent)
  CTLineDraw(nameLine, ctx)

  // User copy (centered, wrapped, outlined), up to 3 lines
  let copyFont = CTFontCreateWithName("PingFangSC-Medium" as CFString, CGFloat(W) * 0.072, nil)
  let para = NSMutableParagraphStyle()
  para.alignment = .center
  para.lineBreakMode = .byCharWrapping
  let copyAttr = NSAttributedString(string: text, attributes: [
    NSAttributedString.Key(kCTFontAttributeName as String): copyFont,
    NSAttributedString.Key(kCTForegroundColorAttributeName as String): fill,
    NSAttributedString.Key(kCTStrokeColorAttributeName as String): stroke,
    NSAttributedString.Key(kCTStrokeWidthAttributeName as String): -2.5,
    NSAttributedString.Key(kCTParagraphStyleAttributeName as String): para
  ])
  let framesetter = CTFramesetterCreateWithAttributedString(copyAttr)
  let copyHeight = CGFloat(textH) - CGFloat(W) * 0.20
  let path = CGPath(rect: CGRect(x: CGFloat(W) * 0.05, y: 4, width: CGFloat(W) * 0.90, height: max(10, copyHeight)), transform: nil)
  let frame = CTFramesetterCreateFrame(framesetter, CFRangeMake(0, 0), path, nil)
  CTFrameDraw(frame, ctx)

  return ctx.makeImage()
}

let frameCount = Int(seconds * fps)
let delaySec = 1.0 / fps

guard let dest = CGImageDestinationCreateWithURL(output as CFURL, UTType.gif.identifier as CFString, frameCount, nil) else { print("NO DEST"); exit(1) }
CGImageDestinationSetProperties(dest, [kCGImagePropertyGIFDictionary: [kCGImagePropertyGIFLoopCount: 0]] as CFDictionary)

var written = 0
for i in 0..<frameCount {
  let at = CMTime(seconds: Double(i) / fps, preferredTimescale: 600)
  guard let raw = try? generator.copyCGImage(at: at, actualTime: nil), let cg = makeFrame(raw) else { continue }
  let frameProps = [kCGImagePropertyGIFDictionary: [
    kCGImagePropertyGIFDelayTime: delaySec,
    kCGImagePropertyGIFUnclampedDelayTime: delaySec
  ]] as CFDictionary
  CGImageDestinationAddImage(dest, cg, frameProps)
  written += 1
}
guard CGImageDestinationFinalize(dest) else { print("FINALIZE FAIL"); exit(1) }
print("ok \(W)x\(H) charH=\(charH) fps=\(fps) sec=\(seconds) frames=\(written)")
