import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Linking,
    Platform,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
    Camera,
    useCameraPermission,
    useFrameOutput,
} from 'react-native-vision-camera';
import { NitroModules } from 'react-native-nitro-modules';
import { scheduleOnRN } from 'react-native-worklets';
import * as Speech from 'expo-speech';
import type { HandLandmarks } from 'libravoice-hand-landmarks';
import { useLibrasSpelling, type Landmark, type Roi } from '../hooks/useLibrasSpelling';

// Caixa guia em retrato (o treino foi feito em 640x480 deitado).
const NATIVE_ROI: Roi = { x1: 0.15, y1: 0.2, x2: 0.85, y2: 0.8 };
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
    // O módulo Nitro é iOS-only por enquanto (Android ficaria sem o plugin).
    if (Platform.OS !== 'ios') {
        return (
            <View style={styles.center}>
                <Text style={styles.text}>
                    Libras para texto está disponível apenas no iOS por enquanto.
                </Text>
            </View>
        );
    }
    return <IosLibrasToText />;
}

function IosLibrasToText() {
    const { hasPermission, requestPermission, canRequestPermission } = useCameraPermission();
    const { word, apiError, pushLandmarks, reset } = useLibrasSpelling(NATIVE_ROI);

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
        (flat: number[]) => {
            if (!flat || flat.length < 63) {
                setInBox(false);
                pushLandmarks(null);
                return;
            }
            const pts: Landmark[] = [];
            for (let i = 0; i < 63; i += 3) {
                pts.push({ x: flat[i], y: flat[i + 1], z: flat[i + 2] });
            }
            setInBox(pushLandmarks(pts));
        },
        [pushLandmarks]
    );

    const frameOutput = useFrameOutput({
        targetResolution: { width: 640, height: 480 },
        pixelFormat: 'rgb',
        dropFramesWhileBusy: true,
        onFrame(frame) {
            'worklet';
            try {
                if (plugin == null) return;
                const landmarks = plugin.detect(frame);
                scheduleOnRN(onLandmarks, landmarks);
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

    const speak = useCallback(() => {
        if (!word) return;
        Speech.stop();
        Speech.speak(word, { language: 'pt-BR', rate: 0.9 });
    }, [word]);

    const clear = useCallback(() => {
        Speech.stop();
        setInBox(false);
        reset();
    }, [reset]);

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
            <View style={styles.preview}>
                <Camera
                    style={StyleSheet.absoluteFill}
                    device="front"
                    isActive={active}
                    outputs={outputs}
                    constraints={constraints}
                    mirrorMode="auto"
                    resizeMode="cover"
                />
                <View
                    pointerEvents="none"
                    style={[
                        styles.roi,
                        {
                            left: `${NATIVE_ROI.x1 * 100}%`,
                            top: `${NATIVE_ROI.y1 * 100}%`,
                            width: `${(NATIVE_ROI.x2 - NATIVE_ROI.x1) * 100}%`,
                            height: `${(NATIVE_ROI.y2 - NATIVE_ROI.y1) * 100}%`,
                            borderColor: inBox ? '#00c853' : '#e84118',
                        },
                    ]}
                />
            </View>

            {apiError ? <Text style={styles.error}>{apiError}</Text> : null}

            <View style={styles.wordBox}>
                <Text style={styles.wordLabel}>Palavra detectada</Text>
                <Text style={styles.word}>{word || '—'}</Text>
            </View>

            <View style={styles.actions}>
                <TouchableOpacity
                    style={[styles.actionButton, !word && styles.actionDisabled]}
                    onPress={speak}
                    disabled={!word}
                >
                    <Text style={styles.actionText}>Ouvir</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.actionButton, !word && styles.actionDisabled]}
                    onPress={clear}
                    disabled={!word}
                >
                    <Text style={styles.actionText}>Limpar</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        padding: 16,
        gap: 12,
        backgroundColor: '#f5f6fa',
    },
    center: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        gap: 14,
        backgroundColor: '#f5f6fa',
    },
    text: { fontSize: 15, color: '#718093', textAlign: 'center', lineHeight: 22 },
    errorTitle: { fontSize: 18, fontWeight: 'bold', color: '#e84118', textAlign: 'center' },
    mono: { fontSize: 12, color: '#718093', textAlign: 'center', fontFamily: 'Courier' },
    preview: {
        width: '100%',
        maxWidth: 480,
        aspectRatio: 3 / 4,
        backgroundColor: '#000',
        borderRadius: 12,
        overflow: 'hidden',
    },
    roi: { position: 'absolute', borderWidth: 3, borderRadius: 6 },
    error: { color: '#e84118', fontSize: 14, textAlign: 'center' },
    wordBox: {
        width: '100%',
        maxWidth: 480,
        backgroundColor: '#000',
        borderRadius: 12,
        padding: 16,
    },
    wordLabel: { color: '#8e9aa6', fontSize: 12, marginBottom: 4 },
    word: { color: '#00ff66', fontSize: 32, fontWeight: 'bold', letterSpacing: 4 },
    actions: { flexDirection: 'row', gap: 12 },
    actionButton: {
        backgroundColor: '#009432',
        paddingHorizontal: 20,
        height: 44,
        borderRadius: 8,
        justifyContent: 'center',
    },
    actionDisabled: { backgroundColor: '#b2bec3' },
    actionText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
    button: {
        backgroundColor: '#009432',
        paddingHorizontal: 20,
        height: 46,
        borderRadius: 8,
        justifyContent: 'center',
    },
    buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
