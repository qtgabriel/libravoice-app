import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Linking,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
    Camera,
    useCameraPermission,
    useFrameOutput,
} from 'react-native-vision-camera';
import { NitroModules } from 'react-native-nitro-modules';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { HandLandmarks } from 'libravoice-hand-landmarks';
import { useLibrasSpelling, type Landmark, type Roi } from '@/hooks/useLibrasSpelling';
import { Brand } from '@/constants/theme';

// Frame de saída em retrato (640x480 rotacionado pelo VisionCamera): 480x640.
// A caixa é um quadrado de ROI_SIZE_PX pixels, centralizado. Ajuste este
// número para aumentar/diminuir a área de detecção (ex.: 360, 400).
const FRAME_W = 480;
const FRAME_H = 640;
const ROI_SIZE_PX = 320;
const NATIVE_ROI: Roi = {
    x1: (FRAME_W - ROI_SIZE_PX) / 2 / FRAME_W,
    y1: (FRAME_H - ROI_SIZE_PX) / 2 / FRAME_H,
    x2: (FRAME_W + ROI_SIZE_PX) / 2 / FRAME_W,
    y2: (FRAME_H + ROI_SIZE_PX) / 2 / FRAME_H,
};
const MODEL_MISSING =
    'O modelo hand_landmarker.task não foi encontrado no bundle. Rode `npx expo prebuild` e recompile o app.';

type PluginState = { plugin: HandLandmarks | null; error: string };

let handLandmarksSingleton: HandLandmarks | null = null;

function getHandLandmarks(): HandLandmarks {
    if (handLandmarksSingleton == null) {
        handLandmarksSingleton =
            NitroModules.createHybridObject<HandLandmarks>('HandLandmarks');
    }
    return handLandmarksSingleton;
}

export default function LibrasToTextNative() {
    return <LibrasToTextCamera />;
}

function LibrasToTextCamera() {
    const insets = useSafeAreaInsets();
    const { hasPermission, requestPermission, canRequestPermission } = useCameraPermission();
    const { word, apiError, pushLandmarks, lastConfidence } =
        useLibrasSpelling(NATIVE_ROI);

    // Cria o HybridObject uma única vez. Se o módulo nativo não estiver no
    // build, mostramos o erro em vez de derrubar a tela.
    const [pluginState] = useState<PluginState>(() => {
        try {
            return { plugin: getHandLandmarks(), error: '' };
        } catch (e) {
            return {
                plugin: null,
                error: e instanceof Error ? e.message : String(e),
            };
        }
    });
    const plugin = pluginState.plugin;

    const [inBox, setInBox] = useState(false);
    const [active, setActive] = useState(false);
    const [landmarks, setLandmarks] = useState<Landmark[] | null>(null);
    const [frameSize, setFrameSize] = useState<{ width: number; height: number } | null>(null);
    const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 });
    const lastOverlayAtRef = useRef(0);
    const loggedFrameRef = useRef(false);

    useEffect(() => {
        if (!hasPermission) requestPermission();
    }, [hasPermission, requestPermission]);

    // Só liga a câmera enquanto a tela está em foco.
    useFocusEffect(
        useCallback(() => {
            setActive(true);
            return () => setActive(false);
        }, [])
    );

    // Roda no JS (fora do worklet) quando o plugin devolve os 63 números.
    const onLandmarks = useCallback(
        (flat: number[], frameWidth: number, frameHeight: number) => {
            if (frameWidth > 0 && frameHeight > 0) {
                setFrameSize(prev =>
                    prev?.width === frameWidth && prev?.height === frameHeight
                        ? prev
                        : { width: frameWidth, height: frameHeight }
                );
                if (!loggedFrameRef.current) {
                    loggedFrameRef.current = true;
                    console.log(`[HandLandmarks] frame ${frameWidth}x${frameHeight}`);
                }
            }

            const now = Date.now();
            if (!flat || flat.length < 63) {
                setInBox(false);
                pushLandmarks(null);
                setLandmarks(prev => (prev == null ? prev : null));
                return;
            }
            const pts: Landmark[] = [];
            for (let i = 0; i < 63; i += 3) {
                // O preview da câmera frontal é espelhado, mas o frame output
                // entrega os landmarks sem espelho. Espelhamos o X para alinhar
                // com o preview e manter a quiralidade usada no treino
                // (o Python faz cv2.flip antes de detectar).
                pts.push({ x: 1 - flat[i], y: flat[i + 1], z: flat[i + 2] });
            }
            setInBox(pushLandmarks(pts));

            // Atualiza o overlay ~12x/s; 30x/s de re-render é desperdício.
            if (now - lastOverlayAtRef.current > 80) {
                lastOverlayAtRef.current = now;
                setLandmarks(pts);
            }
        },
        [pushLandmarks]
    );

    const frameOutput = useFrameOutput({
        targetResolution: { width: 640, height: 480 },
        pixelFormat: 'rgb',
        dropFramesWhileBusy: true,
        // Faz o VisionCamera rotacionar o buffer para a orientação de saída.
        // Assim os landmarks ficam no mesmo sistema do preview (e o MediaPipe
        // recebe a mão em pé, não deitada).
        enablePhysicalBufferRotation: true,
        onFrame(frame) {
            'worklet';
            try {
                if (plugin == null) return;
                const landmarks = plugin.detect(frame);
                scheduleOnRN(onLandmarks, landmarks, frame.width, frame.height);
            } catch {
                // Um frame ruim não pode derrubar a câmera.
            } finally {
                frame.dispose();
            }
        },
    });

    // Evita recriar os arrays a cada render (o que reconfigura a sessão).
    const outputs = useMemo(() => [frameOutput], [frameOutput]);
    const constraints = useMemo(() => [{ fps: 30 }], []);

    // O preview usa `resizeMode="cover"`: o frame é escalado para cobrir a view.
    // Calculamos o mesmo retângulo para alinhar ROI e landmarks.
    const previewLayout = useMemo(() => {
        if (!frameSize || previewSize.width <= 0 || previewSize.height <= 0) {
            return null;
        }
        const scale = Math.max(
            previewSize.width / frameSize.width,
            previewSize.height / frameSize.height
        );
        const contentW = frameSize.width * scale;
        const contentH = frameSize.height * scale;
        return {
            contentW,
            contentH,
            offsetX: (previewSize.width - contentW) / 2,
            offsetY: (previewSize.height - contentH) / 2,
        };
    }, [frameSize, previewSize]);

    if (plugin == null) {
        return (
            <View style={styles.center}>
                <Text style={styles.errorTitle}>Módulo nativo não encontrado</Text>
                <Text style={styles.text}>
                    O plugin `HandLandmarks` não está no build. Recompile com
                    `npx expo run:ios --device` (não use Expo Go nem o simulador).
                </Text>
                <Text style={styles.mono}>{pluginState.error}</Text>
            </View>
        );
    }

    if (!plugin.isReady) {
        return (
            <View style={styles.center}>
                <Text style={styles.errorTitle}>Modelo não carregado</Text>
                <Text style={styles.text}>{MODEL_MISSING}</Text>
            </View>
        );
    }

    if (!hasPermission) {
        return (
            <View style={styles.center}>
                <Text style={styles.text}>O app precisa de acesso à câmera.</Text>
                <TouchableOpacity
                    style={styles.button}
                    onPress={() => {
                        if (canRequestPermission) {
                            requestPermission();
                        } else {
                            Linking.openSettings();
                        }
                    }}
                >
                    <Text style={styles.buttonText}>
                        {canRequestPermission ? 'Permitir câmera' : 'Abrir Ajustes'}
                    </Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View
                style={styles.preview}
                onLayout={e => {
                    const { width, height } = e.nativeEvent.layout;
                    setPreviewSize(prev =>
                        prev.width === width && prev.height === height
                            ? prev
                            : { width, height }
                    );
                }}
            >
                <Camera
                    style={StyleSheet.absoluteFill}
                    device="front"
                    isActive={active}
                    outputs={outputs}
                    constraints={constraints}
                    mirrorMode="auto"
                    resizeMode="cover"
                />

                {previewLayout ? (
                    <View
                        pointerEvents="none"
                        style={[
                            styles.roi,
                            {
                                left:
                                    previewLayout.offsetX +
                                    NATIVE_ROI.x1 * previewLayout.contentW,
                                top:
                                    previewLayout.offsetY +
                                    NATIVE_ROI.y1 * previewLayout.contentH,
                                width:
                                    (NATIVE_ROI.x2 - NATIVE_ROI.x1) *
                                    previewLayout.contentW,
                                height:
                                    (NATIVE_ROI.y2 - NATIVE_ROI.y1) *
                                    previewLayout.contentH,
                                borderColor: inBox ? Brand.yellow : Brand.white,
                            },
                        ]}
                    />
                ) : null}

                {previewLayout &&
                    landmarks?.map((p, i) => (
                        <View
                            key={i}
                            pointerEvents="none"
                            style={[
                                styles.dot,
                                {
                                    left:
                                        previewLayout.offsetX +
                                        p.x * previewLayout.contentW,
                                    top:
                                        previewLayout.offsetY +
                                        p.y * previewLayout.contentH,
                                },
                            ]}
                        />
                    ))}

                <View
                    style={[styles.hud, { bottom: Math.max(insets.bottom, 12) }]}
                    pointerEvents="none"
                >
                    {apiError ? <Text style={styles.error}>{apiError}</Text> : null}
                    <Text style={styles.wordLabel}>Palavra detectada</Text>
                    <Text style={styles.word}>{word || '—'}</Text>
                    <Text style={styles.confidence}>
                        confiança {lastConfidence == null ? '—' : lastConfidence.toFixed(2)}
                    </Text>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Brand.black,
    },
    center: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        gap: 14,
        backgroundColor: Brand.black,
    },
    text: { fontSize: 15, color: Brand.muted, textAlign: 'center', lineHeight: 22 },
    errorTitle: { fontSize: 18, fontWeight: 'bold', color: Brand.danger, textAlign: 'center' },
    mono: { fontSize: 12, color: Brand.muted, textAlign: 'center', fontFamily: 'Courier' },
    preview: {
        flex: 1,
        width: '100%',
        backgroundColor: Brand.black,
        overflow: 'hidden',
    },
    roi: { position: 'absolute', borderWidth: 3, borderRadius: 6 },
    dot: {
        position: 'absolute',
        width: 7,
        height: 7,
        borderRadius: 3.5,
        marginLeft: -3.5,
        marginTop: -3.5,
        backgroundColor: Brand.yellow,
    },
    hud: {
        position: 'absolute',
        left: 12,
        right: 12,
        backgroundColor: 'rgba(0,0,0,0.72)',
        borderRadius: 12,
        padding: 12,
    },
    error: {
        color: Brand.danger,
        fontSize: 13,
        marginBottom: 6,
    },
    confidence: { color: Brand.muted, fontSize: 12, marginTop: 2 },
    wordLabel: { color: Brand.muted, fontSize: 12 },
    word: { color: Brand.yellow, fontSize: 30, fontWeight: 'bold', letterSpacing: 4 },
    button: {
        backgroundColor: Brand.yellow,
        paddingHorizontal: 20,
        height: 46,
        borderRadius: 12,
        justifyContent: 'center',
    },
    buttonText: { color: Brand.black, fontSize: 16, fontWeight: 'bold' },
});
