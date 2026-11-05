import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Speech from 'expo-speech';

export type Landmark = { x: number; y: number; z: number };
export type Roi = { x1: number; y1: number; x2: number; y2: number };

/**
 * Token devolvido pelo backend em `data.tokens`. O `type` diz como o texto
 * entra na frase montada no app:
 *  - `letter`  -> concatena (soletração);
 *  - `word`    -> sinal estático que vale uma palavra inteira (ex.: EU TE AMO);
 *  - `neutral` -> separador: fecha a palavra corrente.
 */
export type SignToken = {
    label: string;
    type: 'letter' | 'word' | 'neutral' | string;
    text: string;
    confidence?: number;
    votes?: number;
    ratio?: number;
};

/**
 * Caixa guia usada no treino (sign-training/coleta_sinais.py):
 * 260 px em um frame 640x480, deslocada -50,-50 => (140,60)-(400,320).
 */
export const ROI: Roi = {
    x1: 140 / 640,
    y1: 60 / 480,
    x2: 400 / 640,
    y2: 320 / 480,
};

const SEND_INTERVAL_MS = 300;
const LETTER_COOLDOWN_MS = 1200;
const INACTIVITY_MS = 3500;
/** Tempo sem nenhum token para considerar que o sinal saiu de cena. */
const TOKEN_GAP_RESET_MS = 600;

/** Concatena uma letra (soletração). */
function appendLetter(current: string, letter: string): string {
    return current + letter;
}

/** Junta uma palavra inteira, sem espaço sobrando no início. */
function appendWord(current: string, word: string): string {
    const trimmed = current.replace(/\s+$/, '');
    return trimmed ? `${trimmed} ${word}` : word;
}

/** Fecha a palavra corrente (token neutro), sem duplicar espaço. */
function closeWord(current: string): string {
    if (!current || /\s$/.test(current)) return current;
    return `${current} `;
}

/**
 * Em desenvolvimento o Expo conhece o host do Metro (ex.: 192.168.0.10:8081).
 * Em um iPhone físico, 127.0.0.1 aponta para o próprio telefone, então
 * derivamos o IP do Mac a partir do `hostUri`.
 */
export function getApiBaseUrl(): string {
    const fromEnv = process.env.EXPO_PUBLIC_API_URL;
    if (fromEnv) return fromEnv.replace(/\/$/, '');

    const hostUri = Constants.expoConfig?.hostUri;
    const host = hostUri?.split(':')[0];
    if (host) return `http://${host}:8000`;

    const fallbackHost = Platform.OS === 'android' ? '10.0.2.2' : '127.0.0.1';
    return `http://${fallbackHost}:8000`;
}

/**
 * Recebe os 21 landmarks crus (normalizados 0-1) do frame e envia para o
 * FastAPI. O backend faz a normalização/feature engineering e responde com
 * `{ status, data: { translated_phrase, tokens, predictions_detail } }`.
 *
 * A frase é montada a partir de `tokens`, não mais de `translated_phrase[0]`:
 * letra concatena, palavra estática entra inteira e neutro separa.
 */
export function useLibrasSpelling(roi: Roi = ROI) {
    const [word, setWord] = useState('');
    const [apiError, setApiError] = useState('');
    const [lastConfidence, setLastConfidence] = useState<number | null>(null);

    const wordRef = useRef('');
    const lastLetterRef = useRef<string | null>(null);
    const lastLetterAtRef = useRef(0);
    const lastWordRef = useRef<string | null>(null);
    const lastTokenAtRef = useRef(0);
    const lastActivityAtRef = useRef(Date.now());
    const lastSendAtRef = useRef(0);
    const sendingRef = useRef(false);

    const updateWord = useCallback((next: string) => {
        wordRef.current = next;
        setWord(next);
    }, []);

    const reset = useCallback(() => {
        updateWord('');
        lastLetterRef.current = null;
        lastLetterAtRef.current = 0;
        lastWordRef.current = null;
        lastTokenAtRef.current = 0;
        lastActivityAtRef.current = Date.now();
    }, [updateWord]);

    const speakWord = useCallback((text: string) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        try {
            Speech.stop();
            Speech.speak(trimmed.toLowerCase(), {
                language: 'pt-BR',
                rate: 0.9,
            });
        } catch (e) {
            console.warn('Erro ao falar a palavra:', e);
        }
    }, []);

    const pushLandmarks = useCallback(
        (pts: Landmark[] | null): boolean => {
            if (!pts || pts.length < 21) return false;

            // Mesma checagem do Python: o pulso (landmark 0) precisa estar na caixa.
            const wrist = pts[0];
            const inBox =
                wrist.x >= roi.x1 &&
                wrist.x <= roi.x2 &&
                wrist.y >= roi.y1 &&
                wrist.y <= roi.y2;
            if (!inBox) return false;

            const now = Date.now();
            lastActivityAtRef.current = now;

            // O modelo é por frame; 300 ms é suficiente e evita inundar a API.
            if (now - lastSendAtRef.current < SEND_INTERVAL_MS) return true;
            if (sendingRef.current) return true;
            lastSendAtRef.current = now;
            sendingRef.current = true;

            /** Letra: mesma regra de antes (cooldown permite repetir, ex.: "LL"). */
            const applyLetter = (letter: string) => {
                if (!letter) return;
                const t = Date.now();
                if (
                    letter !== lastLetterRef.current ||
                    t - lastLetterAtRef.current > LETTER_COOLDOWN_MS
                ) {
                    lastLetterRef.current = letter;
                    lastLetterAtRef.current = t;
                    // Depois de uma letra, a mesma palavra pode ser dita de novo.
                    lastWordRef.current = null;
                    updateWord(appendLetter(wordRef.current, letter));
                }
            };

            /** Palavra estática: entra inteira e só uma vez por aparição. */
            const applyWordToken = (label: string, text: string) => {
                if (!text || label === lastWordRef.current) return;
                lastWordRef.current = label;
                // Libera a soletração para depois da palavra.
                lastLetterRef.current = null;
                updateWord(appendWord(wordRef.current, text));
            };

            /** Neutro: fecha a palavra corrente. */
            const applyNeutralToken = (label: string) => {
                if (label === lastWordRef.current) return;
                lastWordRef.current = label;
                lastLetterRef.current = null;
                updateWord(closeWord(wordRef.current));
            };

            const applyToken = (token: SignToken) => {
                lastTokenAtRef.current = Date.now();
                const label = typeof token?.label === 'string' ? token.label : '';
                const text = typeof token?.text === 'string' ? token.text : '';
                const type = typeof token?.type === 'string' ? token.type : 'letter';

                if (type === 'word') {
                    applyWordToken(label, text);
                } else if (type === 'neutral') {
                    applyNeutralToken(label);
                } else {
                    applyLetter(text || label);
                }
            };

            fetch(`${getApiBaseUrl()}/librasToText/translate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // `frames: [frame]` é o caminho suportado pelo backend e
                // classifica um frame por vez (o mesmo do teste2.py).
                body: JSON.stringify({
                    frames: [pts.map(p => ({ x: p.x, y: p.y, z: p.z }))],
                }),
            })
                .then(res => {
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    return res.json();
                })
                .then(json => {
                    const data = json?.data ?? {};

                    // Ajuda a diagnosticar: se a confiança ficar abaixo de 0,65,
                    // o backend devolve a lista de tokens vazia.
                    const detail = data?.predictions_detail?.[0];
                    if (detail && typeof detail.confidence === 'number') {
                        setLastConfidence(detail.confidence);
                    }

                    const hasTokens = Array.isArray(data?.tokens);
                    const tokens: SignToken[] = hasTokens ? data.tokens : [];

                    if (tokens.length === 0) {
                        // Sem token por um tempo => sinal saiu de cena; libera
                        // a repetição da mesma palavra/letra.
                        if (Date.now() - lastTokenAtRef.current > TOKEN_GAP_RESET_MS) {
                            lastWordRef.current = null;
                            lastLetterRef.current = null;
                        }
                        // Compatibilidade com backend antigo (só translated_phrase).
                        if (!hasTokens) {
                            const phrase = data?.translated_phrase;
                            if (typeof phrase === 'string' && phrase.length > 0) {
                                applyLetter(phrase[0]);
                            }
                        }
                        setApiError('');
                        return;
                    }

                    // A janela pode trazer mais de um token; o último é o mais recente.
                    applyToken(tokens[tokens.length - 1]);
                    setApiError('');
                })
                .catch((err: unknown) => {
                    console.warn('Erro na API de tradução:', err);
                    setApiError('Erro de conexão com o servidor de tradução.');
                })
                .finally(() => {
                    sendingRef.current = false;
                });

            return true;
        },
        [roi.x1, roi.x2, roi.y1, roi.y2, updateWord]
    );

    // Se a mão sair da caixa por 3,5 s, lê a frase traduzida e limpa.
    useEffect(() => {
        const id = setInterval(() => {
            if (wordRef.current && Date.now() - lastActivityAtRef.current > INACTIVITY_MS) {
                speakWord(wordRef.current);
                reset();
            }
        }, 250);
        return () => clearInterval(id);
    }, [reset, speakWord]);

    return { word, apiError, pushLandmarks, reset, lastConfidence };
}
