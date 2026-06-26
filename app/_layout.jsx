import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
// Importa a task de GPS para registrá-la no app (defineTask roda no import).
import '../src/tasks/gpsTask';

export default function Layout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
