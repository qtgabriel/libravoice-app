import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    StyleSheet,
    Text,
    View,
    TextInput,
    TouchableOpacity,
    ScrollView,
    ActivityIndicator,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

type SignItem = string;

const isVideoUrl = (item?: SignItem) =>
    typeof item === 'string' &&
    (item.includes('.mp4') || item.startsWith('http'));

// URLs com acentos (ex.: .../Vídeos/AMANHÃ.mp4) precisam estar codificadas
// (ex.: .../V%C3%ADdeos/AMANH%C3%83.mp4), senão o Safari/AVFoundation falha.
// decodeURI antes evita codificar duas vezes URLs que já vêm codificadas.
const normalizeUrl = (url: string) => {
    try {
        return encodeURI(decodeURI(url));
    } catch {
        return encodeURI(url);
    }
};

/**
 * Player de um único sinal. É montado com `key` diferente a cada passo,
 * então cada vídeo tem seu próprio player e seu próprio "terminou" (só dispara 1 vez).
 */
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
        p.muted = true; // Safari só permite autoplay sem som
        p.play();
    });

    useEffect(() => {
        const endSub = player.addListener('playToEnd', finish);
        // Na web, play() chamado antes do <video> ser montado não faz nada.
        // Por isso chamamos play() de novo quando o vídeo fica pronto.
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
            <View style={styles.signCard}>
                <Text style={styles.errorText}>Não foi possível carregar este vídeo.</Text>
            </View>
        );
    }

    return (
        <View style={styles.videoWrapper}>
            <VideoView
                player={player}
                style={styles.videoPlayer}
                contentFit="contain"
                nativeControls={false}
                onFirstFrameRender={() => player.play()}
            />
        </View>
    );
}

export default function TextToLibras() {
    const [inputText, setInputText] = useState('');
    const [signs, setSigns] = useState<SignItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const [currentIndex, setCurrentIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [runId, setRunId] = useState(0);

    async function handleFetchSigns(text: string) {
        if (!text.trim()) return;
        setLoading(true);
        setError('');
        setIsPlaying(false);
        setSigns([]);
        setCurrentIndex(0);

        try {
            const apiUrl =
                (process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:8000') +
                '/textToLibras/translate';

            const res = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: text }),
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
        } catch (err) {
            console.error(err);
            setError('Erro de conexão com o servidor.');
        } finally {
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

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <View style={styles.inputContainer}>
                <TextInput
                    style={styles.input}
                    value={inputText}
                    onChangeText={setInputText}
                    placeholder="Digite o texto para traduzir..."
                    placeholderTextColor="#888"
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

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            {loading && (
                <ActivityIndicator
                    size="large"
                    color="#009432"
                    style={{ marginTop: 20 }}
                />
            )}

            {signs.length > 0 && !loading && currentItem !== undefined && (
                <View style={styles.stageContainer}>
                    <Text style={styles.counterText}>
                        Passo {currentIndex + 1} de {signs.length}
                    </Text>

                    {isCurrentVideo ? (
                        isPlaying ? (
                            <SignVideo
                                key={`${runId}-${currentIndex}`}
                                uri={currentItem}
                                onEnd={() => advanceFrom(currentIndex)}
                            />
                        ) : (
                            // Sequência terminou: tela preta, sem o último frame do vídeo
                            <View style={styles.videoWrapper} />
                        )
                    ) : (
                        <View style={styles.signCard}>
                            <Text style={styles.signText}>{currentItem}</Text>
                        </View>
                    )}
                </View>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flexGrow: 1,
        padding: 20,
        alignItems: 'center',
        backgroundColor: '#f5f6fa',
    },
    title: {
        fontSize: 22,
        fontWeight: 'bold',
        marginBottom: 20,
        color: '#2f3640',
        textAlign: 'center',
    },
    inputContainer: {
        width: '100%',
        maxWidth: 600,
        flexDirection: 'row',
        gap: 10,
        marginBottom: 20,
    },
    input: {
        flex: 1,
        height: 50,
        backgroundColor: '#fff',
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
        paddingHorizontal: 20,
        borderRadius: 8,
        height: 50,
    },
    buttonDisabled: {
        backgroundColor: '#718093',
    },
    buttonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    errorText: {
        color: '#e84118',
        fontSize: 14,
        marginBottom: 10,
        textAlign: 'center',
    },
    stageContainer: {
        width: '100%',
        maxWidth: 400,
        alignItems: 'center',
        marginTop: 20,
        padding: 20,
        backgroundColor: '#fff',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#dcdde1',
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 5,
        elevation: 2,
    },
    counterText: {
        fontSize: 14,
        color: '#718093',
        marginBottom: 15,
        fontWeight: '600',
    },
    signCard: {
        padding: 30,
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: 180,
        width: '100%',
    },
    signText: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#009432',
        textAlign: 'center',
    },
    videoWrapper: {
        width: '100%',
        height: 220,
        backgroundColor: '#000',
        borderRadius: 8,
        overflow: 'hidden',
    },
    videoPlayer: {
        width: '100%',
        height: '100%',
    },
});