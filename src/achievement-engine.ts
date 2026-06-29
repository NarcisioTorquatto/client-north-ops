import { supabaseClient } from "./services/supabaseClient";

async function unlockAchievement({
  userId,
  code,
  progress = 1,
}: {
  userId: string;
  code: string;
  progress?: number;
}) {
  const { data, error } = await supabaseClient.rpc("unlock_achievement", {
    p_user_id: userId,
    p_achievement_code: code,
    p_progress: progress,
  });

  if (error) {
    console.error("Erro ao desbloquear medalha:", code, error.message);
    return false;
  }

  return Boolean(data);
}

export async function processAchievements({
  userId,
  activeMission,
  evaluation,
}: {
  userId: string;
  activeMission: any;
  evaluation: any;
}) {
  const unlocked: string[] = [];

  const { count: totalFlights } = await supabaseClient
    .from("flight_logs")
    .select("*", {
      count: "exact",
      head: true,
    })
    .eq("user_id", userId);

  if (Number(totalFlights || 0) >= 1) {
    const ok = await unlockAchievement({
      userId,
      code: "first_flight",
      progress: Number(totalFlights || 0),
    });

    if (ok) unlocked.push("first_flight");
  }

  if (Number(totalFlights || 0) >= 10) {
    const ok = await unlockAchievement({
      userId,
      code: "ten_flights",
      progress: Number(totalFlights || 0),
    });

    if (ok) unlocked.push("ten_flights");
  }

  if (Number(totalFlights || 0) >= 50) {
    const ok = await unlockAchievement({
      userId,
      code: "fifty_flights",
      progress: Number(totalFlights || 0),
    });

    if (ok) unlocked.push("fifty_flights");
  }

  if (evaluation?.landingGrade === "Excelente") {
    const ok = await unlockAchievement({
      userId,
      code: "first_excellent_landing",
      progress: 1,
    });

    if (ok) unlocked.push("first_excellent_landing");
  }

  const { count: excellentLandings } = await supabaseClient
    .from("flight_logs")
    .select("*", {
      count: "exact",
      head: true,
    })
    .eq("user_id", userId)
    .eq("landing_grade", "Excelente");

  if (Number(excellentLandings || 0) >= 10) {
    const ok = await unlockAchievement({
      userId,
      code: "ten_excellent_landings",
      progress: Number(excellentLandings || 0),
    });

    if (ok) unlocked.push("ten_excellent_landings");
  }

  const { count: visitedAirports } = await supabaseClient
    .from("visited_airports")
    .select("*", {
      count: "exact",
      head: true,
    })
    .eq("user_id", userId);

  if (Number(visitedAirports || 0) >= 1) {
    const ok = await unlockAchievement({
      userId,
      code: "first_airport_discovered",
      progress: Number(visitedAirports || 0),
    });

    if (ok) unlocked.push("first_airport_discovered");
  }

  if (Number(visitedAirports || 0) >= 5) {
    const ok = await unlockAchievement({
      userId,
      code: "five_airports_discovered",
      progress: Number(visitedAirports || 0),
    });

    if (ok) unlocked.push("five_airports_discovered");
  }

  if (Number(activeMission?.distance_nm || 0) >= 80) {
    const ok = await unlockAchievement({
      userId,
      code: "longest_flight_record",
      progress: Number(activeMission.distance_nm || 0),
    });

    if (ok) unlocked.push("longest_flight_record");
  }

  return unlocked;
}