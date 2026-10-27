/**
 * Tela Libras -> Texto (WEB).
 * Webcam + MediaPipe HandLandmarker (@mediapipe/tasks-vision), mesma configuração do Python:
 * 1 mão, confiança 0.7, modo VIDEO.
 *
 * O MediaPipe é carregado da CDN em tempo de execução (o Metro não consegue empacotar
 * o @mediapipe/tasks-vision). Mantenha o pacote instalado só para os tipos do TypeScript:
 *   npm i -D @mediapipe/tasks-vision
 * Coloque em:  src/app/libras-to-text.web.tsx   (rota /libras-to-text)
 * O hook fica em src/hooks/useLibrasSpelling.ts
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
// Só tipos: o código do pacote NÃO entra no bundle do Metro (ele não consegue processar
// o vision_bundle.mjs, que usa import() dinâmico). O código real é carregado da CDN abaixo.
import type { HandLandmarker } from '@mediapipe/tasks-vision';
import { useLibrasSpelling, ROI } from '../hooks/useLibrasSpelling';

// O JS e o WASM vêm da mesma versão, na mesma CDN. Ajuste se quiser outra versão.
const TASKS_VISION_VERSION = '0.10.14';
const TASKS_VISION_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}`;
const WASM_URL = `${TASKS_VISION_BASE}/wasm`;

type TasksVision = typeof import('@mediapipe/tasks-vision');

// `new Function` esconde o import() do Metro, que recusa import dinâmico com URL.
// O navegador executa normalmente.
const importFromUrl = new Function('url', 'return import(url)') as (
    url: string
) => Promise<TasksVision>;

let tasksVisionPromise: Promise<TasksVision> | null = null;
function loadTasksVision() {
    if (!tasksVisionPromise) {
        tasksVisionPromise = importFromUrl(`${TASKS_VISION_BASE}/vision_bundle.mjs`);
    }
    return tasksVisionPromise;
}
const MODEL_URL =
    'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

async function createLandmarker() {
    const { FilesetResolver, HandLandmarker } = await loadTasksVision();
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);
    const make = (delegate: 'GPU' | 'CPU') =>
        HandLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: MODEL_URL, delegate },
            runningMode: 'VIDEO',
            numHands: 1,
            minHandDetectionConfidence: 0.7,
            minHandPresenceConfidence: 0.7,
        });
    try {
        return await make('GPU');
    } catch {
        return await make('CPU'); // fallback se o Safari/GPU falhar
    }
}

function drawOverlay(
    canvas: HTMLCanvasElement,
    landmarks: { x: number; y: number }[] | null,
    inBox: boolean
) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { width: w, height: h } = canvas;
    ctx.clearRect(0, 0, w, h);

    // Caixa guia (verde quando o pulso está dentro, vermelha fora)
    ctx.strokeStyle = inBox ? '#00c853' : '#e84118';
    ctx.lineWidth = 3;
    ctx.strokeRect(ROI.x1 * w, ROI.y1 * h, (ROI.x2 - ROI.x1) * w, (ROI.y2 - ROI.y1) * h);

    if (landmarks) {
        ctx.fillStyle = '#00ff66';
        for (const l of landmarks) {
            ctx.beginPath();
            // o vídeo é exibido espelhado, então desenhamos com x invertido
            ctx.arc((1 - l.x) * w, l.y * h, 4, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

export default function LibrasToTextWeb() {
    const { word, apiError, pushLandmarks } = useLibrasSpelling();

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [status, setStatus] = useState('Carregando modelo...');

    useEffect(() => {
        let stopped = false;
        let raf = 0;
        let stream: MediaStream | null = null;
        let landmarker: HandLandmarker | null = null;

        async function start() {
            landmarker = await createLandmarker();
            if (stopped) return;

            setStatus('Abrindo câmera...');
            stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 640, height: 480, facingMode: 'user' },
                audio: false,
            });
            if (stopped) return;

            const video = videoRef.current!;
            video.srcObject = stream;
            video.muted = true;
            await video.play();
            setStatus('');

            let lastVideoTime = -1;
            const loop = () => {
                if (stopped) return;
                const canvas = canvasRef.current;
                if (video.readyState >= 2 && video.currentTime !== lastVideoTime && canvas) {
                    lastVideoTime = video.currentTime;
                    canvas.width = video.videoWidth || 640;
                    canvas.height = video.videoHeight || 480;

                    const result = landmarker!.detectForVideo(video, performance.now());
                    const hand = result.landmarks[0] ?? null;
                    const points = hand ? hand.map(l => ({ x: l.x, y: l.y, z: l.z })) : null;

                    const inBox = pushLandmarks(points);
                    drawOverlay(canvas, points, inBox);
                }
                raf = requestAnimationFrame(loop);
            };
            loop();
        }

        start().catch(e => {
            console.error(e);
            setStatus(
                'Não foi possível iniciar a câmera ou o modelo. Verifique a permissão de câmera e use http://localhost.'
            );
        });

        return () => {
            stopped = true;
            cancelAnimationFrame(raf);
            stream?.getTracks().forEach(t => t.stop());
            landmarker?.close();
        };
    }, [pushLandmarks]);

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Libras para Texto</Text>

            <div
                style={{
                    position: 'relative',
                    width: '100%',
                    maxWidth: 640,
                    aspectRatio: '4 / 3',
                    background: '#000',
                    borderRadius: 12,
                    overflow: 'hidden',
                }}
            >
                <video
                    ref={videoRef}
                    playsInline
                    muted
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        transform: 'scaleX(-1)', // espelhado, como o cv2.flip do Python
                    }}
                />
                <canvas
                    ref={canvasRef}
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
                />
            </div>

            {status ? <Text style={styles.status}>{status}</Text> : null}
            {apiError ? <Text style={styles.error}>{apiError}</Text> : null}

            <View style={styles.wordBox}>
                <Text style={styles.wordLabel}>Palavra</Text>
                <Text style={styles.word}>{word || '—'}</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        padding: 20,
        gap: 14,
        backgroundColor: '#f5f6fa',
    },
    title: { fontSize: 22, fontWeight: 'bold', color: '#2f3640' },
    status: { color: '#718093', fontSize: 14, textAlign: 'center' },
    error: { color: '#e84118', fontSize: 14, textAlign: 'center' },
    wordBox: {
        width: '100%',
        maxWidth: 640,
        backgroundColor: '#000',
        borderRadius: 12,
        padding: 16,
    },
    wordLabel: { color: '#8e9aa6', fontSize: 12, marginBottom: 4 },
    word: { color: '#00ff66', fontSize: 32, fontWeight: 'bold', letterSpacing: 4 },
});