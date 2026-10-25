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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';

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

function getApiBaseUrl(): string {
    const fromEnv = process.env.EXPO_PUBLIC_API_URL;
    if (fromEnv) return fromEnv.replace(/\/$/, '');

    const host = Platform.OS === 'android' ? '10.0.2.2' : '127.0.0.1';
    return `http://${host}:8000`;
}

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
        p.muted = true; // Safari exige; no celular também evita som inesperado
        p.play();
    });

    useEffect(() => {
        const endSub = player.addListener('playToEnd', finish);
        // Na web, play() antes do <video> montar não faz nada; repetimos quando ficar pronto.
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

    // Se o vídeo falhar, mostra o aviso por 2s e segue para o próximo passo.
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

    // Itens que não são vídeo (texto) avançam por timer.
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

    return (
        <KeyboardAvoidingView
            style={styles.root}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            {/* Área principal: ocupa todo o espaço acima do input */}
            <View style={[styles.stage, hasSigns && isCurrentVideo && styles.stageDark]}>
                {loading && <ActivityIndicator size="large" color="#009432" />}

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
                                // Sequência terminou: tela preta, sem o último frame do vídeo
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

            {/* Input fixo na parte de baixo */}
            <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
                <TextInput
                    style={styles.input}
                    value={inputText}
                    onChangeText={setInputText}
                    placeholder="Digite o texto para traduzir..."
                    placeholderTextColor="#888"
                    returnKeyType="send"
                    onSubmitEditing={() => handleFetchSigns(inputText)}
                    autoCorrect={false}
                />
                <TouchableOpacity
                    style={[styles.button, loading && styles.buttonDisabled]}
                    onPress={() => handleFetchSigns(inputText)}
                    disabled={loading}
                >
                    <Text style={styles.buttonText}>
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
        backgroundColor: '#f5f6fa',
    },
    stage: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
    },
    stageDark: {
        backgroundColor: '#000',
        padding: 0,
    },
    videoArea: {
        ...StyleSheet.absoluteFill,
        backgroundColor: '#000',
        alignItems: 'center',
        justifyContent: 'center',
    },
    videoErrorText: {
        color: '#fff',
        fontSize: 16,
        textAlign: 'center',
        paddingHorizontal: 20,
    },
    signText: {
        fontSize: 36,
        fontWeight: 'bold',
        color: '#009432',
        textAlign: 'center',
    },
    counterBadge: {
        position: 'absolute',
        top: 12,
        alignSelf: 'center',
        backgroundColor: 'rgba(0,0,0,0.55)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 14,
    },
    counterText: {
        fontSize: 14,
        color: '#fff',
        fontWeight: '600',
    },
    errorText: {
        color: '#e84118',
        fontSize: 15,
        textAlign: 'center',
    },
    inputBar: {
        flexDirection: 'row',
        gap: 10,
        paddingHorizontal: 16,
        paddingTop: 12,
        backgroundColor: '#fff',
        borderTopWidth: 1,
        borderTopColor: '#dcdde1',
    },
    input: {
        flex: 1,
        height: 50,
        backgroundColor: '#f5f6fa',
        borderWidth: 1,
        borderColor: '#dcdde1',
        borderRadius: 8,
        paddingHorizontal: 15,
        fontSize: 16,
        color: '#2f3640',
    },
    button: {
        backgroundColor: '#009432',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 16,
        borderRadius: 8,
        height: 50,
        minWidth: 100,
    },
    buttonDisabled: {
        backgroundColor: '#718093',
    },
    buttonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
});