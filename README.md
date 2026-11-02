# LibraVoice

App de tradução bilateral **PT-BR ⇄ Libras**.

- **Texto → Libras**: o texto é enviado ao FastAPI, que devolve a sequência de vídeos/sinais.
- **Libras → Texto**: o celular detecta os 21 pontos da mão **no próprio aparelho** com MediaPipe
  HandLandmarker (VisionCamera v5 + um módulo Nitro local). Só os landmarks vão para o FastAPI,
  que roda o modelo `.pkl` e devolve a letra.

## Stack

- Expo SDK 58 / React Native 0.88 / Expo Router
- VisionCamera **v5** + `react-native-vision-camera-worklets` (frame output)
- `react-native-nitro-modules` + módulo local [`modules/hand-landmarks`](modules/hand-landmarks)
- iOS: MediaPipeTasksVision (pod) · Android: `com.google.mediapipe:tasks-vision`
- `hand_landmarker.task` empacotado no app (iOS e Android)

> Comandos de instalação, build nativo, SDK do Android, rede e troubleshooting:
> **[BUILD.md](BUILD.md)**.

## Comandos rápidos

```bash
npm ci                    # instala exatamente o package-lock.json
npx tsc --noEmit          # typecheck
npx expo start --dev-client
npx expo run:ios --device     # iPhone físico
npx expo run:android          # emulador Android
npx expo run:android --device # Android físico
npm run specs             # regenera o Nitro após mudar o .nitro.ts
npx expo prebuild         # recria ios/ e android/ (CNG)
```

`ios/` e `android/` são gerados pelo CNG e não são versionados. O necessário para as builds
está em `app.json`, `package-lock.json` e [`modules/hand-landmarks`](modules/hand-landmarks)
(Swift, Kotlin, Gradle/CMake, `nitrogen/` e os modelos `.task`).

## Rodando o backend

No repositório `libravoice-server`:

```bash
source .venv/bin/activate
PYTHONPATH=src uvicorn main:app --host 0.0.0.0 --port 8000
```

`PYTHONPATH=src` é necessário enquanto os `views.py` importarem `utils.*` como top-level.
Se os imports já usarem `src.utils`, pode rodar só `uvicorn main:app --host 0.0.0.0 --port 8000`.

O `--host 0.0.0.0` é obrigatório para o celular alcançar o Mac na rede local.

O app deriva o IP do Mac de `Constants.expoConfig.hostUri` (o host do Metro).
Se precisar forçar outro endereço:

```bash
EXPO_PUBLIC_API_URL=http://192.168.0.10:8000 npx expo start --dev-client
```

## Rodando no iPhone

O frame processor e o MediaPipe são código nativo: **não roda no Expo Go nem no simulador**
(simulador não tem câmera). Use um iPhone físico:

```bash
npx expo run:ios --device
```

Na primeira vez, o Xcode pede o time de desenvolvimento (conta Apple). O
`ios/` e o `android/` são gerados (CNG) e estão no `.gitignore`; não edite à mão.

## Rodando no Android

Precisa de Android Studio/JDK/SDK local (ou um build EAS) e de um **aparelho físico** — a
câmera virtual do emulador não serve para testar a mão.

```bash
npx expo run:android          # emulador
npx expo run:android --device # aparelho físico
```

O SDK precisa de **NDK 27.1.12297006**, **CMake** e **build-tools 37.0.0** (SDK Manager →
Show Package Details). O passo a passo completo está em [BUILD.md](BUILD.md).

- Em **debug** o HTTP local funciona (`android/app/src/debug/AndroidManifest.xml` permite
  cleartext). Em **release**, use HTTPS ou habilite cleartext via `expo-build-properties`.
- No emulador, o fallback da API é `10.0.2.2:8000`; no aparelho físico, o `hostUri` do Metro
  aponta para o IP do Mac.

### Modelo e specs nativas

O `hand_landmarker.task` fica em
[`modules/hand-landmarks/ios/Resources`](modules/hand-landmarks/ios/Resources) (iOS) e em
[`modules/hand-landmarks/android/src/main/assets`](modules/hand-landmarks/android/src/main/assets)
(Android). No iOS ele é copiado para o bundle pelo podspec; no Android, pelos assets da library.

Se alterar a interface Nitro (`src/HandLandmarks.nitro.ts`), regenere:

```bash
npm run specs   # cd modules/hand-landmarks && nitrogen
```

Depois rode `npx expo prebuild` (ou `npx expo run:ios` / `npx expo run:android`) para o pod e o
Gradle enxergarem os arquivos novos.

> **Commite `modules/hand-landmarks/nitrogen/generated/**` e os dois `.task`.** O EAS/outra
> máquina não roda o `nitrogen` sozinho; sem esses arquivos a build falha.

## Web

A web usa a mesma tela em [`libras-to-text.web.tsx`](src/app/libras-to-text.web.tsx), com
`@mediapipe/tasks-vision` carregado da CDN:

```bash
npx expo start --web
```

Funciona em `http://localhost`. Em outro dispositivo (iPhone Safari), a câmera exige HTTPS.

## Estrutura

```
src/app/                 rotas (index, text-to-libras, libras-to-text)
src/hooks/useLibrasSpelling.ts   envia landmarks, acumula letras, cooldown/inatividade
modules/hand-landmarks/  módulo Nitro iOS (Swift) + Android (Kotlin)
```

## Contrato com a API

`POST /librasToText/translate`

```json
{ "frames": [[{ "x": 0.1, "y": 0.2, "z": 0.0 }, "... 21 pontos ..."]] }
```

Resposta: `{ "status": 200, "data": { "translated_phrase": "A", "predictions_detail": [...] } }`.

> O backend aceita `frames` (lista de frames) ou `landmarks`, mas o
> `process_points` atual itera `frames: None` quando só `landmarks` é enviado.
> Por isso o app manda `frames: [frame]` — um frame por requisição.
