module.exports = {
  dependency: {
    platforms: {
      ios: {},
      android: {
        packageImportPath:
          'import com.margelo.nitro.libravoice.handlandmarks.LibraVoiceHandLandmarksPackage;',
        packageInstance: 'new LibraVoiceHandLandmarksPackage()',
      },
    },
  },
};
