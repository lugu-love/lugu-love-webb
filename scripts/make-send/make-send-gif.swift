
import Foundation
import AVFoundation
import CoreImage
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
import MobileCoreServices

guard CommandLine.arguments.count == 4 else { exit(2) }
let input = URL(fileURLWithPath: CommandLine.arguments[1])
let output = URL(fileURLWithPath: CommandLine.arguments[2])
let outW = Int(CommandLine.arguments[3]) ?? 360

let asset = AVURLAsset(url: input)
let generator = AVAssetImageGenerator(asset: asset)
generator.appliesPreferredTrackTransform = true
generator.maximumSize = CGSize(width: outW, height: outW * 4 / 3)
generator.requestedTimeToleranceBefore = .zero
generator.requestedTimeToleranceAfter = .zero
let ciContext = CIContext(options: [.useSoftwareRenderer: false])

// Blue-screen key + despill; binary alpha for GIF (1-bit transparency).
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

let fps = 12.0
let frameCount = Int((CMTimeGetSeconds(asset.duration) * fps).rounded(.down))
let delay = 1.0 / fps

guard let dest = CGImageDestinationCreateWithURL(output as CFURL, UTType.gif.identifier as CFString, frameCount, nil) else { print("NO DEST"); exit(1) }
let gifProps: [CFString: Any] = [kCGImagePropertyGIFLoopCount: 0]
CGImageDestinationSetProperties(dest, gifProps as CFDictionary)

for frame in 0..<frameCount {
  let at = CMTime(seconds: Double(frame) / fps, preferredTimescale: 600)
  guard let raw = try? generator.copyCGImage(at: at, actualTime: nil) else { continue }
  let ci = CIImage(cgImage: raw)
  guard let keyed = keyKernel?.apply(extent: ci.extent, arguments: [ci]),
        let cg = ciContext.createCGImage(keyed, from: ci.extent) else { continue }
  let frameProps: [CFString: Any] = [
    kCGImagePropertyGIFDelayTime: delay,
    kCGImagePropertyGIFUnclampedDelayTime: delay
  ]
  CGImageDestinationAddImage(dest, cg, frameProps as CFDictionary)
}
guard CGImageDestinationFinalize(dest) else { print("FINALIZE FAIL"); exit(1) }
print("gif frames=\(frameCount) size=\(outW)")
