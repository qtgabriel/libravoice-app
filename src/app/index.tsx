import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Brand } from '@/constants/theme';

export default function Home() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Image
        source={require('@/assets/images/libravoice-logo.png')}
        style={styles.logo}
        resizeMode="contain"
      />

      <Text style={styles.title}>LibraVoice</Text>
      <Text style={styles.subtitle}>Tradução bilateral PT-BR · Libras</Text>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.button}
          onPress={() => router.push('/text-to-libras')}
          activeOpacity={0.85}
        >
          <Text style={styles.buttonText}>Texto para Libras</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.buttonOutline]}
          onPress={() => router.push('/libras-to-text')}
          activeOpacity={0.85}
        >
          <Text style={[styles.buttonText, styles.buttonOutlineText]}>
            Libras para Texto
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.footer}>Toque em uma opção para começar</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: Brand.black,
  },
  logo: {
    width: 168,
    height: 168,
    marginBottom: 20,
  },
  title: {
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: Brand.white,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: Brand.yellow,
    marginTop: 6,
    marginBottom: 36,
    textAlign: 'center',
  },
  actions: {
    width: '100%',
    maxWidth: 360,
    gap: 14,
  },
  button: {
    backgroundColor: Brand.yellow,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: Brand.yellow,
  },
  buttonText: {
    color: Brand.black,
    fontSize: 17,
    fontWeight: '700',
  },
  buttonOutlineText: {
    color: Brand.yellow,
  },
  footer: {
    color: Brand.muted,
    fontSize: 12,
    marginTop: 28,
    textAlign: 'center',
  },
});
