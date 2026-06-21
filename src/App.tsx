//
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { supabaseClient } from "./services/supabaseClient";
import "./App.css";

const FUEL_CHEAT_FINE = 15000;
const SIM_RATE_CHEAT_FINE = 25000;
const CRASH_FINE = 3000;
const CRASH_REPUTATION_PENALTY = 15;

const FUEL_TOLERANCE_GAL = 3;

const MAX_SAFE_G_FORCE = 1.7;
const MAX_SAFE_BANK_ANGLE = 50;
const MAX_SAFE_PITCH_ANGLE = 25;
const MAX_SAFE_DESCENT_RATE = -1500;
const HARD_LANDING_DESCENT_RATE = -700;
const HIGH_LANDING_SPEED = 95;

const careerLevels = [
  { level: 1, title: "Aluno Piloto I", minXp: 0, minHours: 0 },
  { level: 2, title: "Aluno Piloto II", minXp: 100, minHours: 2 },
  { level: 3, title: "Aluno Piloto III", minXp: 300, minHours: 5 },
  { level: 4, title: "Piloto Privado", minXp: 700, minHours: 10 },
  { level: 5, title: "Piloto Regional", minXp: 1500, minHours: 20 },
  { level: 6, title: "Piloto Comercial", minXp: 4000, minHours: 50 },
  { level: 7, title: "Piloto Sênior", minXp: 9000, minHours: 100 },
  { level: 8, title: "Comandante Regional", minXp: 18000, minHours: 250 },
  { level: 9, title: "Comandante Comercial", minXp: 35000, minHours: 500 },
  { level: 10, title: "Comandante Executivo", minXp: 70000, minHours: 1000 },
];

type UpdateState =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "none"
  | "error";

function getCareerLevelFromXpAndHours(xp: number, totalHours: number) {
  return (
    [...careerLevels]
      .reverse()
      .find(
        (item) =>
          Number(xp || 0) >= item.minXp &&
          Number(totalHours || 0) >= item.minHours
      ) || careerLevels[0]
  );
}

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

  const aircraftGroups = [
    [
      "cessna172skyhawk",
      "cessna172",
      "c172",
      "c172sp",
      "skyhawk",
      "asoboc172",
      "asobocessna172",
    ],
    [
      "cessna206",
      "cessnac206",
      "c206",
      "stationair",
      "cessnastationair",

      "cessnat206hstationair",
      "cessnat206h",
      "t206hstationair",
      "t206h",

      "cessna206stationair",
      "cessnac206stationair",
      "c206stationair",

      "cessnau206",
      "cessnau206g",
      "u206",
      "u206g",
      "u206stationair",

      "cessnatu206",
      "cessnatu206g",
      "tu206",
      "tu206g",
      "tu206stationair",

      "carenadoc206",
      "carenadocessna206",
      "carenadostationair",
      "carenadoc206stationair",
      "carenadot206h",
      "carenadot206hstationair"
    ],
    [
      "cessna207",
      "cessnac207",
      "c207",

      "cessnat207",
      "cessnat207a",
      "t207",
      "t207a",

      "stationair8",
      "stationair8ii",
      "stationairii",

      "cessnat207astationair",
      "cessnat207astationair8",
      "cessnat207astationair8ii",

      "t207astationair",
      "t207astationair8",
      "t207astationair8ii",

      "cessna207stationair",
      "cessna207stationair8",
      "cessna207stationair8ii",

      "c207stationair",
      "c207stationair8",
      "c207stationair8ii",

      "stationair",
      "stationair8ii",

      "carenadot207a",
      "carenadot207",
      "carenadoc207",
      "carenadostationair",
      "carenadostationair8",
      "carenadostationair8ii",
      "carenadot207astationair8ii"
    ],
    [
      "piperpa28warriorii",
      "piperpa28161warriorii",
      "pa28warriorii",
      "pa28161warriorii",
      "pa28warrior",
      "pa28161",
      "warriorii",
      "warrior",
      "piperwarrior",
      "justflightwarrior",
      "justflightpa28",
      "jfpa28",
      "jfwarrior",
    ],

    [
      "piperpa28rturboarrowiii",
      "piperpa28r201tturboarrowiii",
      "pa28rturboarrowiii",
      "pa28r201tturboarrowiii",
      "pa28rturboarrow",
      "pa28r201t",
      "turboarrowiii",
      "turboarrow",
      "arrowiii",
      "arrow",
      "piperarrow",
      "justflightarrow",
      "justflightturboarrow",
      "justflightpa28r",
      "jfpa28r",
      "jfturboarrow",
    ],

    [
      "beechcraftbonanzag36",
      "beechcraftbonanza",
      "bonanzag36",
      "g36",
      "bonanza",
      "asobobonanza",
      "asobog36",
      "blacksquarebonanza",
      "blacksquarebonanzag36",
      "bksqbonanza",
      "bksqg36",
    ],

    [
      "cessna210centurion",
      "cessnac210centurion",
      "cessna210",
      "cessnac210",
      "c210centurion",
      "c210",
      "centurion",

      "cessnact210",
      "cessnact210n",
      "ct210",
      "ct210n",
      "turbo210",
      "turbo210n",
      "turbocharged210",

      "carenadoaircraftct210n",
      "carenadoaircraftct210nwx",
      "carenadoct210n",
      "carenadoct210",
      "carenadoc210",
      "carenadocessna210",
      "carenadocenturion",
      "carenadoturbo210",
      "carenadoturbo210n",

      "blacksquarec210",
      "blacksquarecessna210",
      "bksqc210",
      "bksqcenturion"
    ],

    [
      "pipersenecav",
      "piperpa34senecav",
      "pa34senecav",
      "pa34seneca",
      "pa34",
      "senecav",
      "seneca",
      "carenadosenecav",
      "carenadopa34",
      "carenadoseneca",
    ],

    [
      "beechcraftbarong58",
      "beechcraftbaron",
      "barong58",
      "baron58",
      "baron58tc",
      "58tc",
      "g58",
      "baron",
      "asobobaron",
      "asobog58",
      "blacksquarebaron",
      "blacksquarebaron58tc",
      "blacksquareg58",
      "bksqbaron",
      "bksqg58",
    ],

    [
      "kodiak100",
      "kodiak",
      "questkodiak",
      "simworksstudioskodiak",
      "swskodiak",
      "swsquestkodiak",
    ],

    [
      "cessna208bgrandcaravan",
      "cessna208grandcaravan",
      "cessna208",
      "cessna208b",
      "c208",
      "c208b",
      "caravan",
      "grandcaravan",
      "caravanex",
      "asobocaravan",
      "asoboc208",
      "asoboc208b",
      "blacksquarecaravan",
      "blacksquarec208",
      "bksqcaravan",
      "bksqc208",
    ],

    [
      "embraeremb110bandeirante",
      "embraeremb110",
      "emb110bandeirante",
      "emb110",
      "embraere110bandeirante",
      "embraere110",
      "e110",
      "bandeirante",
      "embraerbandeirante",

      "nextgenemb110",
      "nextgenemb110p",
      "nextgenemb110bandeirante",
      "nextgenemb110ptransbrasil",
      "nextgenemb110ptbb",
      "nextgene110",
      "nextgene110p",
      "nextgenbandeirante",

      "transbrasil",
      "tbb",
    ],
    // Cessna 182 / C182 / Skylane
    [
      "cessna182rgii",
      "cessna182rg",
      "cessna182",
      "cessnac182",
      "c182rgii",
      "c182rg",
      "c182",
      "skylane",
      "skylanerg",
      "cessnaskylane",
      "cessnac182skylane",

      "asoboc182",
      "asobocessna182",
      "microsoftc182",
      "microsoftcessna182",

      "carenadoc182rg",
      "carenadocessna182",
      "carenadoc182",

      "a2ac182",
      "a2acessna182",

      "justflightc182",
      "justflightcessna182",
      "jfc182",

      "wbsimc182",
      "wbsimcessna182",

      "blackbirdc182",
      "blackbirdsimulationsc182",
      "milvizc182",
      "milvizcessna182"
    ],

    [
      "cessna408skycourier",
      "cessna408",
      "c408",
      "skycourier",
      "sky-courier",
      "asoboskycourier",
      "asoboc408",
    ],
  // Cessna 182 RG II
  [
    "cessna182rgii",
    "cessna182rg",
    "cessna182",
    "c182rgii",
    "c182rg",
    "c182",
    "skylane",
    "skylanerg",
    "cessnaskylane",
    "carenadoc182rg",
    "carenadocessna182",
    "carenadoc182",
    "a2ac182",
    "a2acessna182"
  ],

  // Daher TBM 960
  [
    "dahertbm960",
    "tbm960",
    "dahertbm",
    "tbm",
    "socatatbm960",
    "socatatbm",
    "tbm930",
    "asobotbm930",
    "asobotbm",
    "black-squaretbm",
    "blacksquaretbm",
    "bksqtbm",
    "bksqtbm960",
    "microsofttbm",
    "msfstbm"
  ],

  ];

  const matchedGroup = aircraftGroups.find((group) =>
    group.some((alias) => mission.includes(alias) || alias.includes(mission))
  );

  if (!matchedGroup) return sim.includes(mission) || mission.includes(sim);

  return matchedGroup.some((alias) => sim.includes(alias));
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

function calculateFlightXp(mission: any) {
  const distance = Number(mission.distance_nm || 0);
  const payloadKg = Number(mission.payload_total_kg || mission.weight_kg || 0);

  let xp = Math.round(distance * 0.8);

  xp += 40;
  xp += Math.round(payloadKg / 40);

  if (mission.is_remote) xp += 35;

  if (mission.risk === "Alto") xp += 60;
  if (mission.risk === "Médio") xp += 30;

  return Math.max(30, xp);
}

function getPaymentBonus(level: number, isPremium: boolean) {
  let bonus = 0;

  if (level >= 10) bonus += 0.16;
  else if (level >= 9) bonus += 0.14;
  else if (level >= 8) bonus += 0.12;
  else if (level >= 7) bonus += 0.1;
  else if (level >= 6) bonus += 0.08;
  else if (level >= 5) bonus += 0.05;
  else if (level >= 4) bonus += 0.03;

  if (isPremium) bonus += 0.1;

  return bonus;
}

function addFlightEvent(eventsRef: MutableRefObject<any[]>, event: any) {
  const alreadyExists = eventsRef.current.some((item) => item.code === event.code);
  if (alreadyExists) return;

  eventsRef.current.push({
    ...event,
    created_at: new Date().toISOString(),
  });
}

function calculatePilotEvaluation({
  mission,
  events,
  baseXp,
  remainingFuelPercent,
  maxGForce,
  maxBankAngle,
  maxPitchAngle,
  maxDescentRate,
  landingSpeed,
}: {
  mission: any;
  events: any[];
  baseXp: number;
  remainingFuelPercent: number;
  maxGForce: number;
  maxBankAngle: number;
  maxPitchAngle: number;
  maxDescentRate: number;
  landingSpeed: number;
}) {
  const finalEvents = [...events];

  if (remainingFuelPercent < 10) {
    finalEvents.push({
      code: "low_arrival_fuel",
      type: "warning",
      title: "Combustível baixo na chegada",
      message: `A aeronave chegou com apenas ${remainingFuelPercent}% de combustível.`,
      penalty: 0.5,
      created_at: new Date().toISOString(),
    });
  }

  if (finalEvents.length === 0 && remainingFuelPercent >= 10) {
    finalEvents.push({
      code: "stable_flight",
      type: "positive",
      title: "Voo estável",
      message: "Nenhum evento severo de pilotagem foi detectado durante o voo.",
      penalty: 0,
      created_at: new Date().toISOString(),
    });
  }

  const totalPenalty = finalEvents.reduce(
    (sum, event) => sum + Number(event.penalty || 0),
    0
  );

  const pilotRating = Math.max(0, Math.min(10, Number((10 - totalPenalty).toFixed(1))));

  const hasPassengers = Number(mission.passengers || 0) > 0;
  const hasCargo = Number(mission.cargo_weight_kg || 0) > 0;

  const passengerSatisfaction = hasPassengers
    ? Math.max(0, Math.min(100, Math.round(100 - totalPenalty * 8)))
    : null;

  const cargoIntegrity = hasCargo
    ? Math.max(0, Math.min(100, Math.round(100 - totalPenalty * 7)))
    : null;

  let reputationChange = 0;

  if (pilotRating >= 9) reputationChange = 3;
  else if (pilotRating >= 8) reputationChange = 2;
  else if (pilotRating >= 7) reputationChange = 1;
  else if (pilotRating >= 6) reputationChange = 0;
  else if (pilotRating >= 5) reputationChange = -1;
  else if (pilotRating >= 4) reputationChange = -2;
  else reputationChange = -4;

  let xpMultiplier = 1;

  if (pilotRating >= 9) xpMultiplier = 1.2;
  else if (pilotRating >= 8) xpMultiplier = 1.1;
  else if (pilotRating >= 7) xpMultiplier = 1;
  else if (pilotRating >= 6) xpMultiplier = 0.9;
  else if (pilotRating >= 5) xpMultiplier = 0.8;
  else xpMultiplier = 0.6;

  const finalXp = Math.max(0, Math.round(baseXp * xpMultiplier));

  let landingImpactLevel = "normal";

  if (finalEvents.some((event) => event.code === "hard_landing")) {
    landingImpactLevel = "hard";
  } else if (maxDescentRate < -500) {
    landingImpactLevel = "firm";
  }

  return {
    pilotRating,
    passengerSatisfaction,
    cargoIntegrity,
    reputationChange,
    xpBase: baseXp,
    xpFinal: finalXp,
    xpMultiplier,
    landingImpactLevel,
    flightEvents: finalEvents,
    maxGForce,
    maxBankAngle,
    maxPitchAngle,
    maxDescentRate,
    landingSpeed,
  };
}


function getBarColor(value: number) {
  if (value >= 76) return "#22c55e";
  if (value >= 56) return "#facc15";
  if (value >= 36) return "#fb923c";
  return "#ef4444";
}

function calculateLiveOperationalScores({
  mission,
  events,
}: {
  mission: any;
  events: any[];
}) {
  const totalPenalty = (events || []).reduce(
    (sum, event) => sum + Number(event.penalty || 0),
    0
  );

  const hasPassengers = Number(mission?.passengers || 0) > 0;
  const hasCargo = Number(mission?.cargo_weight_kg || 0) > 0;

  const passengerSatisfaction = hasPassengers
    ? Math.max(0, Math.min(100, Math.round(100 - totalPenalty * 8)))
    : 100;

  const cargoIntegrity = hasCargo
    ? Math.max(0, Math.min(100, Math.round(100 - totalPenalty * 7)))
    : 100;

  return {
    passengerSatisfaction,
    cargoIntegrity,
  };
}

function calculateAircraftWearAfterFlight({
  currentCondition,
  flightHours,
  events,
}: {
  currentCondition: number;
  flightHours: number;
  events: any[];
}) {
  const baseWear = flightHours * 1.15;

  const eventPenalty = (events || []).reduce(
    (sum: number, event: any) => sum + Number(event.penalty || 0) * 0.15,
    0
  );

  const totalWear = Number((baseWear + eventPenalty).toFixed(2));
  const newCondition = Math.max(0, Number(currentCondition || 100) - totalWear);

  return {
    totalWear,
    newCondition: Number(newCondition.toFixed(2)),
  };
}

function normalizeHeading(value: any) {
  let heading = Number(value || 0);

  if (!Number.isFinite(heading)) return 0;

  if (Math.abs(heading) <= Math.PI * 2) {
    heading = heading * (180 / Math.PI);
  }

  const normalized = heading % 360;

  return normalized < 0 ? normalized + 360 : normalized;
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
  const [lastEvaluation, setLastEvaluation] = useState<any>(null);
  const [aircraftCondition, setAircraftCondition] = useState(100);

  const [appVersion, setAppVersion] = useState("...");
  const [updateState, setUpdateState] = useState<UpdateState>("idle");
  const [updatePercent, setUpdatePercent] = useState(0);

  const [compactMode, setCompactMode] = useState(
    () => localStorage.getItem("northops_compact_mode") === "true"
  );  

  const simDataRef = useRef<any>(null);
  const landingStartedAtRef = useRef<number | null>(null);
  const completingFlightRef = useRef(false);
  const fuelAtStartRef = useRef<number | null>(null);
  const cheatDetectedRef = useRef(false);

  const flightEventsRef = useRef<any[]>([]);
  const maxGForceRef = useRef(1);
  const maxBankAngleRef = useRef(0);
  const maxPitchAngleRef = useRef(0);
  const maxDescentRateRef = useRef(0);
  const landingSpeedRef = useRef(0);

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
      ? Math.min(
          100,
          Math.max(0, ((totalDistance - distanceToDestination) / totalDistance) * 100)
        )
      : 0;

  const liveScores = calculateLiveOperationalScores({
    mission: activeMission,
    events: flightEventsRef.current,
  });

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

      if (status === "downloading") setUpdatePercent(Number(data.percent || 0));
      if (status === "downloaded") setUpdatePercent(100);
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
      setValidationStatus({
        ok: false,
        message: `Fora da origem: ${distanceFromOrigin.toFixed(1)} NM.`,
      });
      return;
    }

    if (updateState === "downloaded") {
      setValidationStatus({
        ok: false,
        message: "Atualização obrigatória pendente. Clique em Reiniciar e instalar.",
      });
      return;
    }

    setValidationStatus({ ok: true, message: "Tudo OK. Pronto para iniciar." });
  }, [activeMission, simData, originAirport, updateState]);




  
async function handleUpdateButton() {
  try {
    if (updateState === "available") {
      setUpdateState("downloading");
      await window.northOps.downloadUpdate();
      return;
    }

    if (updateState === "downloaded") {
      await window.northOps.installUpdate();
      return;
    }

    setUpdateState("checking");

    const result = await window.northOps.checkForUpdates();

    if (result?.status) {
      setUpdateState(result.status);
      return;
    }

    setUpdateState("none");
  } catch {
    setUpdateState("error");
  }
}

  async function applyFineAndCancelFlight(reason: string, fine: number, clientStatus: string) {

    
    if (!activeMission || !user || cheatDetectedRef.current) return;

    cheatDetectedRef.current = true;
    setTelemetryStarted(false);
    setCanFinishFlight(false);

    const alert = `${reason} • MULTA ${fine.toLocaleString("pt-BR")} NOC • VOO CANCELADO`;

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
      .update({ balance: currentBalance - fine })
      .eq("user_id", user.id);

    await supabaseClient.from("financial_transactions").insert({
      user_id: user.id,
      type: "penalty",
      category: "Multa",
      description: reason,
      amount: -fine,
      reference_id: activeMission.id,
      reference_table: "active_missions",
    });

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

      const rawGForce = Number(currentSimData.g_force || 1);
      const gForce = Math.abs(rawGForce);
      const displayGForce = rawGForce < 0 ? Math.abs(rawGForce) : rawGForce;

      const rawBank = Math.abs(Number(currentSimData.bank_degrees || 0));
      const rawPitch = Math.abs(Number(currentSimData.pitch_degrees || 0));

      const bankAngle = rawBank <= Math.PI ? rawBank * (180 / Math.PI) : rawBank;
      const pitchAngle = rawPitch <= Math.PI ? rawPitch * (180 / Math.PI) : rawPitch;

      const verticalSpeed = Number(currentSimData.vertical_speed || 0);
      const airspeed = Number(currentSimData.airspeed_indicated || 0);
      const crashFlag = Number(currentSimData.crash_flag || 0);
      const altitude = Number(currentSimData.altitude_ft || 0);

      if (crashFlag === 1) {
        await applyCrashPenalty();
        return;
      }

      const severeCrash =
        altitude < 2000 &&
        (
          verticalSpeed < -5000 ||
          gForce > 4.5
        );

      if (severeCrash) {
        console.log(
          `CRASH DETECTED | ALT ${altitude} | VS ${verticalSpeed} | G ${gForce}`
        );

        await applyCrashPenalty();
        return;
      }      
      

      maxGForceRef.current = Math.max(maxGForceRef.current, displayGForce);
      maxBankAngleRef.current = Math.max(maxBankAngleRef.current, bankAngle);
      maxPitchAngleRef.current = Math.max(maxPitchAngleRef.current, pitchAngle);

      if (verticalSpeed < maxDescentRateRef.current) {
        maxDescentRateRef.current = verticalSpeed;
      }

      if (gForce > MAX_SAFE_G_FORCE) {
        addFlightEvent(flightEventsRef, {
          code: "high_g_force",
          type: "warning",
          title: "Força G elevada",
          message: `Força G máxima detectada: ${gForce.toFixed(1)}G.`,
          penalty: 2.5,
        });
      }

      if (bankAngle > MAX_SAFE_BANK_ANGLE) {
        addFlightEvent(flightEventsRef, {
          code: "aggressive_turn",
          type: "warning",
          title: "Curva agressiva",
          message: `Inclinação lateral detectada: ${bankAngle.toFixed(0)}°.`,
          penalty: 1.5,
        });
      }

      if (pitchAngle > MAX_SAFE_PITCH_ANGLE) {
        addFlightEvent(flightEventsRef, {
          code: "aggressive_pitch",
          type: "warning",
          title: "Atitude brusca da aeronave",
          message: `Ângulo de pitch elevado detectado: ${pitchAngle.toFixed(0)}°.`,
          penalty: 1.5,
        });
      }

      if (verticalSpeed < MAX_SAFE_DESCENT_RATE) {
        addFlightEvent(flightEventsRef, {
          code: "hard_descent",
          type: "warning",
          title: "Descida agressiva",
          message: `Razão de descida detectada: ${Math.round(verticalSpeed)} ft/min.`,
          penalty: 2,
        });
      }

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
        heading: normalizeHeading(currentSimData.heading),
        fuel_percent: Number(getFuelPercent(currentSimData)),
        aircraft: currentSimData.aircraft,
        sim_on_ground: Boolean(currentSimData.on_ground),
        engine_running: Boolean(currentSimData.engine_running),
        g_force: Number(gForce),
        bank_degrees: Number(bankAngle),
        pitch_degrees: Number(pitchAngle),
        vertical_speed: Number(verticalSpeed),
        airspeed_indicated: Number(airspeed),
      };

      const { error } = await supabaseClient.from("flight_telemetry").insert(payload);

      if (error) {
        setMessage(`Erro telemetria: ${error.message}`);
        return;
      }

      if (!destinationAirport) return;

      const isLanded = payload.sim_on_ground === true && payload.ground_speed < 30;

      if (isLanded) {
        landingSpeedRef.current = Math.max(
          landingSpeedRef.current,
          Number(airspeed || payload.ground_speed || 0)
        );

        if (verticalSpeed < HARD_LANDING_DESCENT_RATE) {
          addFlightEvent(flightEventsRef, {
            code: "hard_landing",
            type: "danger",
            title: "Pouso duro",
            message: `Impacto no pouso com razão vertical de ${Math.round(verticalSpeed)} ft/min.`,
            penalty: 3,
          });
        }

        if (airspeed > HIGH_LANDING_SPEED) {
          addFlightEvent(flightEventsRef, {
            code: "high_landing_speed",
            type: "warning",
            title: "Velocidade alta no pouso",
            message: `Velocidade indicada no pouso: ${Math.round(airspeed)} kt.`,
            penalty: 1.5,
          });
        }
      }

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
    }, 1000);

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

    const { data: activeFleetData } = await supabaseClient
      .from("pilot_fleet")
      .select("condition")
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle();

    setAircraftCondition(Number(activeFleetData?.condition || 100));

    if (data.client_status === "in_flight") {
      setTelemetryStarted(true);
    }

    setMessage("Missão ativa carregada.");
  }
  async function applyCrashPenalty() {
    
    if (!activeMission || !user || cheatDetectedRef.current) return;

    cheatDetectedRef.current = true;

    setTelemetryStarted(false);
    setCanFinishFlight(false);

    const alert =
      `ACIDENTE DETECTADO • MULTA ${CRASH_FINE.toLocaleString(
        "pt-BR"
      )} NOC • REPUTAÇÃO -${CRASH_REPUTATION_PENALTY} • MISSÃO CANCELADA`;

    setMessage(alert);
    setCheatMessage(alert);

    const { data: wallet } = await supabaseClient
      .from("wallets")
      .select("balance")
      .eq("user_id", user.id)
      .single();

    const currentBalance = Number(wallet?.balance || 0);

    await supabaseClient
      .from("wallets")
      .update({
        balance: Math.max(0, currentBalance - CRASH_FINE),
      })
      .eq("user_id", user.id);

    await supabaseClient.from("financial_transactions").insert({
      user_id: user.id,
      type: "penalty",
      category: "Multa",
      description: "Acidente detectado durante o voo",
      amount: -CRASH_FINE,
      reference_id: activeMission.id,
      reference_table: "active_missions",
    });      

    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("reputation")
      .eq("id", user.id)
      .single();

    await supabaseClient
      .from("profiles")
      .update({
        reputation: Math.max(
          0,
          Number(profile?.reputation || 100) - CRASH_REPUTATION_PENALTY
        ),
      })
      .eq("id", user.id);

      const { data: activeFleet } = await supabaseClient
        .from("pilot_fleet")
        .select(
          "id, condition, fuel, total_hours, total_flights, total_revenue, hours_since_maintenance"
        )
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();

      if (activeFleet) {
        const currentCondition = Number(activeFleet.condition || 100);

        const newCondition = Math.max(
          0,
          currentCondition - 25
        );

        await supabaseClient
          .from("pilot_fleet")
          .update({
            condition: newCondition,
            maintenance_status:
              newCondition <= 35
                ? "maintenance_required"
                : newCondition <= 75
                ? "maintenance_recommended"
                : "available",
          })
          .eq("id", activeFleet.id);
      }

      await supabaseClient
        .from("active_missions")
        .update({
          status: "failed",
          client_status: "crashed",
          validation_message: alert,
          completed_at: new Date().toISOString(),
          telemetry_finished_at: new Date().toISOString(),
        })
        .eq("id", activeMission.id);
      

    await supabaseClient
      .from("active_missions")
      .update({
        status: "failed",
        client_status: "crashed",
        validation_message: alert,
        completed_at: new Date().toISOString(),
        telemetry_finished_at: new Date().toISOString(),
      })
      .eq("id", activeMission.id);
  }
  
  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("Conectando ao NORTH OPS...");

    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password,
    });

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

    setMessage("Verificando atualizações do cliente...");

    if (window.northOps?.checkForUpdates) {
      try {
        const result = await window.northOps.checkForUpdates();

        if (result?.status) {
          setUpdateState(result.status);

        }
      } catch {
        setUpdateState("error");
        setMessage("Não foi possível verificar atualizações. Continuando login...");
      }
    }

    setUser(data.user);
    await loadActiveMission(data.user.id);
    setLoading(false);
  }

  async function handleStartFlight() {
    if (!activeMission) return;

    if (updateState === "downloaded") {
      setMessage("Atualização obrigatória pendente. Clique em Reiniciar e instalar.");
      return;
    }

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

      const fuelReadback = Number(
        briefingResult?.result?.fuel?.readback?.fuel_total_quantity || 0
      );

      fuelAtStartRef.current =
        fuelReadback > 0
          ? fuelReadback
          : Number(simDataRef.current?.fuel_total_quantity || 0);

      cheatDetectedRef.current = false;
      flightEventsRef.current = [];
      maxGForceRef.current = 1;
      maxBankAngleRef.current = 0;
      maxPitchAngleRef.current = 0;
      maxDescentRateRef.current = 0;
      landingSpeedRef.current = 0;

      setCheatMessage("");
      setLastEvaluation(null);
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

    if (updateState === "downloaded") {
      setMessage("Atualização obrigatória pendente. Clique em Reiniciar e instalar.");
      return;
    }

    if (completingFlightRef.current) return;

    completingFlightRef.current = true;

    const completedAt = new Date().toISOString();
    const startedAt =
      activeMission.started_at || activeMission.telemetry_started_at || completedAt;

    const flightHours =
      (new Date(completedAt).getTime() - new Date(startedAt).getTime()) /
      1000 /
      60 /
      60;

    const { data: profileData } = await supabaseClient
      .from("profiles")
      .select("xp, level, is_premium, reputation")
      .eq("id", user.id)
      .single();

    const { data: previousLogs } = await supabaseClient
      .from("flight_logs")
      .select("flight_hours")
      .eq("user_id", user.id);

    const previousTotalHours = (previousLogs || []).reduce(
      (sum, log) => sum + Number(log.flight_hours || 0),
      0
    );

    const totalHoursAfterFlight = previousTotalHours + Number(flightHours.toFixed(2));

    const currentXp = Number(profileData?.xp || 0);
    const isPremium = Boolean(profileData?.is_premium || false);
    const currentReputation = Number(profileData?.reputation || 100);

    const currentCareer = getCareerLevelFromXpAndHours(currentXp, previousTotalHours);

    const baseXp = calculateFlightXp(activeMission);

    const currentSimData = simDataRef.current;
    const remainingFuelPercent = Math.round(getFuelPercent(currentSimData));
    const safeRemainingFuel = Math.min(100, Math.max(0, remainingFuelPercent));

    const evaluation = calculatePilotEvaluation({
      mission: activeMission,
      events: flightEventsRef.current,
      baseXp,
      remainingFuelPercent: safeRemainingFuel,
      maxGForce: Number(maxGForceRef.current || 1),
      maxBankAngle: Number(maxBankAngleRef.current || 0),
      maxPitchAngle: Number(maxPitchAngleRef.current || 0),
      maxDescentRate: Number(maxDescentRateRef.current || 0),
      landingSpeed: Number(landingSpeedRef.current || 0),
    });

    const earnedXp = evaluation.xpFinal;
    const newXp = currentXp + earnedXp;

    const newCareer = getCareerLevelFromXpAndHours(newXp, totalHoursAfterFlight);
    const newLevel = newCareer.level;

    const newReputation = Math.max(
      0,
      Math.min(100, currentReputation + evaluation.reputationChange)
    );

    const basePayment = Number(activeMission.payment || 0);
    const paymentBonus = getPaymentBonus(currentCareer.level, isPremium);
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

      pilot_rating: evaluation.pilotRating,
      passenger_satisfaction: evaluation.passengerSatisfaction,
      cargo_integrity: evaluation.cargoIntegrity,
      reputation_change: evaluation.reputationChange,
      xp_base: evaluation.xpBase,
      xp_final: evaluation.xpFinal,
      flight_events: evaluation.flightEvents,
      landing_impact_level: evaluation.landingImpactLevel,
      max_g_force: evaluation.maxGForce,
      max_bank_angle: evaluation.maxBankAngle,
      max_pitch_angle: evaluation.maxPitchAngle,
      max_descent_rate: evaluation.maxDescentRate,
      landing_speed_kt: evaluation.landingSpeed,
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
    await supabaseClient.from("financial_transactions").insert({
      user_id: user.id,
      type: "mission_income",
      category: "Receita",
      description: `Pagamento da missão ${activeMission.origin} → ${activeMission.destination}`,
      amount: finalPayment,
      reference_id: activeMission.id,
      reference_table: "active_missions",
    });


    const { data: activeFleet } = await supabaseClient
      .from("pilot_fleet")
      .select(
        "id, fuel, total_hours, total_flights, total_revenue, condition, hours_since_maintenance"
      )
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (activeFleet) {
      const completedFlightHours = Number(flightHours.toFixed(2));

      const newTotalHours =
        Number(activeFleet.total_hours || 0) + completedFlightHours;

      const newHoursSinceMaintenance =
        Number(activeFleet.hours_since_maintenance || 0) + completedFlightHours;

      const wear = calculateAircraftWearAfterFlight({
        currentCondition: Number(activeFleet.condition || 100),
        flightHours: completedFlightHours,
        events: evaluation.flightEvents,
      });




      const newMaintenanceStatus =
        wear.newCondition <= 35 || newHoursSinceMaintenance >= 50
          ? "maintenance_required"
          : wear.newCondition <= 75 || newHoursSinceMaintenance >= 25
          ? "maintenance_recommended"
          : "available";

      const shouldBlockAircraft = newMaintenanceStatus === "maintenance_required";

      const { error: fleetError } = await supabaseClient
        .from("pilot_fleet")
        .update({
          fuel: safeRemainingFuel,
          current_airport: activeMission.destination,
          total_hours: newTotalHours,
          total_flights: Number(activeFleet.total_flights || 0) + 1,
          total_revenue: Number(activeFleet.total_revenue || 0) + finalPayment,
          condition: Math.round(wear.newCondition),
          hours_since_maintenance: Number(newHoursSinceMaintenance.toFixed(2)),
          maintenance_status: newMaintenanceStatus,
          is_active: shouldBlockAircraft ? false : true,
        })
        .eq("id", activeFleet.id);

      if (fleetError) {
        setMessage(`Erro ao atualizar aeronave: ${fleetError.message}`);
        completingFlightRef.current = false;
        return;
      }
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

    const { data: profileStats } = await supabaseClient
      .from("profiles")
      .select("average_rating, evaluated_flights")
      .eq("id", user.id)
      .single();

    const currentAverage = Number(profileStats?.average_rating || 10);
    const currentFlights = Number(profileStats?.evaluated_flights || 0);

    const newAverage =
      currentFlights === 0
        ? evaluation.pilotRating
        : (currentAverage * currentFlights + evaluation.pilotRating) /
          (currentFlights + 1);

    await supabaseClient
      .from("profiles")
      .update({
        xp: newXp,
        level: newLevel,
        reputation: newReputation,
        average_rating: Number(newAverage.toFixed(2)),
        evaluated_flights: currentFlights + 1,
      })
      .eq("id", user.id);

    setLastEvaluation({
      ...evaluation,
      payment: finalPayment,
      xpEarned: earnedXp,
      reputationBefore: currentReputation,
      reputationAfter: newReputation,
      remainingFuelPercent: safeRemainingFuel,
    });

    setActiveMission(null);
    setOriginAirport(null);
    setDestinationAirport(null);
    setTelemetryStarted(false);
    setCanFinishFlight(false);

    landingStartedAtRef.current = null;
    completingFlightRef.current = false;
    fuelAtStartRef.current = null;
    cheatDetectedRef.current = false;

    flightEventsRef.current = [];
    maxGForceRef.current = 1;
    maxBankAngleRef.current = 0;
    maxPitchAngleRef.current = 0;
    maxDescentRateRef.current = 0;
    landingSpeedRef.current = 0;

    await loadActiveMission(user.id);

    const levelText =
      newLevel > currentCareer.level
        ? ` Subiu para ${newCareer.title} — nível ${newLevel}!`
        : "";

    setMessage(
      `Voo finalizado. Nota: ${evaluation.pilotRating}/10. XP: +${earnedXp}. Reputação: ${
        evaluation.reputationChange >= 0 ? "+" : ""
      }${evaluation.reputationChange}. Pagamento: ${finalPayment.toLocaleString(
        "pt-BR"
      )} NOC.${levelText}`
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

    await supabaseClient
      .from("flight_telemetry")
      .delete()
      .eq("active_mission_id", activeMission.id);

    await supabaseClient
      .from("flight_logs")
      .delete()
      .eq("mission_id", activeMission.id);

    setTelemetryStarted(false);
    setCanFinishFlight(false);
    setCheatMessage("");
    setLastEvaluation(null);

    landingStartedAtRef.current = null;
    completingFlightRef.current = false;
    fuelAtStartRef.current = null;
    cheatDetectedRef.current = false;

    flightEventsRef.current = [];
    maxGForceRef.current = 1;
    maxBankAngleRef.current = 0;
    maxPitchAngleRef.current = 0;
    maxDescentRateRef.current = 0;
    landingSpeedRef.current = 0;

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
  const updatePendingInstall = updateState === "downloaded";

  useEffect(() => {
    localStorage.setItem("northops_compact_mode", String(compactMode));
  }, [compactMode]);

  return (

  <main className={compactMode ? "app-shell compact-mode" : "app-shell"}>

  <span className="app-version-corner">
    v{appVersion && appVersion !== "?" ? appVersion : ""}
  </span>

      <header className="app-header">
        <h1>Cliente North Ops</h1>
      </header>

      {!user && (
        <section className="login-card">
          <h2>Login do piloto</h2>

          <form onSubmit={handleLogin} className="login-form">
            <input
              type="email"
              placeholder="E-mail do piloto"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <input
              type="password"
              placeholder="Senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            <label className="remember-login">
              <input
                type="checkbox"
                checked={rememberLogin}
                onChange={(e) => setRememberLogin(e.target.checked)}
              />
              Lembrar login
            </label>

            <button disabled={loading}>{loading ? "Conectando..." : "Conectar"}</button>
          </form>
        </section>
      )}
      {user && (
      <div className="bottom-status-bar">
        
        <StatusDot online={!!user} label={user ? "Piloto conectado" : "Offline"} />

        <StatusDot
          online={!!simData?.connected}
          label={simData?.connected ? "MSFS online" : "MSFS offline"}
        />

        <StatusDot
          online={!!simData?.on_ground}
          label={simData?.on_ground ? "Em solo" : "Em voo"}
        />

        <button
          type="button"
          className="compact-toggle"
          onClick={() => {
            const next = !compactMode;
            setCompactMode(next);
            (window as any).northOps?.setCompactMode?.(next);
          }}

        >
          {compactMode ? "Modo normal" : "Modo compacto"}
        </button>

      <div className="update-control">

        <button
          className="update-button-secondary"
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
        
               
      </div>
      </div>
      )}

      {user && activeMission && (
        <section className="cockpit">
          <div className="mission-card">
          <div className="mission-topline">
            <span className="tag">MISSÃO ATIVA</span>
            <strong>{activeMission.type || "OPERAÇÃO"}</strong>
          </div>

          <div className="mission-airports">
            <strong>{activeMission.origin}</strong>
            <span>→</span>
            <strong>{activeMission.destination}</strong>
          </div>

          <h2>{activeMission.title}</h2>

          <div className="mission-quick-info">
            <div>
              <span>Distância</span>
              <strong>{Number(activeMission.distance_nm || 0).toFixed(0)} NM</strong>
            </div>

            <div>
              <span>Pagamento</span>
              <strong>{Number(activeMission.payment || 0).toLocaleString("pt-BR")} NOC</strong>
            </div>

            <div>
              <span>Aeronave</span>
              <strong>{activeMission.aircraft || "Não definida"}</strong>
            </div>
          </div>


            <div className="status-message">{message}</div>

            {updatePendingInstall && (
              <div className="update-required-alert">
                <strong>⚠️ Atualização obrigatória disponível</strong>
                <span>
                  Clique em "Reiniciar e instalar" no canto superior direito para continuar.
                </span>
              </div>
            )}

            <div className={validationStatus.ok ? "validation ok" : "validation error"}>
              {updatePendingInstall
                ? "Cliente bloqueado até a atualização ser instalada."
                : validationStatus.message}
            </div>

            {cheatMessage && <div className="cheat-alert">{cheatMessage}</div>}

            <div className="actions">
              <button onClick={() => loadActiveMission(user.id)}>Atualizar</button>

              <button
                onClick={handleStartFlight}
                disabled={
                  updatePendingInstall ||
                  !validationStatus.ok ||
                  activeMission.client_status === "in_flight"
                }
              >
                {updatePendingInstall ? "Atualização obrigatória" : "Voar agora"}
              </button>

              <button
                onClick={handleFinishFlight}
                disabled={updatePendingInstall || !canFinishFlight}
              >
                {updatePendingInstall ? "Atualização obrigatória" : "Finalizar voo"}
              </button>

              <button className="danger" onClick={handleResetFlight}>
                Reiniciar
              </button>
            </div>
          </div>

  <div className="flight-panel">
  <div className="flight-panel-header">
    <span>
      PROGRESSO DO VOO • {Math.max(0, distanceToDestination).toFixed(1)} NM restantes
    </span>

    <strong>{progressPercent.toFixed(0)}%</strong>
  </div>
  

  <div className="flight-progress-bar">
    <div
      className="flight-progress-fill"
      style={{ width: `${progressPercent}%` }}
    />
  </div>

            <div className="flight-panel-grid">
            </div>
          </div>


          <div className="telemetry-strip compact">
            <div className="aircraft-summary-card">
              <span>✈️ Aeronave</span>
              <strong>{simData?.aircraft || activeMission.aircraft || "-"}</strong>
              <small>Atualizada pela telemetria do simulador</small>
            </div>

            <ProgressMetric
              icon="🛩️"
              label="Condição da aeronave"
              value={aircraftCondition}
            />

            <FuelMetric fuel={fuelPercent} />

            <CargoMetric
              cargoWeight={Number(activeMission.cargo_weight_kg || 0)}
              integrity={liveScores.cargoIntegrity}
            />

            <PassengerMetric
              passengers={Number(activeMission.passengers || 0)}
              passengerWeight={Number(activeMission.passenger_weight_kg || 0)}
              satisfaction={liveScores.passengerSatisfaction}
            />

          </div>
        </section>
      )}

      {user && !activeMission && (
        <section className="login-card">
          <h2>Nenhuma missão ativa</h2>
          <p>Aceite uma missão no site NORTH OPS.</p>

          {lastEvaluation && (
            <div className="status-message">
              <h3>Avaliação do último voo</h3>

              <p>
                Nota de pilotagem: <strong>{lastEvaluation.pilotRating}/10</strong>
              </p>

              {lastEvaluation.passengerSatisfaction !== null && (
                <p>
                  Satisfação dos passageiros:{" "}
                  <strong>{lastEvaluation.passengerSatisfaction}%</strong>
                </p>
              )}

              {lastEvaluation.cargoIntegrity !== null && (
                <p>
                  Integridade da carga: <strong>{lastEvaluation.cargoIntegrity}%</strong>
                </p>
              )}

              <p>
                Reputação:{" "}
                <strong>
                  {lastEvaluation.reputationChange >= 0 ? "+" : ""}
                  {lastEvaluation.reputationChange}
                </strong>
              </p>

              <p>
                XP recebido: <strong>+{lastEvaluation.xpEarned}</strong>
              </p>

              <p>
                Combustível restante:{" "}
                <strong>{lastEvaluation.remainingFuelPercent}%</strong>
              </p>

              <div style={{ marginTop: 12 }}>
                <strong>Eventos:</strong>

                {lastEvaluation.flightEvents?.map((event: any) => (
                  <p key={event.code}>
                    {event.type === "positive"
                      ? "✅"
                      : event.type === "danger"
                      ? "🔴"
                      : "⚠️"}{" "}
                    {event.title}
                  </p>
                ))}
              </div>
            </div>
          )}

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


function PassengerMetric({
  passengers,
  passengerWeight,
  satisfaction,
}: {
  passengers: number;
  passengerWeight: number;
  satisfaction: number;
}) {
  return (
    <div className="metric passenger-metric">
      <span>👥 Passageiros</span>
      <strong>{passengers} pax</strong>
      <small>Peso total: {Math.round(passengerWeight)} kg</small>
      <small>Satisfação: {Math.round(satisfaction)}%</small>
    </div>
  );
}

function CargoMetric({
  cargoWeight,
  integrity,
}: {
  cargoWeight: number;
  integrity: number;
}) {
  return (
    <div className="metric cargo-metric">
      <span>📦 Carga</span>
      <strong>{Math.round(cargoWeight)} kg</strong>
      <small>Integridade: {Math.round(integrity)}%</small>
    </div>
  );
}

function ProgressMetric({
  icon,
  label,
  value,
  detail,
}: {
  icon: string;
  label: string;
  value: number;
  detail?: string;
}) {
  const safeValue = Math.min(100, Math.max(0, Number(value || 0)));

  return (
    <div className="metric progress-metric">
      <div className="metric-header-line">
        <span>{icon} {label}</span>
        {detail && <em>{detail}</em>}
      </div>

      <strong>{safeValue.toFixed(0)}%</strong>

      <div className="fuel-bar">
        <div
          className="fuel-fill"
          style={{
            width: `${safeValue}%`,
            background: getBarColor(safeValue),
          }}
        />
      </div>
    </div>
  );
}

function FuelMetric({ fuel }: { fuel: number }) {
  const color = getBarColor(fuel);

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