import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function LibrasToTextNative() {
    return (
        <View style={styles.container}>
            <Text style={styles.title}>Libras para Texto</Text>
            <Text style={styles.text}>
                Esta tela usa a câmera com detecção de mãos e, por enquanto, funciona na versão
                web. No celular, ela precisa de um build de desenvolvimento e de um aparelho
                físico.
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        gap: 12,
        backgroundColor: '#f5f6fa',
    },
    title: { fontSize: 22, fontWeight: 'bold', color: '#2f3640' },
    text: { fontSize: 15, color: '#718093', textAlign: 'center', lineHeight: 22 },
});