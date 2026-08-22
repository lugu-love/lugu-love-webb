
import Foundation
import AVFoundation
import CoreImage
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

guard CommandLine.arguments.count == 3 else { exit(2) }
let input = URL(fileURLWithPath: CommandLine.arguments[1])
let outputDir = URL(fileURLWithPath: CommandLine.arguments[2], isDirectory: true)
try FileManager.default.createDirectory(at: outputDir, withIntermediateDirectories: true)

let asset = AVURLAsset(url: input)
let generator = AVAssetImageGenerator(asset: asset)
generator.appliesPreferredTrackTransform = true
generator.maximumSize = CGSize(width: 1080, height: 1920)
generator.requestedTimeToleranceBefore = .zero
generator.requestedTimeToleranceAfter = .zero
let ciContext = CIContext(options: [.useSoftwareRenderer: false])

// Blue-screen key + despill + feather (same logic as bottle keyer, at native res).
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

guard let raw = try? generator.copyCGImage(at: CMTime(seconds: 0.4, preferredTimescale: 600), actualTime: nil) else { print("NO FRAME"); exit(1) }
let ci = CIImage(cgImage: raw)
guard let keyed = keyKernel?.apply(extent: ci.extent, arguments: [ci]),
      let cg = ciContext.createCGImage(keyed, from: ci.extent) else { print("KEY FAIL"); exit(1) }

let w = cg.width, h = cg.height
var data = [UInt8](repeating: 0, count: w*h*4)
let ctx = CGContext(data: &data, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w*4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))

var minX = w, minY = h, maxX = -1, maxY = -1
for y in 0..<h { for x in 0..<w {
  let a = data[(y*w+x)*4+3]
  if a > 8 {
    if x < minX { minX = x }
    if x > maxX { maxX = x }
    if y < minY { minY = y }
    if y > maxY { maxY = y }
  }
}}
if maxX < 0 { print("EMPTY"); exit(1) }
let pad = 8
minX = max(0, minX - pad); minY = max(0, minY - pad)
maxX = min(w-1, maxX + pad); maxY = min(h-1, maxY + pad)
let cropRect = CGRect(x: minX, y: minY, width: maxX-minX+1, height: maxY-minY+1)
let cropped = cg.cropping(to: cropRect)!
func save(_ image: CGImage, _ url: URL) throws {
  guard let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil) else { throw NSError() }
  CGImageDestinationAddImage(dest, image, nil)
  CGImageDestinationFinalize(dest)
}
let outPNG = outputDir.appendingPathComponent("sticker.png")
try save(cropped, outPNG)
print("ok \(cropped.width)x\(cropped.height) -> \(outPNG.path)")
