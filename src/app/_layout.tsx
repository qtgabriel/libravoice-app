import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Brand } from '@/constants/theme';

export default function RootLayout() {
    return (
        <>
            <StatusBar style="light" />
            <Stack
                screenOptions={{
                    headerTitleAlign: 'center',
                    headerStyle: { backgroundColor: Brand.black },
                    headerTintColor: Brand.yellow,
                    headerTitleStyle: { color: Brand.white, fontWeight: '700' },
                    contentStyle: { backgroundColor: Brand.black },
                }}
            >
                <Stack.Screen
                    name="index"
                    options={{ title: 'LibraVoice', headerShown: false }}
                />
                <Stack.Screen
                    name="text-to-libras"
                    options={{ title: 'Texto para Libras' }}
                />
                <Stack.Screen
                    name="libras-to-text"
                    options={{ title: 'Libras para Texto' }}
                />
            </Stack>
        </>
    );
}
