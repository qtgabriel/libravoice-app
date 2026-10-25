import { Stack } from 'expo-router';

export default function RootLayout() {
    return (
        <Stack screenOptions={{ headerTitleAlign: 'center' }}>
            <Stack.Screen name="index"/>
            <Stack.Screen name="text-to-libras"/>
            <Stack.Screen name="libras-to-text"/>
        </Stack>
    );
}