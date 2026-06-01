import { useEffect, useRef, useState } from "react";
import { supabaseClient } from "./services/supabaseClient";
import "./App.css";

const FUEL_CHEAT_FINE = 15000;
const SIM_RATE_CHEAT_FINE = 25000;
const FUEL_TOLERANCE_GAL = 3;

type UpdateState =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "none"
  | "error";

function calculateDistanceNM(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 3440.065;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;

  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function normalizeAircraftName(name: string) {
  return String(name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isAircraftCompatible(missionAircraft: string, simAircraft: string) {
  const mission = normalizeAircraftName(missionAircraft);
  const sim = normalizeAircraftName(simAircraft);

  const aircraftAliases: Record<string, string[]> = {
    cessna172skyhawk: ["c172", "c172sp", "skyhawk"],
    kodiak100: ["kodiak100", "kodiak"],
    cessna208bgrandcaravan: ["c208", "c208b", "caravan", "grandcaravan"],
    beechcraftbarong58: ["barong58", "g58", "baron"],
    beechcraftbonanzag36: ["bonanzag36", "g36", "bonanza"],
    embraere110bandeirante: ["e110", "bandeirante", "embraere110"],
  };

  const aliases = aircraftAliases[mission];
  if (!aliases) return sim.includes(mission) || mission.includes(sim);
  return aliases.some((alias) => sim.includes(alias));
}

function getFuelPercent(simData: any) {
  const directPercent = Number(simData?.fuel_percent);

  if (Number.isFinite(directPercent) && directPercent > 0) {
    return Math.min(100, Math.max(0, directPercent));
  }

  const quantity = Number(simData?.fuel_total_quantity || 0);
  const capacity = Number(simData?.fuel_total_capacity || 0);

  if (capacity > 0) {
    return Math.min(100, Math.max(0, (quantity / capacity) * 100));
  }

  return 0;
}

function getXpRequiredForLevel(level: number) {
  return Math.floor(level * level * 120);
}

function getLevelFromXp(xp: number) {
  let level = 1;

  while (xp >= getXpRequiredForLevel(level + 1)) {
    level++;
  }

  return level;
}

function calculateFlightXp(mission: any) {
  let xp = Math.round(Number(mission.distance_nm || 0) * 2);

  xp += 100;

  if (mission.is_remote) xp += 100;

  if (mission.risk === "Alto") xp += 150;
  if (mission.risk === "Médio") xp += 75;

  return xp;
}

function getPaymentBonus(level: number, isPremium: boolean) {
  let bonus = 0;

  if (level >= 36) bonus += 0.2;
  else if (level >= 21) bonus += 0.15;
  else if (level >= 11) bonus += 0.1;
  else if (level >= 6) bonus += 0.05;

  if (isPremium) bonus += 0.1;

  return bonus;
}

function App() {
  const [email, setEmail] = useState(() => localStorage.getItem("northops_email") || "");
  const [password, setPassword] = useState(() => localStorage.getItem("northops_password") || "");
  const [rememberLogin, setRememberLogin] = useState(
    () => localStorage.getItem("northops_remember_login") === "true"
  );

  const [user, setUser] = useState<any>(null);
  const [activeMission, setActiveMission] = useState<any>(null);
  const [originAirport, setOriginAirport] = useState<any>(null);
  const [destinationAirport, setDestinationAirport] = useState<any>(null);
  const [simData, setSimData] = useState<any>(null);
  const [telemetryStarted, setTelemetryStarted] = useState(false);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("Cliente iniciado.");
  const [canFinishFlight, setCanFinishFlight] = useState(false);
  const [cheatMessage, setCheatMessage] = useState("");

  const [appVersion, setAppVersion] = useState("...");
  const [updateStatus, setUpdateStatus] = useState("Pronto");
  const [updateState, setUpdateState] = useState<UpdateState>("idle");
  const [updatePercent, setUpdatePercent] = useState(0);

  const simDataRef = useRef<any>(null);
  const landingStartedAtRef = useRef<number | null>(null);
  const completingFlightRef = useRef(false);
  const fuelAtStartRef = useRef<number | null>(null);
  const cheatDetectedRef = useRef(false);

  const [validationStatus, setValidationStatus] = useState({
    ok: false,
    message: "Aguardando validação automática.",
  });

  const distanceToDestination =
    simData?.latitude && simData?.longitude && destinationAirport
      ? calculateDistanceNM(
          Number(simData.latitude),
          Number(simData.longitude),
          Number(destinationAirport.latitude),
          Number(destinationAirport.longitude)
        )
      : Number(activeMission?.distance_nm || 0);

  const totalDistance = Number(activeMission?.distance_nm || 0);
  const progressPercent =
    totalDistance > 0
      ? Math.min(100, Math.max(0, ((totalDistance - distanceToDestination) / totalDistance) * 100))
      : 0;

  useEffect(() => {
    window.northOps?.onSimData((data: any) => {
      simDataRef.current = data;
      setSimData(data);
    });
  }, []);

  useEffect(() => {
    async function loadVersion() {
      try {
        const version = await window.northOps.getAppVersion();
        setAppVersion(version);
      } catch {
        setAppVersion("?");
      }
    }

    loadVersion();

    window.northOps.onUpdateStatus((data: any) => {
      const status = data.status || "idle";

      setUpdateState(status);
      setUpdateStatus(data.message || "Pronto");

      if (status === "downloading") {
        setUpdatePercent(Number(data.percent || 0));
      }

      if (status === "downloaded") {
        setUpdatePercent(100);
      }
    });
  }, []);

  useEffect(() => {
    if (!activeMission || !simData) {
      setValidationStatus({ ok: false, message: "Aguardando missão e simulador." });
      return;
    }

    if (activeMission.client_status === "in_flight") {
      setValidationStatus({ ok: false, message: "Voo em andamento." });
      return;
    }

    if (activeMission.status !== "active") {
      setValidationStatus({ ok: false, message: "Missão não está ativa." });
      return;
    }

    if (!activeMission.briefing_completed) {
      setValidationStatus({ ok: false, message: "Briefing não confirmado no site." });
      return;
    }

    if (!simData.connected) {
      setValidationStatus({ ok: false, message: "Simulador desconectado." });
      return;
    }

    if (!simData.aircraft) {
      setValidationStatus({ ok: false, message: "Aeronave não identificada." });
      return;
    }

    if (!isAircraftCompatible(activeMission.aircraft, simData.aircraft)) {
      setValidationStatus({ ok: false, message: "Aeronave incorreta." });
      return;
    }

    if (!simData.on_ground) {
      setValidationStatus({ ok: false, message: "A aeronave precisa estar no solo." });
      return;
    }

    if (simData.engine_running) {
      setValidationStatus({ ok: false, message: "Desligue o motor para iniciar." });
      return;
    }

    if (!originAirport || !simData.latitude || !simData.longitude) {
      setValidationStatus({ ok: false, message: "Origem ou posição não carregada." });
      return;
    }

    const distanceFromOrigin = calculateDistanceNM(
      Number(simData.latitude),
      Number(simData.longitude),
      Number(originAirport.latitude),
      Number(originAirport.longitude)
    );

    if (distanceFromOrigin > 3) {
      setValidationStatus({ ok: false, message: `Fora da origem: ${distanceFromOrigin.toFixed(1)} NM.` });
      return;
    }

    setValidationStatus({ ok: true, message: "Tudo OK. Pronto para iniciar." });
  }, [activeMission, simData, originAirport]);

  async function handleUpdateButton() {
    try {
      if (updateState === "available") {
        setUpdateState("downloading");
        setUpdateStatus("Baixando atualização...");
        await window.northOps.downloadUpdate();
        return;
      }

      if (updateState === "downloaded") {
        await window.northOps.installUpdate();
        return;
      }

      setUpdateState("checking");
      setUpdateStatus("Verificando atualizações...");
      await window.northOps.checkForUpdates();
    } catch {
      setUpdateState("error");
      setUpdateStatus("Não foi possível verificar atualizações.");
    }
  }

  async function applyFineAndCancelFlight(reason: string, fine: number, clientStatus: string) {
    if (!activeMission || !user || cheatDetectedRef.current) return;

    cheatDetectedRef.current = true;
    setTelemetryStarted(false);
    setCanFinishFlight(false);

    const alert = `${reason} • MULTA $${fine.toLocaleString("pt-BR")} • VOO CANCELADO`;

    setCheatMessage(alert);
    setMessage(alert);

    const { data: wallet } = await supabaseClient
      .from("wallets")
      .select("balance")
      .eq("user_id", user.id)
      .single();

    const currentBalance = Number(wallet?.balance || 0);

    await supabaseClient
      .from("wallets")
      .update({
        balance: currentBalance - fine,
      })
      .eq("user_id", user.id);

    await supabaseClient
      .from("active_missions")
      .update({
        status: "failed",
        client_status: clientStatus,
        validation_message: alert,
        completed_at: new Date().toISOString(),
        telemetry_finished_at: new Date().toISOString(),
      })
      .eq("id", activeMission.id);

    setActiveMission({
      ...activeMission,
      status: "failed",
      client_status: clientStatus,
      validation_message: alert,
    });
  }

  useEffect(() => {
    if (!telemetryStarted || !activeMission || !user) return;
    if (activeMission.client_status !== "in_flight") return;

    const interval = setInterval(async () => {
      const currentSimData = simDataRef.current;
      if (!currentSimData?.connected) return;

      const currentFuelGal = Number(currentSimData.fuel_total_quantity || 0);
      const simRate = Number(currentSimData.sim_rate || 1);

      if (
        fuelAtStartRef.current !== null &&
        currentFuelGal > fuelAtStartRef.current + FUEL_TOLERANCE_GAL
      ) {
        await applyFineAndCancelFlight(
          "ABASTECIMENTO DETECTADO APÓS INÍCIO DO VOO",
          FUEL_CHEAT_FINE,
          "fuel_cheat"
        );
        return;
      }

      if (simRate > 1.01) {
        await applyFineAndCancelFlight(
          "ACELERAÇÃO DE TEMPO DETECTADA",
          SIM_RATE_CHEAT_FINE,
          "simrate_cheat"
        );
        return;
      }

      const payload = {
        user_id: user.id,
        active_mission_id: activeMission.id,
        latitude: Number(currentSimData.latitude),
        longitude: Number(currentSimData.longitude),
        altitude_ft: Number(currentSimData.altitude_ft),
        ground_speed: Number(currentSimData.ground_speed),
        heading: Number(currentSimData.heading),
        fuel_percent: Number(getFuelPercent(currentSimData)),
        aircraft: currentSimData.aircraft,
        sim_on_ground: Boolean(currentSimData.on_ground),
        engine_running: Boolean(currentSimData.engine_running),
      };

      const { error } = await supabaseClient.from("flight_telemetry").insert(payload);

      if (error) {
        setMessage(`Erro telemetria: ${error.message}`);
        return;
      }

      if (!destinationAirport) return;

      const isLanded = payload.sim_on_ground === true && payload.ground_speed < 30;

      if (!isLanded) {
        landingStartedAtRef.current = null;
        setCanFinishFlight(false);
        return;
      }

      if (!landingStartedAtRef.current) {
        landingStartedAtRef.current = Date.now();
        setMessage("Pouso detectado. Validando destino...");
        return;
      }

      const landedSeconds = (Date.now() - landingStartedAtRef.current) / 1000;
      if (landedSeconds < 15) return;

      const distanceFromDestination = calculateDistanceNM(
        payload.latitude,
        payload.longitude,
        Number(destinationAirport.latitude),
        Number(destinationAirport.longitude)
      );

      if (distanceFromDestination <= 3) {
        setCanFinishFlight(true);
        setMessage("Destino validado. Pronto para finalizar voo.");
      } else {
        setCanFinishFlight(false);
        setMessage(`Pouso fora do destino: ${distanceFromDestination.toFixed(1)} NM.`);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [telemetryStarted, activeMission, user, destinationAirport]);

  async function loadActiveMission(userId: string) {
    const { data, error } = await supabaseClient
      .from("active_missions")
      .select("*")
      .eq("user_id", userId)
      .in("status", ["active", "in_progress"])
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      setActiveMission(null);
      setOriginAirport(null);
      setDestinationAirport(null);
      setTelemetryStarted(false);
      setCanFinishFlight(false);
      setMessage("Nenhuma missão ativa encontrada.");
      return;
    }

    setActiveMission(data);

    if (data.origin) {
      const { data: airportData } = await supabaseClient
        .from("airports")
        .select("*")
        .eq("sim_code", data.origin)
        .single();

      setOriginAirport(airportData);
    }

    if (data.destination) {
      const { data: destinationData } = await supabaseClient
        .from("airports")
        .select("*")
        .eq("sim_code", data.destination)
        .single();

      setDestinationAirport(destinationData);
    }

    if (data.client_status === "in_flight") setTelemetryStarted(true);
    setMessage("Missão ativa carregada.");
  }

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("Conectando ao NORTH OPS...");

    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

    if (error || !data.user) {
      setMessage("E-mail ou senha inválidos.");
      setLoading(false);
      return;
    }

    if (rememberLogin) {
      localStorage.setItem("northops_email", email);
      localStorage.setItem("northops_password", password);
      localStorage.setItem("northops_remember_login", "true");
    } else {
      localStorage.removeItem("northops_email");
      localStorage.removeItem("northops_password");
      localStorage.removeItem("northops_remember_login");
    }

    setUser(data.user);
    await loadActiveMission(data.user.id);
    setLoading(false);
  }

  async function handleStartFlight() {
    if (!activeMission) return;

    if (!validationStatus.ok) {
      setMessage(validationStatus.message);
      return;
    }

    try {
      setMessage("Aplicando combustível planejado na aeronave...");

      const briefingResult = await window.northOps.applyBriefingToAircraft({
        fuel_lbs: Number(activeMission.fuel_planned_lbs || activeMission.fuel_required_lbs || 0),
        passenger_weight_kg: Number(activeMission.passenger_weight_kg || 0),
        cargo_weight_kg: Number(activeMission.cargo_weight_kg || 0),
        takeoff_weight_kg: Number(activeMission.takeoff_weight_kg || 0),
      });

      console.log("BRIEFING APLICADO:", briefingResult);

      const fuelReadback = Number(
        briefingResult?.result?.fuel?.readback?.fuel_total_quantity || 0
      );

      fuelAtStartRef.current =
        fuelReadback > 0
          ? fuelReadback
          : Number(simDataRef.current?.fuel_total_quantity || 0);

      cheatDetectedRef.current = false;
      setCheatMessage("");
    } catch (error: any) {
      setMessage(
        `Erro ao aplicar combustível na aeronave: ${
          error?.message || "erro desconhecido"
        }`
      );
      return;
    }

    const now = new Date().toISOString();

    const { error } = await supabaseClient
      .from("active_missions")
      .update({
        status: "active",
        client_status: "in_flight",
        validation_message: "Validação automática aprovada.",
        started_at: now,
        telemetry_started_at: now,
      })
      .eq("id", activeMission.id);

    if (error) {
      setMessage("Erro ao iniciar voo.");
      return;
    }

    setActiveMission({
      ...activeMission,
      client_status: "in_flight",
      started_at: now,
      telemetry_started_at: now,
    });

    setTelemetryStarted(true);
    setCanFinishFlight(false);
    setMessage("Voo iniciado. Combustível aplicado e telemetria ativa.");
  }

  async function handleFinishFlight() {
    if (!activeMission || !user || !canFinishFlight) return;
    if (completingFlightRef.current) return;

    completingFlightRef.current = true;

    const completedAt = new Date().toISOString();
    const startedAt = activeMission.started_at || activeMission.telemetry_started_at || completedAt;

    const flightHours =
      (new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000 / 60 / 60;

    const { data: profileData } = await supabaseClient
      .from("profiles")
      .select("xp, level, is_premium")
      .eq("id", user.id)
      .single();

    const currentXp = Number(profileData?.xp || 0);
    const currentLevel = Number(profileData?.level || 1);
    const isPremium = Boolean(profileData?.is_premium || false);

    const earnedXp = calculateFlightXp(activeMission);
    const newXp = currentXp + earnedXp;
    const newLevel = getLevelFromXp(newXp);

    const basePayment = Number(activeMission.payment || 0);
    const paymentBonus = getPaymentBonus(currentLevel, isPremium);
    const finalPayment = Math.round(basePayment + basePayment * paymentBonus);

    const { error: logError } = await supabaseClient.from("flight_logs").insert({
      user_id: user.id,
      mission_id: activeMission.id,
      title: activeMission.title,
      mission_type: activeMission.type,
      origin: activeMission.origin,
      destination: activeMission.destination,
      distance_nm: activeMission.distance_nm,
      payment: finalPayment,
      started_at: startedAt,
      completed_at: completedAt,
      aircraft: activeMission.aircraft,
      flight_hours: Number(flightHours.toFixed(2)),
      xp_earned: earnedXp,
      level_after: newLevel,
    });

    if (logError) {
      setMessage(`Erro flight log: ${logError.message}`);
      completingFlightRef.current = false;
      return;
    }

    const { data: wallet } = await supabaseClient
      .from("wallets")
      .select("balance")
      .eq("user_id", user.id)
      .single();

    const currentBalance = Number(wallet?.balance || 0);

    const { error: walletError } = await supabaseClient
      .from("wallets")
      .update({ balance: currentBalance + finalPayment })
      .eq("user_id", user.id);

    if (walletError) {
      setMessage(`Erro carteira: ${walletError.message}`);
      completingFlightRef.current = false;
      return;
    }

    const { error: missionError } = await supabaseClient
      .from("active_missions")
      .update({
        status: "completed",
        client_status: "completed",
        completed_at: completedAt,
        telemetry_finished_at: completedAt,
      })
      .eq("id", activeMission.id);

    if (missionError) {
      setMessage(`Erro missão: ${missionError.message}`);
      completingFlightRef.current = false;
      return;
    }

    await supabaseClient
      .from("profiles")
      .update({
        current_airport: activeMission.destination,
        xp: newXp,
        level: newLevel,
      })
      .eq("id", user.id);

    setActiveMission(null);
    setOriginAirport(null);
    setDestinationAirport(null);
    setTelemetryStarted(false);
    setCanFinishFlight(false);

    landingStartedAtRef.current = null;
    completingFlightRef.current = false;
    fuelAtStartRef.current = null;

    await loadActiveMission(user.id);

    const levelText = newLevel > currentLevel ? ` Subiu para o nível ${newLevel}!` : "";

    setMessage(
      `Voo finalizado. Pagamento: $${finalPayment.toLocaleString("pt-BR")}. +${earnedXp} XP.${levelText}`
    );
  }

  async function handleResetFlight() {
    if (!activeMission) return;

    await supabaseClient
      .from("active_missions")
      .update({
        status: "active",
        client_status: "waiting",
        started_at: null,
        completed_at: null,
        telemetry_started_at: null,
        telemetry_finished_at: null,
      })
      .eq("id", activeMission.id);

    await supabaseClient.from("flight_telemetry").delete().eq("active_mission_id", activeMission.id);
    await supabaseClient.from("flight_logs").delete().eq("mission_id", activeMission.id);

    setTelemetryStarted(false);
    setCanFinishFlight(false);
    setCheatMessage("");
    landingStartedAtRef.current = null;
    completingFlightRef.current = false;
    fuelAtStartRef.current = null;
    cheatDetectedRef.current = false;

    setActiveMission({
      ...activeMission,
      status: "active",
      client_status: "waiting",
      started_at: null,
      completed_at: null,
      telemetry_started_at: null,
      telemetry_finished_at: null,
    });

    setMessage("Missão reiniciada com sucesso.");
  }

  const fuelPercent = getFuelPercent(simData);

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <h1>NORTH OPS</h1>
          <p>Cliente Operacional</p>
        </div>

        <div className="header-status">
          <StatusDot online={!!user} label={user ? "Piloto conectado" : "Offline"} />
          <StatusDot online={!!simData?.connected} label={simData?.connected ? "MSFS online" : "MSFS offline"} />
          <StatusDot online={!!simData?.on_ground} label={simData?.on_ground ? "Em solo" : "Em voo"} />
        </div>

        <div className="update-box">
          <span>Versão v{appVersion}</span>

          <button
            onClick={handleUpdateButton}
            disabled={updateState === "checking" || updateState === "downloading"}
          >
            {updateState === "checking" && "Verificando..."}
            {updateState === "available" && "Atualizar agora"}
            {updateState === "downloading" && `Baixando ${updatePercent}%`}
            {updateState === "downloaded" && "Reiniciar e instalar"}
            {(updateState === "idle" || updateState === "none" || updateState === "error") &&
              "Verificar atualização"}
          </button>

          <small>{updateStatus}</small>
        </div>
      </header>

      {!user && (
        <section className="login-card">
          <h2>Login do piloto</h2>

          <form onSubmit={handleLogin} className="login-form">
            <input type="email" placeholder="E-mail do piloto" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <input type="password" placeholder="Senha" value={password} onChange={(e) => setPassword(e.target.value)} required />

            <label className="remember-login">
              <input type="checkbox" checked={rememberLogin} onChange={(e) => setRememberLogin(e.target.checked)} />
              Lembrar login
            </label>

            <button disabled={loading}>{loading ? "Conectando..." : "Conectar"}</button>
          </form>
        </section>
      )}

      {user && activeMission && (
        <section className="cockpit">
          <div className="mission-card">
            <span className="tag">MISSÃO ATIVA</span>
            <h2>{activeMission.title}</h2>

            <div className="mission-route">
              <strong>{activeMission.origin}</strong>
              <span>→</span>
              <strong>{activeMission.destination}</strong>
            </div>

            <div className="status-message">{message}</div>

            <div className={validationStatus.ok ? "validation ok" : "validation error"}>
              {validationStatus.message}
            </div>

            {cheatMessage && (
              <div className="cheat-alert">
                {cheatMessage}
              </div>
            )}

            <div className="actions">
              <button onClick={() => loadActiveMission(user.id)}>Atualizar</button>

              <button
                onClick={handleStartFlight}
                disabled={!validationStatus.ok || activeMission.client_status === "in_flight"}
              >
                Iniciar voo
              </button>

              <button onClick={handleFinishFlight} disabled={!canFinishFlight}>
                Finalizar voo
              </button>

              <button className="danger" onClick={handleResetFlight}>
                Reiniciar
              </button>
            </div>
          </div>

          <div className="progress-card">
            <div
              className="progress-ring"
              style={{ "--progress": `${progressPercent}%` } as React.CSSProperties}
            >
              <div className="progress-inner">
                <strong>{Math.max(0, distanceToDestination).toFixed(1)}</strong>
                <span>NM restantes</span>
              </div>
            </div>
          </div>

          <div className="telemetry-strip">
            <Metric label="Aeronave" value={simData?.aircraft || activeMission.aircraft || "-"} />
            <FuelMetric fuel={fuelPercent} />
            <Metric label="Velocidade" value={`${Math.round(simData?.ground_speed || 0)} kt`} />
            <Metric label="Motor" value={simData?.engine_running ? "Ligado" : "Desligado"} />
            <Metric label="Peso Pax" value={`${Math.round(activeMission.passenger_weight_kg || 0)} kg`} />
            <Metric label="Peso Carga" value={`${Math.round(activeMission.cargo_weight_kg || 0)} kg`} />
            <Metric label="Fuel Planejado" value={`${Math.round(activeMission.fuel_planned_lbs || activeMission.fuel_required_lbs || 0)} lb`} />
            <Metric label="Peso Decolagem" value={`${Math.round(activeMission.takeoff_weight_kg || 0)} kg`} />
            <Metric
              label="Pagamento"
              value={`$${activeMission.payment?.toLocaleString("pt-BR")}`}
              className="payment-card"
            />
          </div>
        </section>
      )}

      {user && !activeMission && (
        <section className="login-card">
          <h2>Nenhuma missão ativa</h2>
          <p>Aceite uma missão no site NORTH OPS.</p>
          <button onClick={() => loadActiveMission(user.id)}>Atualizar missão</button>
        </section>
      )}
    </main>
  );
}

function StatusDot({ online, label }: { online: boolean; label: string }) {
  return (
    <div className="status-dot-item">
      <span className={online ? "dot online" : "dot offline"} />
      <p>{label}</p>
    </div>
  );
}

function Metric({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={`metric ${className}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function FuelMetric({ fuel }: { fuel: number }) {
  const color =
    fuel > 60
      ? "#22c55e"
      : fuel > 30
      ? "#facc15"
      : "#ef4444";

  return (
    <div className="metric fuel-metric">
      <span>Combustível</span>
      <strong>{fuel.toFixed(0)}%</strong>

      <div className="fuel-bar">
        <div
          className="fuel-fill"
          style={{
            width: `${Math.min(100, Math.max(0, fuel))}%`,
            background: color,
          }}
        />
      </div>
    </div>
  );
}

export default App;