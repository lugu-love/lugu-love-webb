
import AppKit
import Foundation
import AVFoundation
import CoreImage
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

guard CommandLine.arguments.count == 6 else { exit(2) }
let input = URL(fileURLWithPath: CommandLine.arguments[1])
let output = URL(fileURLWithPath: CommandLine.arguments[2])
let text = CommandLine.arguments[3]
let emotionName = CommandLine.arguments[4]
let quality = CommandLine.arguments[5]

let cfg: [String:(Int, Double)] = [
  "A": (300, 8.0),
  "B": (340, 10.0),
  "C": (380, 12.0)
]
guard let (outW, fps) = cfg[quality] else { print("BAD QUALITY"); exit(2) }
let charSize = outW
let textH = Int(Double(outW) * 0.62)
let canvasH = charSize + textH

let asset = AVURLAsset(url: input)
let generator = AVAssetImageGenerator(asset: asset)
generator.appliesPreferredTrackTransform = true
generator.maximumSize = CGSize(width: outW, height: outW * 4 / 3)
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

let frameCount = Int((CMTimeGetSeconds(asset.duration) * fps).rounded(.down))
let delay = 1.0 / fps

func renderFrame(_ raw: CGImage) -> CGImage? {
  guard let keyed = keyKernel?.apply(extent: CIImage(cgImage: raw).extent, arguments: [CIImage(cgImage: raw)]),
        let charCG = ciContext.createCGImage(keyed, from: CIImage(cgImage: raw).extent) else { return nil }
  let canvas = CGContext(data: nil, width: outW, height: canvasH, bitsPerComponent: 8, bytesPerRow: 0,
                         space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  canvas.clear(CGRect(x: 0, y: 0, width: outW, height: canvasH))
  // character (top, square)
  canvas.draw(charCG, in: CGRect(x: 0, y: textH, width: outW, height: charSize))
  // text area
  let img = NSImage(size: NSSize(width: outW, height: canvasH))
  img.lockFocus()
  if let ctx = NSGraphicsContext.current?.cgContext {
    ctx.draw(canvas.makeImage()!, in: CGRect(x: 0, y: 0, width: outW, height: canvasH))
  }
  let para = NSMutableParagraphStyle()
  para.alignment = .center
  para.lineBreakMode = .byWordWrapping
  // emotion name
  let nameFont = NSFont.boldSystemFont(ofSize: CGFloat(outW) * 0.105)
  let nameAttrs: [NSAttributedString.Key: Any] = [.font: nameFont, .foregroundColor: NSColor(calibratedRed: 1.0, green: 0.88, blue: 0.62, alpha: 1.0), .paragraphStyle: para]
  (emotionName as NSString).draw(at: NSPoint(x: 0, y: CGFloat(textH) - CGFloat(outW) * 0.12), withAttributes: nameAttrs)
  // user copy (wrapped, up to 3 lines)
  let copyFont = NSFont.systemFont(ofSize: CGFloat(outW) * 0.072, weight: .medium)
  let copyPara = NSMutableParagraphStyle()
  copyPara.alignment = .center
  copyPara.lineBreakMode = .byCharWrapping
  let copyAttrs: [NSAttributedString.Key: Any] = [.font: copyFont, .foregroundColor: NSColor(calibratedWhite: 0.96, alpha: 1.0), .paragraphStyle: copyPara]
  let copyRect = NSRect(x: CGFloat(outW) * 0.04, y: 6, width: CGFloat(outW) * 0.92, height: CGFloat(textH) - CGFloat(outW) * 0.20)
  (text as NSString).draw(with: copyRect, options: [.usesLineFragmentOrigin, .usesFontLeading], attributes: copyAttrs, context: nil)
  img.unlockFocus()
  var finalCG: CGImage?
  if let tiff = img.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff) {
    finalCG = rep.cgImage
  }
  return finalCG
}

guard let dest = CGImageDestinationCreateWithURL(output as CFURL, UTType.gif.identifier as CFString, frameCount, nil) else { print("NO DEST"); exit(1) }
CGImageDestinationSetProperties(dest, [kCGImagePropertyGIFLoopCount: 0] as CFDictionary)

var written = 0
for frame in 0..<frameCount {
  let at = CMTime(seconds: Double(frame) / fps, preferredTimescale: 600)
  guard let raw = try? generator.copyCGImage(at: at, actualTime: nil), let cg = renderFrame(raw) else { continue }
  let frameProps: [CFString: Any] = [kCGImagePropertyGIFDelayTime: delay, kCGImagePropertyGIFUnclampedDelayTime: delay]
  CGImageDestinationAddImage(dest, cg, frameProps as CFDictionary)
  written += 1
}
guard CGImageDestinationFinalize(dest) else { print("FINALIZE FAIL"); exit(1) }
print("ok quality=\(quality) size=\(outW)x\(canvasH) frames=\(written)")
