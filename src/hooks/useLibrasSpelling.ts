/**
 * Porta para React Native/TypeScript da lógica do seu teste em Python:
 * - só considera a mão quando o PULSO está dentro da caixa guia (ROI)
 * - acumula 8 frames de 21 pontos e envia para /librasToText/translate
 * - pega a primeira letra de `translated_phrase`, com cooldown de 1,2 s para repetir letra
 * - apaga a palavra após 3,5 s sem mão na caixa
 *
 * Este hook NÃO sabe de onde vêm os pontos: a web (MediaPipe JS) e, no futuro,
 * o celular (frame processor nativo) só precisam chamar `pushLandmarks`.
 *
 * Coloque em: src/hooks/useLibrasSpelling.ts
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Speech from 'expo-speech';

export type Landmark = { x: number; y: number; z: number };

/**
 * Caixa guia em coordenadas normalizadas (0–1).
 * Equivale à caixa de 260 px do Python (frame 640x480, deslocada -50, -50):
 * x de 140 a 400 px, y de 60 a 320 px.
 */
export type Roi = { x1: number; y1: number; x2: number; y2: number };
export const ROI: Roi = { x1: 140 / 640, y1: 60 / 480, x2: 400 / 640, y2: 320 / 480 };

export function getApiBaseUrl(): string {
    const fromEnv = process.env.EXPO_PUBLIC_API_URL;
    if (fromEnv) return fromEnv.replace(/\/$/, '');
    const host = Platform.OS === 'android' ? '10.0.2.2' : '127.0.0.1';
    return `http://${host}:8000`;
}

type Options = {
    bufferSize?: number; // frames por requisição (Python: 8)
    cooldownMs?: number; // tempo para aceitar a mesma letra de novo (Python: 1,2 s)
    inactivityMs?: number; // tempo sem mão na caixa para limpar a palavra (Python: 3,5 s)
    /**
     * O Python espelha o frame (cv2.flip) ANTES de detectar. Com mirror = true,
     * o x dos pontos vira 1 - x para ficar igual ao que o seu backend recebe hoje.
     */
    mirror?: boolean;
    speak?: boolean; // lê a palavra em voz alta antes de apagá-la por inatividade
    language?: string; // idioma da voz
    roi?: Roi; // caixa guia (padrão: a mesma do Python; o celular em retrato usa outra)
};

export function useLibrasSpelling({
                                      bufferSize = 8,
                                      cooldownMs = 1200,
                                      inactivityMs = 3500,
                                      mirror = true,
                                      speak = true,
                                      language = 'pt-BR',
                                      roi = ROI,
                                  }: Options = {}) {
    const [word, setWord] = useState('');
    const [apiError, setApiError] = useState('');

    const wordRef = useRef('');
    const buffer = useRef<Landmark[][]>([]);
    const lastLetter = useRef<string | null>(null);
    const lastLetterAt = useRef(0);
    const lastActivityAt = useRef(Date.now());
    const sending = useRef(false);

    const updateWord = useCallback((next: string) => {
        wordRef.current = next;
        setWord(next);
    }, []);

    const reset = useCallback(() => {
        updateWord('');
        lastLetter.current = null;
        buffer.current = [];
    }, [updateWord]);

    // Lê a palavra em voz alta (interrompe qualquer fala anterior).
    const speakWord = useCallback(
        (text: string) => {
            if (!speak || !text.trim()) return;
            try {
                Speech.stop();
                Speech.speak(text.toLowerCase(), { language, rate: 0.9 });
            } catch (e) {
                console.warn('Erro ao falar:', e);
            }
        },
        [speak, language]
    );

    const sendFrames = useCallback(
        async (frames: Landmark[][]) => {
            sending.current = true;
            try {
                const res = await fetch(`${getApiBaseUrl()}/librasToText/translate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ frames }),
                });
                if (!res.ok) {
                    setApiError(`API respondeu ${res.status}`);
                    return;
                }
                setApiError('');
                const json = await res.json();
                const phrase = json?.data?.translated_phrase;
                if (typeof phrase === 'string' && phrase.length > 0) {
                    const letter = phrase[0];
                    const now = Date.now();
                    if (letter !== lastLetter.current || now - lastLetterAt.current > cooldownMs) {
                        lastLetter.current = letter;
                        lastLetterAt.current = now;
                        updateWord(wordRef.current + letter);
                    }
                }
            } catch (e) {
                console.warn('Erro na requisição:', e);
                setApiError('Erro de conexão com o servidor.');
            } finally {
                sending.current = false;
            }
        },
        [cooldownMs, updateWord]
    );

    /**
     * Chame a cada frame processado. `landmarks` = os 21 pontos da mão (normalizados 0–1)
     * ou null quando não há mão. Retorna true se o pulso está dentro da caixa guia.
     */
    const pushLandmarks = useCallback(
        (landmarks: Landmark[] | null): boolean => {
            if (!landmarks || landmarks.length === 0) return false;

            const wrist = landmarks[0];
            const wristX = mirror ? 1 - wrist.x : wrist.x;
            const inBox =
                wristX >= roi.x1 && wristX <= roi.x2 && wrist.y >= roi.y1 && wrist.y <= roi.y2;
            if (!inBox) return false;

            lastActivityAt.current = Date.now();
            buffer.current.push(
                landmarks.map(l => ({ x: mirror ? 1 - l.x : l.x, y: l.y, z: l.z }))
            );

            if (buffer.current.length >= bufferSize && !sending.current) {
                const frames = buffer.current;
                buffer.current = frames.slice(-2); // mantém os 2 últimos, como no Python
                sendFrames(frames);
            } else if (buffer.current.length > bufferSize * 3) {
                // requisição lenta: não deixa o buffer crescer sem limite
                buffer.current = buffer.current.slice(-bufferSize);
            }
            return true;
        },
        [bufferSize, mirror, roi, sendFrames]
    );

    // Limpa a palavra depois de inatividade.
    useEffect(() => {
        const id = setInterval(() => {
            if (wordRef.current && Date.now() - lastActivityAt.current > inactivityMs) {
                speakWord(wordRef.current); // lê em voz alta ANTES de apagar
                reset();
            }
        }, 250);
        return () => clearInterval(id);
    }, [inactivityMs, reset, speakWord]);

    return { word, apiError, pushLandmarks, reset, speakWord };
}