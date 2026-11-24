import { useCallback, useEffect, useState } from "react";

type Color = "red" | "yellow" | "green";
type SemaphoreId = "1" | "2";
type Mode = "manual" | "automatic";
type StateResponse = {
  mode: Mode;
  phase: string;
  detected: Record<SemaphoreId, boolean>;
  semaphores: Record<SemaphoreId, Color>;
};

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000"
).replace(/\/$/, "");

const colorNames: Record<Color, string> = {
  red: "Rojo",
  yellow: "Amarillo",
  green: "Verde",
};

async function getState(): Promise<StateResponse> {
  const response = await fetch(`${API_BASE_URL}/api/state`);
  if (!response.ok) {
    throw new Error(`No se pudo leer el estado (HTTP ${response.status})`);
  }
  return response.json() as Promise<StateResponse>;
}

function App() {
  const [semaphores, setSemaphores] = useState<StateResponse["semaphores"]>();
  const [mode, setMode] = useState<Mode>();
  const [detected, setDetected] = useState<StateResponse["detected"]>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<SemaphoreId | null>(null);
  const [modeBusy, setModeBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const state = await getState();
      setSemaphores(state.semaphores);
      setMode(state.mode);
      setDetected(state.detected);
      setError("");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Error al conectar con la API",
      );
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 500);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function changeMode(nextMode: Mode) {
    setModeBusy(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/mode`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: nextMode }),
      });
      if (!response.ok) {
        throw new Error(`No se pudo cambiar el modo (HTTP ${response.status})`);
      }
      await refresh();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Error al cambiar el modo",
      );
    } finally {
      setModeBusy(false);
    }
  }

  async function changeColor(id: SemaphoreId, color: Color) {
    setBusy(id);
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/semaphores/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ color }),
      });
      if (!response.ok) {
        if (response.status === 409) {
          throw new Error(
            "Pon el otro semáforo en rojo antes de cambiar este a amarillo o verde.",
          );
        }
        throw new Error(`No se pudo cambiar el color (HTTP ${response.status})`);
      }
      await refresh();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Error al enviar el cambio",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="page">
      <header>
        <p className="eyebrow">PROTOTIPO EDUCATIVO · ESP32</p>
        <h1>Control de semáforos</h1>
        <p className="subtitle">
          En automático, los sensores detectan vehículos; en manual, puedes elegir
          los colores desde esta página.
        </p>
      </header>

      {error && <p className="error" role="alert">{error}</p>}

      <section className="mode-panel" aria-label="Modo de control">
        <div>
          <h2>Modo de control</h2>
          <p>
            {mode === "automatic"
              ? "Automático: el ESP32 controla los cambios según los sensores."
              : mode === "manual"
                ? "Manual: selecciona los colores. Para cambiar uno a amarillo o verde, el otro debe estar en rojo."
                : "Conectando con el backend…"}
          </p>
        </div>
        <div className="controls">
          <button
            className={`button mode-button ${mode === "manual" ? "selected" : ""}`}
            disabled={!mode || modeBusy || mode === "manual"}
            onClick={() => void changeMode("manual")}
          >
            Manual
          </button>
          <button
            className={`button mode-button ${mode === "automatic" ? "selected" : ""}`}
            disabled={!mode || modeBusy || mode === "automatic"}
            onClick={() => void changeMode("automatic")}
          >
            Automático
          </button>
        </div>
      </section>

      <section className="grid" aria-label="Semáforos">
        {(["1", "2"] as const).map((id) => {
          const color = semaphores?.[id];
          const otherId: SemaphoreId = id === "1" ? "2" : "1";
          const otherColor = semaphores?.[otherId];
          return (
            <article className={`card ${color ? `is-${color}` : ""}`} key={id}>
              <div className="card-heading">
                <h2>Semáforo {id}</h2>
                <span className={`badge ${color ?? "offline"}`}>
                  {color ? colorNames[color] : "Conectando…"}
                </span>
              </div>
              <div className="lights" aria-label={`Estado: ${color ? colorNames[color] : "desconocido"}`}>
                {(["red", "yellow", "green"] as const).map((lamp) => (
                  <span
                    className={`light ${lamp} ${color === lamp ? "active" : ""}`}
                    key={lamp}
                    aria-hidden="true"
                  />
                ))}
              </div>
              {mode === "automatic" && (
                <p className={`vehicle-status ${detected?.[id] ? "detected" : "clear"}`}>
                  Sensor: {detected?.[id] ? "vehículo detectado" : "sin detección"}
                </p>
              )}
              <div className="controls" aria-label={`Cambiar semáforo ${id}`}>
                {(["red", "yellow", "green"] as const).map((lamp) => {
                  const blockedByOtherSemaphore =
                    lamp !== "red" &&
                    otherColor !== undefined &&
                    otherColor !== "red";
                  return (
                    <button
                      className={`button ${lamp}`}
                      disabled={
                        !semaphores ||
                        mode !== "manual" ||
                        busy === id ||
                        blockedByOtherSemaphore
                      }
                      key={lamp}
                      onClick={() => void changeColor(id, lamp)}
                      aria-pressed={color === lamp}
                      title={
                        blockedByOtherSemaphore
                          ? `El semáforo ${otherId} debe estar en rojo`
                          : undefined
                      }
                    >
                      {colorNames[lamp]}
                    </button>
                  );
                })}
              </div>
            </article>
          );
        })}
      </section>
      <footer>
        Solo para una maqueta educativa con LEDs; no conectar a señales de tránsito
        reales ni usar para dirigir vehículos.
      </footer>
    </main>
  );
}

export default App;
