import type { HybridObject } from 'react-native-nitro-modules';
import type { Frame } from 'react-native-vision-camera';

/**
 * On-device MediaPipe HandLandmarker for VisionCamera v5.
 *
 * Created from JS with:
 *   NitroModules.createHybridObject<HandLandmarks>('HandLandmarks')
 *
 * `detect()` returns 63 numbers (21 landmarks × x, y, z), already oriented and
 * mirrored according to the frame, or an empty array when no hand was found.
 */
export interface HandLandmarks
  extends HybridObject<{ ios: 'swift'; android: 'kotlin' }> {
  /** Whether the `hand_landmarker.task` model was loaded successfully. */
  readonly isReady: boolean;

  /** Runs MediaPipe on a single camera frame. */
  detect(frame: Frame): number[];
}
