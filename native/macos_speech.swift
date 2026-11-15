// Uses installed macOS voices only. Generates audio without playing it aloud.
import Foundation
import AVFoundation

let allowed = ["Rishi": "com.apple.voice.compact.en-IN.Rishi",
               "Samantha": "com.apple.voice.compact.en-US.Samantha"]
func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data(message.utf8)); exit(1)
}
if CommandLine.arguments.count == 1 {
    let rows = allowed.keys.sorted().compactMap { name -> [String: String]? in
        guard let voice = AVSpeechSynthesisVoice(identifier: allowed[name]!) else { return nil }
        return ["name": name, "id": voice.identifier, "lang": voice.language]
    }
    print(String(data: try JSONSerialization.data(withJSONObject: rows), encoding: .utf8)!)
    exit(0)
}
guard CommandLine.arguments.count == 2,
      let request = try JSONSerialization.jsonObject(with: FileHandle.standardInput.readDataToEndOfFile()) as? [String: String],
      let text = request["text"], !text.isEmpty,
      let name = request["voice"], let identifier = allowed[name],
      let voice = AVSpeechSynthesisVoice(identifier: identifier), voice.identifier == identifier
else { fail("The requested installed macOS voice is unavailable.") }

let synth = AVSpeechSynthesizer()
let utterance = AVSpeechUtterance(string: text)
utterance.voice = voice
utterance.rate = AVSpeechUtteranceDefaultSpeechRate
let lock = NSLock()
var done = false
var failure: String?
var file: AVAudioFile?
var frames: AVAudioFramePosition = 0
var sampleRate = 0.0
var bytesPerFrame: UInt32 = 0
var words: [[String: Any]] = []

synth.write(utterance, toBufferCallback: { buffer in
    guard let pcm = buffer as? AVAudioPCMBuffer else { return }
    lock.lock(); defer { lock.unlock() }
    if failure != nil { return }
    if pcm.frameLength == 0 { file = nil; done = true; return }
    do {
        if file == nil {
            sampleRate = pcm.format.sampleRate
            bytesPerFrame = pcm.format.streamDescription.pointee.mBytesPerFrame
            file = try AVAudioFile(forWriting: URL(fileURLWithPath: CommandLine.arguments[1]),
                settings: pcm.format.settings, commonFormat: pcm.format.commonFormat,
                interleaved: pcm.format.isInterleaved)
        }
        try file!.write(from: pcm)
        frames += AVAudioFramePosition(pcm.frameLength)
    } catch { failure = "Could not write the native audio file." }
}, toMarkerCallback: { markers in
    lock.lock(); defer { lock.unlock() }
    for marker in markers where marker.mark == .word {
        words.append(["start": marker.textRange.location,
                      "end": marker.textRange.location + marker.textRange.length,
                      "byteOffset": marker.byteSampleOffset])
    }
})
let deadline = Date().addingTimeInterval(180)
while Date() < deadline {
    lock.lock(); let finished = done || failure != nil; lock.unlock()
    if finished { break }
    RunLoop.current.run(until: Date().addingTimeInterval(0.03))
}
lock.lock()
if let message = failure { lock.unlock(); fail(message) }
guard done, sampleRate > 0, bytesPerFrame > 0, frames > 0, !words.isEmpty
else { lock.unlock(); fail("Native speech did not return audio and word timings.") }
let timedWords: [[String: Any]] = words.map { marker in
    ["start": marker["start"]!, "end": marker["end"]!,
     "time": Double(marker["byteOffset"] as! Int) / Double(bytesPerFrame) / sampleRate]
}
let result: [String: Any] = ["voice": voice.identifier, "duration": Double(frames) / sampleRate, "words": timedWords]
lock.unlock()
print(String(data: try JSONSerialization.data(withJSONObject: result), encoding: .utf8)!)
