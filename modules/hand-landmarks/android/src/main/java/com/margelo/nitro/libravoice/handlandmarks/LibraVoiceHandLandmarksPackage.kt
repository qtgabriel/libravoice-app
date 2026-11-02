package com.margelo.nitro.libravoice.handlandmarks

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfoProvider

/**
 * React Native package whose only job is to load the Nitro C++ library.
 * The `HandLandmarks` HybridObject itself is created by NitroModules on JS.
 */
class LibraVoiceHandLandmarksPackage : BaseReactPackage() {
  override fun getModule(
    name: String,
    reactContext: ReactApplicationContext,
  ): NativeModule? = null

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider =
    ReactModuleInfoProvider { HashMap() }

  companion object {
    init {
      LibraVoiceHandLandmarksOnLoad.initializeNative()
    }
  }
}
