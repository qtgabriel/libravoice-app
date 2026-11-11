import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    StyleSheet,
    Text,
    View,
    TextInput,
    TouchableOpacity,
    ActivityIndicator,
    KeyboardAvoidingView,
    Keyboard,
    Platform,
    Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { getApiBaseUrl } from '../hooks/useLibrasSpelling';
import { Brand } from '@/constants/theme';

type SignItem = string;

const isVideoUrl = (item?: SignItem) =>
    typeof item === 'string' &&
    (item.includes('.mp4') || item.startsWith('http'));

const normalizeUrl = (url: string) => {
    try {
        return encodeURI(decodeURI(url));
    } catch {
        return encodeURI(url);
    }
};

const REQUEST_TIMEOUT_MS = 15000;

function SignVideo({ uri, onEnd }: { uri: string; onEnd: () => void }) {
    const finishedRef = useRef(false);
    const [failed, setFailed] = useState(false);

    const finish = useCallback(() => {
        if (finishedRef.current) return;
        finishedRef.current = true;
        onEnd();
    }, [onEnd]);

    const player = useVideoPlayer(normalizeUrl(uri), p => {
        p.loop = false;
        p.muted = true;
        p.play();
    });

    useEffect(() => {
        const endSub = player.addListener('playToEnd', finish);
        if (player.status === 'readyToPlay') player.play();

        const statusSub = player.addListener('statusChange', ({ status, error }) => {
            if (status === 'readyToPlay') {
                player.play();
            } else if (status === 'error') {
                console.warn('Erro ao carregar vídeo:', uri, error);
                setFailed(true);
            }
        });
        return () => {
            endSub.remove();
            statusSub.remove();
        };
    }, [player, finish, uri]);

    useEffect(() => {
        if (!failed) return;
        const t = setTimeout(finish, 2000);
        return () => clearTimeout(t);
    }, [failed, finish]);

    if (failed) {
        return (
            <View style={styles.videoArea}>
                <Text style={styles.videoErrorText}>
                    Não foi possível carregar este vídeo.
                </Text>
            </View>
        );
    }

    return (
        <View style={styles.videoArea}>
            <VideoView
                player={player}
                style={StyleSheet.absoluteFill}
                contentFit="contain"
                nativeControls={false}
                allowsPictureInPicture={false}
                onFirstFrameRender={() => player.play()}
            />
        </View>
    );
}

export default function TextToLibras() {
    const insets = useSafeAreaInsets();

    const [inputText, setInputText] = useState('');
    const [signs, setSigns] = useState<SignItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const [currentIndex, setCurrentIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [runId, setRunId] = useState(0);
    const [isListening, setIsListening] = useState(false);

    async function handleFetchSigns(text: string) {
        if (!text.trim() || loading) return;
        Keyboard.dismiss();
        setLoading(true);
        setError('');
        setIsPlaying(false);
        setSigns([]);
        setCurrentIndex(0);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        try {
            const res = await fetch(`${getApiBaseUrl()}/textToLibras/translate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: text }),
                signal: controller.signal,
            });

            const data = await res.json();

            if (data.status != 200) {
                setError('Não foi possível traduzir o texto.');
                setSigns([]);
                return;
            }

            if (data.data && data.data.length > 0) {
                setSigns(data.data);
                setCurrentIndex(0);
                setRunId(r => r + 1);
                setIsPlaying(true);
            } else {
                setError('Nenhum sinal encontrado para o texto.');
            }
        } catch (err: any) {
            console.error(err);
            setError(
                err?.name === 'AbortError'
                    ? 'O servidor demorou demais para responder.'
                    : 'Erro de conexão com o servidor.'
            );
        } finally {
            clearTimeout(timeout);
            setLoading(false);
        }
    }

    const advanceFrom = useCallback(
        (index: number) => {
            if (index < signs.length - 1) {
                setCurrentIndex(prev => (prev === index ? index + 1 : prev));
            } else {
                setIsPlaying(false);
            }
        },
        [signs.length]
    );

    useEffect(() => {
        if (!isPlaying || signs.length === 0) return;
        if (isVideoUrl(signs[currentIndex])) return;

        const index = currentIndex;
        const timer = setTimeout(() => advanceFrom(index), 2000);
        return () => clearTimeout(timer);
    }, [currentIndex, isPlaying, signs, advanceFrom]);

    const currentItem = signs[currentIndex];
    const isCurrentVideo = isVideoUrl(currentItem);
    const hasSigns = signs.length > 0 && !loading && currentItem !== undefined;

    // --- CONFIGURAÇÃO DO EXPO-SPEECH-RECOGNITION ---
    useSpeechRecognitionEvent('result', (event) => {
        const text = event.results[0]?.transcript;
        if (text) {
            setInputText(text);
            handleFetchSigns(text); // Traduz automaticamente ao reconhecer a fala
        }
    });

    useSpeechRecognitionEvent('start', () => setIsListening(true));
    useSpeechRecognitionEvent('end', () => setIsListening(false));
    useSpeechRecognitionEvent('error', (event) => {
        console.error('Erro no reconhecimento de voz:', event.error);
        setIsListening(false);
        setError('Erro no reconhecimento de voz.');
    });

    const startListening = async () => {
        try {
            setError('');
            const permissionResult = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
            
            if (!permissionResult.granted) {
                Alert.alert('Permissão negada', 'Precisamos de acesso ao microfone para traduzir a voz.');
                return;
            }

            ExpoSpeechRecognitionModule.start({
                lang: 'pt-BR',
                interimResults: true,
                maxAlternatives: 1,
                continuous: false,
            });
        } catch (e) {
            console.error(e);
            setIsListening(false);
            setError('Não foi possível iniciar o microfone.');
        }
    };

    const stopListening = async () => {
        try {
            ExpoSpeechRecognitionModule.stop();
        } catch (e) {
            console.error(e);
            setIsListening(false);
        }
    };

    return (
        <KeyboardAvoidingView
            style={styles.root}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            {/* Área principal do vídeo/sinais */}
            <View style={[styles.stage, hasSigns && isCurrentVideo && styles.stageDark]}>
                {loading && <ActivityIndicator size="large" color={Brand.yellow} />}

                {!loading && error ? (
                    <Text style={styles.errorText}>{error}</Text>
                ) : null}

                {hasSigns && (
                    <>
                        {isCurrentVideo ? (
                            isPlaying ? (
                                <SignVideo
                                    key={`${runId}-${currentIndex}`}
                                    uri={currentItem}
                                    onEnd={() => advanceFrom(currentIndex)}
                                />
                            ) : (
                                <View style={styles.videoArea} />
                            )
                        ) : (
                            <Text style={styles.signText}>{currentItem}</Text>
                        )}

                        <View style={styles.counterBadge} pointerEvents="none">
                            <Text style={styles.counterText}>
                                Passo {currentIndex + 1} de {signs.length}
                            </Text>
                        </View>
                    </>
                )}
            </View>

            {/* Barra Inferior Unificada (Microfone + Input + Botão Traduzir) */}
            <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
                <TouchableOpacity
                    style={[styles.micButton, isListening && styles.micButtonActive]}
                    onPress={isListening ? stopListening : startListening}
                >
                    <Text style={styles.micButtonText}>
                        {isListening ? '🛑' : '🎤'}
                    </Text>
                </TouchableOpacity>

                <TextInput
                    style={styles.input}
                    value={inputText}
                    onChangeText={setInputText}
                    placeholder={isListening ? 'Ouvindo...' : 'Digite ou fale o texto...'}
                    placeholderTextColor={Brand.muted}
                    selectionColor={Brand.yellow}
                    keyboardAppearance="dark"
                    returnKeyType="send"
                    onSubmitEditing={() => handleFetchSigns(inputText)}
                    autoCorrect={false}
                />

                <TouchableOpacity
                    style={[styles.button, loading && styles.buttonDisabled]}
                    onPress={() => handleFetchSigns(inputText)}
                    disabled={loading}
                >
                    <Text style={[styles.buttonText, loading && styles.buttonTextDisabled]}>
                        {loading ? 'Traduzindo...' : 'Traduzir'}
                    </Text>
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: Brand.black,
    },
    stage: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
    },
    stageDark: {
        backgroundColor: Brand.black,
        padding: 0,
    },
    videoArea: {
        ...StyleSheet.absoluteFill,
        backgroundColor: Brand.black,
        alignItems: 'center',
        justifyContent: 'center',
    },
    videoErrorText: {
        color: Brand.white,
        fontSize: 16,
        textAlign: 'center',
        paddingHorizontal: 20,
    },
    signText: {
        fontSize: 36,
        fontWeight: 'bold',
        color: Brand.yellow,
        textAlign: 'center',
    },
    counterBadge: {
        position: 'absolute',
        top: 12,
        alignSelf: 'center',
        backgroundColor: 'rgba(0,0,0,0.72)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 14,
    },
    counterText: {
        fontSize: 14,
        color: Brand.white,
        fontWeight: '600',
    },
    errorText: {
        color: Brand.danger,
        fontSize: 15,
        textAlign: 'center',
    },
    inputBar: {
        flexDirection: 'row',
        gap: 10,
        paddingHorizontal: 16,
        paddingTop: 12,
        backgroundColor: Brand.black,
        borderTopWidth: 1,
        borderTopColor: Brand.border,
        alignItems: 'center',
    },
    input: {
        flex: 1,
        height: 50,
        backgroundColor: Brand.surface,
        borderWidth: 1,
        borderColor: Brand.border,
        borderRadius: 8,
        paddingHorizontal: 15,
        fontSize: 16,
        color: Brand.white,
    },
    button: {
        backgroundColor: Brand.yellow,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 16,
        borderRadius: 8,
        height: 50,
        minWidth: 90,
    },
    buttonDisabled: {
        backgroundColor: Brand.surfaceAlt,
    },
    buttonText: {
        color: Brand.black,
        fontSize: 16,
        fontWeight: 'bold',
    },
    buttonTextDisabled: {
        color: Brand.muted,
    },
    micButton: {
        backgroundColor: Brand.surface,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 8,
        height: 50,
        width: 50,
        borderWidth: 1,
        borderColor: Brand.border,
    },
    micButtonActive: {
        backgroundColor: '#ff4757', // Vermelho quando ativo ouvindo
    },
    micButtonText: {
        fontSize: 20,
    },
});