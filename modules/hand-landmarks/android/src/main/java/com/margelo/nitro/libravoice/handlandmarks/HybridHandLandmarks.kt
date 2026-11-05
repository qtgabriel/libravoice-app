package com.margelo.nitro.libravoice.handlandmarks

import android.graphics.Bitmap
import android.util.Log
import androidx.annotation.OptIn
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageProxy
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.vision.core.ImageProcessingOptions
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.handlandmarker.HandLandmarker
import com.margelo.nitro.NitroModules
import com.margelo.nitro.camera.HybridFrameSpec
import com.margelo.nitro.camera.public.NativeFrame

/**
 * On-device MediaPipe HandLandmarker for VisionCamera v5 (Android).
 *
 * VisionCamera's frame output is configured with `enablePhysicalBufferRotation`,
 * so the ImageProxy is already rotated to the preview orientation. The JS side
 * mirrors the X axis (front camera preview) and maps the points to the preview.
 */
class HybridHandLandmarks : HybridHandLandmarksSpec() {
  @Volatile
  private var handLandmarker: HandLandmarker? = null
  private var lastTimestampMs: Long = 0

  init {
    ensureLandmarker()
  }

  override val isReady: Boolean
    get() = handLandmarker != null

  @Synchronized
  private fun ensureLandmarker(): HandLandmarker? {
    handLandmarker?.let { return it }

    val context = NitroModules.applicationContext
    if (context == null) {
      Log.e(TAG, "ReactApplicationContext is not available yet; cannot create HandLandmarker")
      return null
    }

    return try {
      val baseOptions = BaseOptions.builder()
        .setModelAssetPath("hand_landmarker.task")
        .build()
      val options = HandLandmarker.HandLandmarkerOptions.builder()
        .setBaseOptions(baseOptions)
        .setRunningMode(RunningMode.VIDEO)
        .setNumHands(1)
        .setMinHandDetectionConfidence(0.7f)
        .setMinHandPresenceConfidence(0.7f)
        .setMinTrackingConfidence(0.7f)
        .build()

      val landmarker = HandLandmarker.createFromOptions(context, options)
      handLandmarker = landmarker
      Log.i(TAG, "HandLandmarker created")
      landmarker
    } catch (e: Throwable) {
      Log.e(TAG, "Failed to create HandLandmarker", e)
      null
    }
  }

  @OptIn(ExperimentalGetImage::class)
  override fun detect(frame: HybridFrameSpec): DoubleArray {
    val landmarker = ensureLandmarker() ?: return DoubleArray(0)
    val nativeFrame = frame as? NativeFrame ?: return DoubleArray(0)

    val imageProxy: ImageProxy = nativeFrame.image
    val bitmap: Bitmap = try {
      imageProxy.toBitmap()
    } catch (e: Throwable) {
      Log.e(TAG, "Failed to convert ImageProxy to Bitmap", e)
      return DoubleArray(0)
    }

    return try {
      val mpImage = BitmapImageBuilder(bitmap).build()

      // On Android `Frame.timestamp` is nanoseconds (CameraX ImageInfo).
      val timestampMs = (frame.timestamp / 1_000_000.0).toLong()
      if (timestampMs <= lastTimestampMs) {
        lastTimestampMs += 1
      } else {
        lastTimestampMs = timestampMs
      }

      // MediaPipe 1.x requires ImageProcessingOptions; the buffer is already
      // physically rotated by VisionCamera, so no extra rotation is needed.
      val imageProcessingOptions = ImageProcessingOptions.builder().build()
      val result = landmarker.detectForVideo(mpImage, imageProcessingOptions, lastTimestampMs)
      val hand = result.landmarks().firstOrNull() ?: return DoubleArray(0)

      val out = DoubleArray(hand.size * 3)
      var i = 0
      for (landmark in hand) {
        // MediaPipe's NormalizedLandmark exposes x(), y(), z().
        out[i++] = landmark.x().toDouble()
        out[i++] = landmark.y().toDouble()
        out[i++] = landmark.z().toDouble()
      }
      out
    } catch (e: Throwable) {
      Log.e(TAG, "MediaPipe detectForVideo failed", e)
      DoubleArray(0)
    } finally {
      bitmap.recycle()
    }
  }

  override fun dispose() {
    super.dispose()
    handLandmarker?.close()
    handLandmarker = null
  }

  private companion object {
    private const val TAG = "HybridHandLandmarks"
  }
}
