//
//  HybridHandLandmarks.swift
//  LibraVoiceHandLandmarks
//
//  Runs Google's MediaPipe HandLandmarker on a VisionCamera v5 `Frame`.
//  The model is the same `hand_landmarker.task` used by the Python backend,
//  with the same options (VIDEO mode, 1 hand, 0.7 confidences).
//

import AVFoundation
import CoreMedia
import Foundation
import MediaPipeTasksVision
import NitroModules
import UIKit
import VisionCamera

final class HybridHandLandmarks: HybridHandLandmarksSpec {
  private var handLandmarker: HandLandmarker?
  private var lastTimestampMs: Int = 0

  override init() {
    super.init()

    // CocoaPods copies `s.resources` into the main app bundle. `Bundle(for:)`
    // is a fallback for when the pod is built as a framework.
    let moduleBundle = Bundle(for: HybridHandLandmarks.self)
    guard let modelPath = Bundle.main.path(forResource: "hand_landmarker", ofType: "task")
      ?? moduleBundle.path(forResource: "hand_landmarker", ofType: "task")
    else {
      print("[HandLandmarks] hand_landmarker.task not found in bundle!")
      return
    }

    let options = HandLandmarkerOptions()
    options.baseOptions.modelAssetPath = modelPath
    options.runningMode = .video
    options.numHands = 1
    options.minHandDetectionConfidence = 0.7
    options.minHandPresenceConfidence = 0.7
    options.minTrackingConfidence = 0.7

    do {
      self.handLandmarker = try HandLandmarker(options: options)
      print("[HandLandmarks] model loaded from \(modelPath)")
    } catch {
      print("[HandLandmarks] failed to create HandLandmarker: \(error)")
    }
  }

  var isReady: Bool {
    return handLandmarker != nil
  }

  func detect(frame: any HybridFrameSpec) throws -> [Double] {
    guard let landmarker = handLandmarker else {
      return []
    }

    // VisionCamera's public `NativeFrame` exposes the underlying CMSampleBuffer.
    guard let nativeFrame = frame as? any NativeFrame,
          let sampleBuffer = nativeFrame.sampleBuffer,
          let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer)
    else {
      return []
    }

    // Mirroring + rotation are metadata-only in VisionCamera; MPImage applies
    // them to the inference copy, matching Python's cv2.flip + RGB conversion.
    let imageOrientation = frame.orientation.toUIImageOrientation(isMirrored: frame.isMirrored)
    guard let image = try? MPImage(pixelBuffer: pixelBuffer, orientation: imageOrientation) else {
      return []
    }

    // MediaPipe VIDEO mode requires strictly increasing millisecond timestamps.
    let timestampMs = Int(frame.timestamp * 1000.0)
    if timestampMs <= lastTimestampMs {
      lastTimestampMs += 1
    } else {
      lastTimestampMs = timestampMs
    }

    let result = try landmarker.detect(videoFrame: image, timestampInMilliseconds: lastTimestampMs)
    // MediaPipeTasksVision exposes the result as `landmarks` (not `handLandmarks`).
    guard let hand = result.landmarks.first else {
      return []
    }

    // Flatten to [x0, y0, z0, x1, y1, z1, ...] so Nitro can return a number[].
    var landmarks = [Double]()
    landmarks.reserveCapacity(hand.count * 3)
    for landmark in hand {
      landmarks.append(Double(landmark.x))
      landmarks.append(Double(landmark.y))
      landmarks.append(Double(landmark.z))
    }
    return landmarks
  }
}
