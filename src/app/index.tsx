import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';

export default function Home() {
  const router = useRouter();

  return (
      <View style={styles.container}>
        <Text style={styles.title}>Bem-vindo ao LibrasVoice</Text>
        <TouchableOpacity style={styles.button} onPress={() => router.push('/text-to-libras')}>
          <Text style={styles.buttonText}>Texto para Libras</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={() => router.push('/libras-to-text')}>
          <Text style={styles.buttonText}>Libras para Texto</Text>
        </TouchableOpacity>
      </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f5f6fa',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 24,
    color: '#2f3640',
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#009432',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    elevation: 2,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});