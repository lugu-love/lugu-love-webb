
import AVFoundation
guard CommandLine.arguments.count == 4 else { exit(2) }
let video = URL(fileURLWithPath: CommandLine.arguments[1])
let audio = URL(fileURLWithPath: CommandLine.arguments[2])
let output = URL(fileURLWithPath: CommandLine.arguments[3])
try? FileManager.default.removeItem(at: output)
let comp = AVMutableComposition()
let va = AVURLAsset(url: video)
let aa = AVURLAsset(url: audio)
let vt = comp.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)!
let at = comp.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)!
let vsrc = va.tracks(withMediaType: .video).first!
let asrc = aa.tracks(withMediaType: .audio).first!
try! vt.insertTimeRange(CMTimeRange(start: .zero, duration: va.duration), of: vsrc, at: .zero)
try! at.insertTimeRange(CMTimeRange(start: .zero, duration: min(aa.duration, va.duration)), of: asrc, at: .zero)
let ex = AVAssetExportSession(asset: comp, presetName: AVAssetExportPresetHighestQuality)!
ex.outputURL = output
ex.outputFileType = .mp4
let sem = DispatchSemaphore(value: 0)
ex.exportAsynchronously { sem.signal() }
sem.wait()
print("mux status=\(ex.status.rawValue) err=\(String(describing: ex.error))")
