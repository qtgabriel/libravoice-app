import { Stack } from 'expo-router';

export default function RootLayout() {
    return (
        <Stack screenOptions={{ headerTitleAlign: 'center' }}>
            <Stack.Screen
                name="index"
                options={{ title: 'Início - LibrasVoice' }}
            />
            <Stack.Screen
                name="text-to-libras"
                options={{ title: 'Tradução Textual' }}
            />
        </Stack>
    );
}