# LibraVoice

App de tradução bilateral **PT-BR ⇄ Libras**.

- **Texto → Libras**: o texto é enviado ao FastAPI, que devolve a sequência de vídeos/sinais.
- **Libras → Texto**: o iPhone detecta os 21 pontos da mão **no próprio aparelho** com MediaPipe
  HandLandmarker (VisionCamera v5 + um módulo Nitro local). Só os landmarks vão para o FastAPI,
  que roda o modelo `.pkl` e devolve a letra.

## Stack

- Expo SDK 58 / React Native 0.88 / Expo Router
- VisionCamera **v5** + `react-native-vision-camera-worklets` (frame output)
- `react-native-nitro-modules` + módulo local [`modules/hand-landmarks`](modules/hand-landmarks)
- MediaPipeTasksVision (pod iOS) e `hand_landmarker.task` empacotado no app

## Rodando o backend

No repositório `libravoice-server`:

```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

O `--host 0.0.0.0` é obrigatório para o iPhone alcançar o Mac na rede local.

O app deriva o IP do Mac de `Constants.expoConfig.hostUri` (o host do Metro).
Se precisar forçar outro endereço:

```bash
EXPO_PUBLIC_API_URL=http://192.168.0.10:8000 npx expo start --dev-client
```

## Rodando o app no iPhone

O frame processor e o MediaPipe são código nativo: **não roda no Expo Go nem no simulador**
(simulador não tem câmera). Use um iPhone físico:

```bash
npx expo run:ios --device
```

Na primeira vez, o Xcode pede o time de desenvolvimento (conta Apple). O
`ios/` e o `android/` são gerados (CNG) e estão no `.gitignore`; não edite à mão.

### Modelo e specs nativas

O `hand_landmarker.task` fica em
[`modules/hand-landmarks/ios/Resources`](modules/hand-landmarks/ios/Resources) e é copiado
para o bundle pelo podspec.

Se alterar a interface Nitro (`src/HandLandmarks.nitro.ts`), regenere:

```bash
npm run specs   # cd modules/hand-landmarks && nitrogen
```

Depois rode `npx expo prebuild` (ou `npx expo run:ios`) para o pod enxergar os arquivos novos.

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
modules/hand-landmarks/  módulo Nitro iOS (Swift + MediaPipeTasksVision)
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
