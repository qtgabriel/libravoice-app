/**
 * Tela Libras -> Texto (iPhone/Android) com react-native-vision-camera (v4).
 *
 * A câmera entrega cada frame a um plugin NATIVO (HandLandmarksFrameProcessorPlugin.swift),
 * que roda o MediaPipe HandLandmarker e devolve os 21 pontos da mão. Aqui os pontos
 * entram no mesmo hook da web (useLibrasSpelling), que envia à API, monta a palavra
 * e lê em voz alta.
 *
 * Não roda no Expo Go nem no simulador (precisa de build de desenvolvimento e iPhone real).
 *
 * Coloque em: src/app/libras-to-text.tsx
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
    Camera,
    useCameraDevice,
    useCameraFormat,
    useCameraPermission,
    useFrameProcessor,
    VisionCameraProxy,
    type Frame,
} from 'react-native-vision-camera';
import { Worklets } from 'react-native-worklets-core';
import { useLibrasSpelling, type Landmark, type Roi } from '../hooks/useLibrasSpelling';

// Caixa guia para o celular em retrato (a do Python é para uma imagem 640x480 deitada).
const NATIVE_ROI: Roi = { x1: 0.1, y1: 0.2, x2: 0.9, y2: 0.8 };

type HandResult = { landmarks: Landmark[]; isMirrored: boolean } | null;

const plugin = VisionCameraProxy.initFrameProcessorPlugin('handLandmarks', {});

function handLandmarks(frame: Frame): HandResult {
    'worklet';
    if (plugin == null) {
        throw new Error(
            'Plugin "handLandmarks" não encontrado. Ele só existe no build nativo (rode expo run:ios).'
        );
    }
    return plugin.call(frame) as unknown as HandResult;
}

export default function LibrasToTextNative() {
    const { hasPermission, requestPermission } = useCameraPermission();
    const device = useCameraDevice('front');
    // 640x480 a 30 fps: o mesmo tamanho do seu teste em Python e leve para o MediaPipe.
    const format = useCameraFormat(device, [
        { videoResolution: { width: 640, height: 480 } },
        { fps: 30 },
    ]);

    const { word, apiError, pushLandmarks } = useLibrasSpelling({ roi: NATIVE_ROI });
    const [inBox, setInBox] = useState(false);
    const [active, setActive] = useState(false);

    useEffect(() => {
        if (!hasPermission) requestPermission();
    }, [hasPermission, requestPermission]);

    // Câmera só ligada enquanto a tela estiver em foco.
    useFocusEffect(
        useCallback(() => {
            setActive(true);
            return () => setActive(false);
        }, [])
    );

    // Executa no JS (fora do worklet) a cada frame processado.
    const onHand = useMemo(
        () =>
            Worklets.createRunOnJS((result: HandResult) => {
                if (!result) {
                    pushLandmarks(null);
                    setInBox(false);
                    return;
                }
                // O hook espera o frame NÃO espelhado e espelha por conta própria (como o
                // cv2.flip do Python). Se a câmera já entregou espelhado, desfazemos antes.
                const raw = result.isMirrored
                    ? result.landmarks.map(l => ({ x: 1 - l.x, y: l.y, z: l.z }))
                    : result.landmarks;
                setInBox(pushLandmarks(raw));
            }),
        [pushLandmarks]
    );

    const frameProcessor = useFrameProcessor(
        frame => {
            'worklet';
            const result = handLandmarks(frame);
            onHand(result);
        },
        [onHand]
    );

    if (!hasPermission) {
        return (
            <View style={styles.center}>
                <Text style={styles.text}>O app precisa de acesso à câmera para ler os sinais.</Text>
                <TouchableOpacity style={styles.button} onPress={() => Linking.openSettings()}>
                    <Text style={styles.buttonText}>Abrir ajustes</Text>
                </TouchableOpacity>
            </View>
        );
    }

    if (device == null) {
        return (
            <View style={styles.center}>
                <Text style={styles.text}>Câmera frontal não encontrada neste aparelho.</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.preview}>
                <Camera
                    style={StyleSheet.absoluteFill}
                    device={device}
                    format={format}
                    fps={30}
                    isActive={active}
                    pixelFormat="rgb" // o MediaPipe precisa de BGRA, não do YUV padrão
                    frameProcessor={frameProcessor}
                />

                {/* Caixa guia: verde quando o pulso está dentro */}
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
                <Text style={styles.wordLabel}>Palavra</Text>
                <Text style={styles.word}>{word || '—'}</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, alignItems: 'center', padding: 16, gap: 12, backgroundColor: '#f5f6fa' },
    center: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        gap: 14,
        backgroundColor: '#f5f6fa',
    },
    text: { fontSize: 15, color: '#718093', textAlign: 'center', lineHeight: 22 },
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
    button: {
        backgroundColor: '#009432',
        paddingHorizontal: 20,
        height: 46,
        borderRadius: 8,
        justifyContent: 'center',
    },
    buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});