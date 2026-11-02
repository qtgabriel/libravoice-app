//
//  CameraOrientation+UIImage.swift
//  LibraVoiceHandLandmarks
//
//  VisionCamera exposes `CameraOrientation` as a Nitro enum. MediaPipe's
//  `MPImage` needs the equivalent `UIImage.Orientation`, including the
//  mirrored variants (which is how we reproduce Python's `cv2.flip`).
//

import UIKit
import VisionCamera

extension CameraOrientation {
  func toUIImageOrientation(isMirrored: Bool = false) -> UIImage.Orientation {
    switch self {
    case .up:
      return isMirrored ? .upMirrored : .up
    case .down:
      return isMirrored ? .downMirrored : .down
    case .left:
      return isMirrored ? .leftMirrored : .left
    case .right:
      return isMirrored ? .rightMirrored : .right
    }
  }
}
