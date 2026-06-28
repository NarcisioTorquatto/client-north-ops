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
  }
}