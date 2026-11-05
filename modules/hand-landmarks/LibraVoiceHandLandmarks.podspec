require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "LibraVoiceHandLandmarks"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = "https://github.com/qtgabriel/libravoice-app"
  s.license      = "MIT"
  s.authors      = "Gabriel Teodoro"

  # VisionCamera v5 / MediaPipeTasksVision both require iOS 15.5+.
  s.platforms    = { :ios => "16.4" }
  s.source       = { :path => "." }

  s.source_files = [
    # Our Swift implementation
    "ios/**/*.{swift,h,m,mm}",
  ]
  s.resources = [
    # Bundled into the app so MediaPipe can load it from Bundle.main.
    "ios/Resources/hand_landmarker.task",
  ]
  s.frameworks = ["AVFoundation", "CoreMedia", "CoreVideo", "UIKit"]

  s.dependency "MediaPipeTasksVision", "1.0.0"
  s.dependency "VisionCamera"
  s.dependency "NitroModules"
  s.dependency "React-jsi"
  s.dependency "React-callinvoker"

  load 'nitrogen/generated/ios/LibraVoiceHandLandmarks+autolinking.rb'
  add_nitrogen_files(s)

  install_modules_dependencies(s)
end
