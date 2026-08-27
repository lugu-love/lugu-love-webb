import Foundation
import AVFoundation
import CoreGraphics
import ImageIO
import CoreText
import AppKit

let sheetDir = CommandLine.arguments[1]   // e.g. assets/video/fengxin-rabbit-angry-sprites-hd
let output = URL(fileURLWithPath: CommandLine.arguments[2])

let W = 720, H = 1280, fps: Int32 = 18, seconds = 10.0
let cell = 540, cols = 4, rows = 3

// load sheets (sheet-00..sheet-07) -> array of cell CGImage
var frames: [CGImage] = []
let fm = FileManager.default
let names = (try! fm.contentsOfDirectory(atPath: sheetDir)).filter { $0.hasSuffix(".webp") }.sorted()
for name in names {
    let url = URL(fileURLWithPath: sheetDir + "/" + name)
    guard let src = CGImageSourceCreateWithURL(url as CFURL, nil),
          let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else { continue }
    for r in 0..<rows {
        for c in 0..<cols {
            let rect = CGRect(x: c*cell, y: r*cell, width: cell, height: cell)
            if let sub = img.cropping(to: rect) { frames.append(sub) }
        }
    }
}
print("loaded \(frames.count) sprite frames from \(names.count) sheets")

// V2 draw rect (bottom-left origin): rabbit bbox ~540x600, center (360,410)
let drawX: CGFloat = 52
let drawW: CGFloat = 652
let drawH: CGFloat = 619
let drawY = CGFloat(H) - 99 - drawH   // top-origin y=99 -> bottom-origin

// background gradient
let bgTop = NSColor(calibratedRed: 0.06, green: 0.07, blue: 0.16, alpha: 1.0).cgColor
let bgBot = NSColor(calibratedRed: 0.18, green: 0.11, blue: 0.22, alpha: 1.0).cgColor

func drawFrame(pixelBuffer: CVPixelBuffer, char: CGImage) {
    CVPixelBufferLockBaseAddress(pixelBuffer, [])
    let ctx = CGContext(data: CVPixelBufferGetBaseAddress(pixelBuffer), width: W, height: H, bitsPerComponent: 8,
                        bytesPerRow: CVPixelBufferGetBytesPerRow(pixelBuffer),
                        space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue)!
    let colors = [bgTop, bgBot] as CFArray
    let grad = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0,1])!
    ctx.drawLinearGradient(grad, start: CGPoint(x:0,y:CGFloat(H)), end: CGPoint(x:0,y:0), options: [])
    ctx.draw(char, in: CGRect(x: drawX, y: drawY, width: drawW, height: drawH))
    CVPixelBufferUnlockBaseAddress(pixelBuffer, [])
}

let writer = try! AVAssetWriter(outputURL: output, fileType: .mp4)
let vsettings: [String: Any] = [AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: W, AVVideoHeightKey: H, AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 2500*1000, AVVideoExpectedSourceFrameRateKey: fps]]
let vinput = AVAssetWriterInput(mediaType: .video, outputSettings: vsettings)
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: vinput, sourcePixelBufferAttributes: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
    kCVPixelBufferWidthKey as String: W, kCVPixelBufferHeightKey as String: H
])
writer.add(vinput)
writer.startWriting()
writer.startSession(atSourceTime: .zero)

let frameCount = Int(seconds * Double(fps))
for i in 0..<frameCount {
    let char = frames[i % frames.count]
    var pb: CVPixelBuffer?
    CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &pb)
    guard let buf = pb else { continue }
    drawFrame(pixelBuffer: buf, char: char)
    adaptor.append(buf, withPresentationTime: CMTime(value: CMTimeValue(i), timescale: fps))
}
vinput.markAsFinished()
let sem = DispatchSemaphore(value: 0)
writer.finishWriting { sem.signal() }
sem.wait()
print("ok v2 master \(W)x\(H) fps=\(fps) sec=\(seconds) frames=\(frameCount) status=\(writer.status.rawValue)")
