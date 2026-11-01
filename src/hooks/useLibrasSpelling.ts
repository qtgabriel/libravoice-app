import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

export type Landmark = { x: number; y: number; z: number };
export type Roi = { x1: number; y1: number; x2: number; y2: number };

/**
 * Caixa guia usada no treino (sign-training/coleta_letras.py):
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
 * `{ status, data: { translated_phrase, predictions_detail } }`.
 */
export function useLibrasSpelling(roi: Roi = ROI) {
    const [word, setWord] = useState('');
    const [apiError, setApiError] = useState('');
    const [lastConfidence, setLastConfidence] = useState<number | null>(null);

    const wordRef = useRef('');
    const lastLetterRef = useRef<string | null>(null);
    const lastLetterAtRef = useRef(0);
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
        lastActivityAtRef.current = Date.now();
    }, [updateWord]);

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

            fetch(`${getApiBaseUrl()}/librasToText/translate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // O backend (`process_points`) verifica primeiro a chave `frames`
                // e ela vem como `None` no `payload.dict()` quando só `landmarks`
                // é enviado. `frames: [frame]` é o caminho suportado (o mesmo do
                // teste2.py) e classifica um frame por vez.
                body: JSON.stringify({
                    frames: [pts.map(p => ({ x: p.x, y: p.y, z: p.z }))],
                }),
            })
                .then(res => {
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    return res.json();
                })
                .then(json => {
                    // Ajuda a diagnosticar: se a confiança ficar abaixo de 0,65,
                    // o backend devolve translated_phrase vazio.
                    const detail = json?.data?.predictions_detail?.[0];
                    if (detail && typeof detail.confidence === 'number') {
                        setLastConfidence(detail.confidence);
                    }

                    const phrase = json?.data?.translated_phrase;
                    if (typeof phrase !== 'string' || phrase.length === 0) return;

                    const letter = phrase[0];
                    const t = Date.now();
                    if (
                        letter !== lastLetterRef.current ||
                        t - lastLetterAtRef.current > LETTER_COOLDOWN_MS
                    ) {
                        lastLetterRef.current = letter;
                        lastLetterAtRef.current = t;
                        updateWord(wordRef.current + letter);
                    }
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

    // Se a mão sair da caixa por 3,5 s, limpa a palavra (igual ao teste.py).
    useEffect(() => {
        const id = setInterval(() => {
            if (wordRef.current && Date.now() - lastActivityAtRef.current > INACTIVITY_MS) {
                reset();
            }
        }, 250);
        return () => clearInterval(id);
    }, [reset]);

    return { word, apiError, pushLandmarks, reset, lastConfidence };
}
