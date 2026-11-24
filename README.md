# SISTEMA_DE_SEMAFOROS_FRONTEND

Prototipo educativo para controlar dos semáforos con LEDs mediante una maqueta
IoT. React muestra el estado, la conexión con el backend y la hora de la última
actualización. Incluye historial de eventos y cuenta regresiva del ciclo
automático. El administrador puede ajustar la pausa con ambos semáforos en rojo
(1–60 segundos) desde el modo manual. El ESP32 detecta vehículos a 15 cm o menos.
En la vista de administrador también se pueden consultar las detecciones
acumuladas por semáforo desde el último reinicio del backend.
La web usa el backend de Render si `VITE_API_BASE_URL` no está configurada. Para
usar un backend local, establece `VITE_API_BASE_URL=http://localhost:8000`.

No usar para controlar tráfico real.
