# Build e execução

Guia curto de comandos para instalar, rodar e gerar builds nativas (iOS e Android).

## Pré-requisitos

- Node 22/24 + npm.
- **iOS**: Xcode 27+, CocoaPods (`pod`), Apple ID configurada no Xcode, iPhone físico.
- **Android**: Android Studio (JDK/SDK), NDK **27.1.12297006**, CMake, build-tools **37.0.0**,
  Android físico (ou emulador com webcam).
- Backend Python (`libravoice-server`) na mesma rede do celular, ou via `adb reverse`.

## Instalar e validar

```bash
npm ci
npx tsc --noEmit
npx expo-doctor
```

## Backend

```bash
cd ../libravoice-server
source .venv/bin/activate
PYTHONPATH=src uvicorn main:app --host 0.0.0.0 --port 8000
```

`PYTHONPATH=src` é necessário enquanto os `views.py` importarem `utils.*` como top-level.
Se os imports já usarem `src.utils`, pode rodar só `uvicorn main:app --host 0.0.0.0 --port 8000`.

## Metro / dev client

```bash
npx expo start --dev-client
npx expo start --dev-client -c   # limpa o cache do Metro
```

## iPhone

```bash
npx expo run:ios --device
```

- Xcode → target `libravoiceapp` → **Signing & Capabilities** → Team.
- No iPhone: **Modo Desenvolvedor** ligado; na primeira instalação, confie no desenvolvedor em
  Ajustes → Geral → VPN e Gerenciamento de Dispositivos.
- Simulador iOS não tem câmera: `npx expo run:ios` só valida build/launch.

## Android

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"

adb devices
npx expo run:android              # emulador
npx expo run:android --device     # aparelho físico
```

### SDK necessário

No SDK Manager (Show Package Details):

- NDK **27.1.12297006**
- CMake **3.22.1**
- Android SDK Build-Tools **37.0.0**
- Android SDK Platform 37

Se o Gradle falhar com `NDK ... did not have a source.properties`, apague a pasta
`~/Library/Android/sdk/ndk/27.1.12297006` e reinstale o NDK pelo SDK Manager.

### Emulador

```bash
emulator -avd Medium_Phone
```

Para testar a mão: no emulador, **Extended Controls → Camera → Front → Webcam0**.

### USB, rede e Wi-Fi

```bash
# Android só por USB, sem depender de Wi-Fi
adb reverse tcp:8081 tcp:8081
adb reverse tcp:8000 tcp:8000
EXPO_PUBLIC_API_URL=http://127.0.0.1:8000 npx expo run:android --device
```

```bash
# Celular e Mac na mesma Wi-Fi
ipconfig getifaddr en0
EXPO_PUBLIC_API_URL=http://$(ipconfig getifaddr en0):8000 npx expo run:android --device
```

Depuração sem fio (Android 11+): Opções do desenvolvedor → Depuração sem fio → Parear.

```bash
adb pair <ip>:<porta-de-pareamento>   # informe o código
adb connect <ip>:<porta-de-depuração>
adb devices
```

## Nativo / Nitro

```bash
npm run specs                    # regenera nitrogen após mudar o .nitro.ts
npx expo prebuild                # recria ios/ e android/ (CNG)
npx expo prebuild --clean        # apaga e recria; reconfigura signing/pods
cd ios && pod install            # se o Expo não chamar
cd android && ./gradlew clean    # limpeza do Gradle
```

> `prebuild --clean` apaga `ios/` e `android/`. O código nativo do app fica em
> `modules/hand-landmarks/` e sobrevive; você só precisa escolher o time do Xcode de novo.

## Limpeza

```bash
npx expo start -c
rm -rf .expo
cd android && ./gradlew clean
cd ios && rm -rf Pods Podfile.lock && pod install
```

## Verificação

```bash
npx tsc --noEmit
npx expo export --platform ios
npx expo export --platform android
```

## O que versionar (e o que não)

**Versionar:**

- `app.json`, `package.json`, `package-lock.json`, `babel.config.js`
- `modules/hand-landmarks/**` (Swift, Kotlin, Gradle/CMake, `nitrogen/` e os `.task`)
- `.env.example`

**Não versionar (gerado):**

- `ios/`, `android/` — recriados por `npx expo prebuild`
- `Pods/`, `build/`, `.cxx/`, `.gradle/`, `DerivedData/`
- `node_modules/`, `.expo/`, `dist/`

Se você mudar a interface Nitro (`HandLandmarks.nitro.ts`), rode `npm run specs` e **commite**
`modules/hand-landmarks/nitrogen/generated/**`; sem isso o build em outra máquina/EAS falha.

## Troubleshooting rápido

- **`No Android connected device found`**: `adb devices`; ative depuração USB, autorize o RSA,
  troque o cabo/porta ou use a depuração sem fio.
- **`NDK ... source.properties`**: NDK incompleto; apague a pasta e reinstale 27.1.12297006.
- **`No code signing certificates`**: Xcode → Settings → Accounts → Apple ID → Manage Certificates
  → Apple Development; depois escolha o Team no target.
- **`Untrusted Developer` no iPhone**: Ajustes → Geral → VPN e Gerenciamento de Dispositivos →
  confie no “Apple Development: …”.
- **Câmera abre mas não detecta**: confira a permissão de câmera, a mão dentro da caixa e, no
  emulador, a câmera frontal em `Webcam0`.
- **Vídeos da UFSC com `Trust anchor ... not found`**: o servidor envia só o leaf; o Android
  confia no intermediário Let's Encrypt **YR2** apenas em `videos.nals.cce.ufsc.br`, via
  [`plugins/withUfscVideoTrust.js`](plugins/withUfscVideoTrust.js) +
  [`plugins/certs/ufsc-video-yr2.pem`](plugins/certs/ufsc-video-yr2.pem). Rode
  `npx expo prebuild --clean` e rebuild. A correção definitiva é a UFSC servir `fullchain.pem`;
  se o intermediário mudar, atualize o PEM.
- **API não responde**: `uvicorn` com `--host 0.0.0.0`, mesma Wi-Fi/firewall do macOS ou
  `adb reverse tcp:8000 tcp:8000` + `EXPO_PUBLIC_API_URL=http://127.0.0.1:8000`.
