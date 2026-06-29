import { supabaseClient } from "./services/supabaseClient";

async function addCareerEntry({
  userId,
  flightLogId,
  activeMissionId,
  eventType,
  icon,
  rarity,
  title,
  description,
  origin,
  destination,
  aircraft,
}: {
  userId: string;
  flightLogId?: string | null;
  activeMissionId?: string | null;
  eventType: string;
  icon: string;
  rarity: "common" | "rare" | "epic" | "legendary";
  title: string;
  description: string;
  origin?: string;
  destination?: string;
  aircraft?: string;
}) {
  await supabaseClient.from("career_diary").insert({
    user_id: userId,
    flight_log_id: flightLogId || null,
    active_mission_id: activeMissionId || null,
    event_type: eventType,
    icon,
    rarity,
    title,
    description,
    origin,
    destination,
    aircraft,
  });
}
async function hasCareerEvent(userId: string, eventType: string) {
  const { data } = await supabaseClient
    .from("career_diary")
    .select("id")
    .eq("user_id", userId)
    .eq("event_type", eventType)
    .limit(1)
    .maybeSingle();

  return Boolean(data);
}

function getCollectionReward(state: string | null) {
  const rewards: Record<
    string,
    { title: string; noc: number; xp: number; badge: string }
  > = {
    RR: { title: "Pioneiro de Roraima", noc: 25000, xp: 750, badge: "🏔️" },
    AM: { title: "Explorador do Amazonas", noc: 50000, xp: 1500, badge: "🌳" },
    PA: { title: "Rotas do Pará", noc: 45000, xp: 1250, badge: "⛏️" },
    AC: { title: "Guardião do Acre", noc: 25000, xp: 750, badge: "🌿" },
    AP: { title: "Extremo Norte", noc: 30000, xp: 900, badge: "🌊" },
    RO: { title: "Integração Regional", noc: 30000, xp: 900, badge: "🚜" },
    TO: { title: "Conexão Tocantinense", noc: 30000, xp: 900, badge: "🌾" },
    MT: { title: "Rota Centro-Oeste", noc: 30000, xp: 900, badge: "🧭" },
  };

  if (!state) {
    return { title: "Explorador Regional", noc: 25000, xp: 750, badge: "🌎" };
  }

  return (
    rewards[state.toUpperCase()] || {
      title: "Explorador Regional",
      noc: 25000,
      xp: 750,
      badge: "🌎",
    }
  );
}

export async function processCareerEvents({
  userId,
  activeMission,
  evaluation,
  flightLogId,
}: {
  userId: string;
  activeMission: any;
  evaluation: any;
  flightLogId?: string | null;
}) {
  await addCareerEntry({
    userId,
    flightLogId,
    activeMissionId: activeMission.id,
    eventType: "flight_completed",
    icon: "🛬",
    rarity: "common",
    title: "Voo concluído",
    description: `${activeMission.origin} → ${activeMission.destination} com ${activeMission.aircraft}. Nota ${evaluation.pilotRating}/10 e pouso ${evaluation.landingGrade}.`,
    origin: activeMission.origin,
    destination: activeMission.destination,
    aircraft: activeMission.aircraft,
  });

  const { data: visitedAirport, error: visitedAirportError } =
    await supabaseClient
      .from("visited_airports")
      .insert({
        user_id: userId,
        airport_code: activeMission.destination,
      })
      .select("airport_code")
      .single();

  if (!visitedAirportError && visitedAirport) {
    await addCareerEntry({
      userId,
      flightLogId,
      activeMissionId: activeMission.id,
      eventType: "new_airport_discovered",
      icon: "🌎",
      rarity: "rare",
      title: "Novo aeroporto descoberto",
      description: `Você pousou pela primeira vez em ${activeMission.destination}. Mais um destino foi adicionado ao seu Livro de Bordo.`,
      origin: activeMission.origin,
      destination: activeMission.destination,
      aircraft: activeMission.aircraft,
    });
const { data: airportData } = await supabaseClient
  .from("airports")
  .select("state")
  .eq("sim_code", activeMission.destination)
  .maybeSingle();

const destinationState = airportData?.state || null;

if (destinationState) {
  const { data: collectionData } = await supabaseClient.rpc(
    "get_airport_collections_by_state",
    {
      p_user_id: userId,
    }
  );

  const currentCollection = (collectionData || []).find(
    (item: any) => item.state === destinationState
  );

  if (currentCollection && Number(currentCollection.progress_percent || 0) >= 100) {
    const reward = getCollectionReward(destinationState);

    await supabaseClient.rpc("unlock_collection_title", {
      p_user_id: userId,
      p_state: destinationState,
      p_title: reward.title,
      p_icon: reward.badge,
    });

    await addCareerEntry({
      userId,
      flightLogId,
      activeMissionId: activeMission.id,
      eventType: "state_collection_completed",
      icon: reward.badge,
      rarity: "legendary",
      title: reward.title,
      description: `Você completou a coleção de ${destinationState}. Todos os aeroportos cadastrados desse estado agora fazem parte da sua história no NORTH OPS.`,
      origin: activeMission.origin,
      destination: activeMission.destination,
      aircraft: activeMission.aircraft,
    });
  }
}
  const alreadyHasExcellentLanding = await hasCareerEvent(
    userId,
    "first_excellent_landing"
  );

  if (
    !alreadyHasExcellentLanding &&
    evaluation.landingGrade === "Excelente"
  ) {
    await addCareerEntry({
      userId,
      flightLogId,
      activeMissionId: activeMission.id,
      eventType: "first_excellent_landing",
      icon: "🏆",
      rarity: "epic",
      title: "Primeiro pouso excelente",
      description:
        "Seu treinamento começou a aparecer. Você realizou seu primeiro pouso Excelente no NORTH OPS.",
      origin: activeMission.origin,
      destination: activeMission.destination,
      aircraft: activeMission.aircraft,
    });
  }
const alreadyHasBeginnerExplorer = await hasCareerEvent(
  userId,
  "beginner_explorer"
);

const { count: visitedAirportsCount } = await supabaseClient
  .from("visited_airports")
  .select("*", {
    count: "exact",
    head: true,
  })
  .eq("user_id", userId);

if (
  !alreadyHasBeginnerExplorer &&
  Number(visitedAirportsCount || 0) >= 5
) {
  await addCareerEntry({
    userId,
    flightLogId,
    activeMissionId: activeMission.id,
    eventType: "beginner_explorer",
    icon: "🗺️",
    rarity: "rare",
    title: "Explorador iniciante",
    description:
      "Você já conheceu 5 aeroportos diferentes na Região Norte. Sua jornada está apenas começando.",
    origin: activeMission.origin,
    destination: activeMission.destination,
    aircraft: activeMission.aircraft,
  });
}
const currentDistance = Number(activeMission.distance_nm || 0);

const { data: previousLongerFlight } = await supabaseClient
  .from("flight_logs")
  .select("id")
  .eq("user_id", userId)
  .gt("distance_nm", currentDistance)
  .neq("id", flightLogId || "")
  .limit(1)
  .maybeSingle();

if (
  currentDistance > 0 &&
  !previousLongerFlight &&
  currentDistance >= 80
) {
  await addCareerEntry({
    userId,
    flightLogId,
    activeMissionId: activeMission.id,
    eventType: "longest_flight_record",
    icon: "📏",
    rarity: "rare",
    title: "Novo recorde de distância",
    description: `Este foi o voo mais longo da sua carreira até agora: ${Math.round(
      currentDistance
    )} NM.`,
    origin: activeMission.origin,
    destination: activeMission.destination,
    aircraft: activeMission.aircraft,
  });
}

  }
}