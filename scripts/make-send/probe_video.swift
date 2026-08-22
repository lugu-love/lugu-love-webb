
import Foundation
import AVFoundation
import CoreImage
import CoreGraphics

let path = CommandLine.arguments[1]
let asset = AVURLAsset(url: URL(fileURLWithPath: path))
let gen = AVAssetImageGenerator(asset: asset)
gen.appliesPreferredTrackTransform = true
gen.maximumSize = CGSize(width: 720, height: 1280)
gen.requestedTimeToleranceBefore = .zero
gen.requestedTimeToleranceAfter = .zero
guard let cg = try? gen.copyCGImage(at: CMTime(seconds: 0.5, preferredTimescale: 600), actualTime: nil) else { print("NO FRAME"); exit(1) }
let w = cg.width, h = cg.height
var data = [UInt8](repeating: 0, count: w*h*4)
let ctx = CGContext(data: &data, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w*4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.draw(cg, in: CGRect(x:0,y:0,width:w,height:h))
func px(_ x:Int,_ y:Int) -> (Int,Int,Int){ let i=(y*w+x)*4; return (Int(data[i]),Int(data[i+1]),Int(data[i+2])) }
print("size \(w)x\(h)")
let ys = [0, h/4, h/2, 3*h/4, h-1]
let xs = [0, w/4, w/2, 3*w/4, w-1]
for y in ys { var row=""; for x in xs { let (r,g,b)=px(x,y); row += "(\(r),\(g),\(b)) " }; print("y=\(y): \(row)") }
