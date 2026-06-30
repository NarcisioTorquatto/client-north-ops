import { supabaseClient } from "./services/supabaseClient";

type UnlockedAchievement = {
  code: string;
  title: string;
  icon: string;
  rarity: "common" | "rare" | "epic" | "legendary";
};

async function unlockAchievement({
  userId,
  code,
  progress = 1,
}: {
  userId: string;
  code: string;
  progress?: number;
}): Promise<UnlockedAchievement | null> {
  const { data: achievement } = await supabaseClient
    .from("achievement_catalog")
    .select("code, title, icon, rarity")
    .eq("code", code)
    .maybeSingle();

  if (!achievement) return null;

  const { data, error } = await supabaseClient.rpc("unlock_achievement", {
    p_user_id: userId,
    p_achievement_code: code,
    p_progress: progress,
  });

  if (error) {
    console.error("Erro ao desbloquear medalha:", code, error.message);
    return null;
  }

  if (!data) return null;

  return {
    code: achievement.code,
    title: achievement.title,
    icon: achievement.icon || "🏅",
    rarity: achievement.rarity || "common",
  };
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
  const unlocked: UnlockedAchievement[] = [];

  const { count: totalFlights } = await supabaseClient
    .from("flight_logs")
    .select("*", {
      count: "exact",
      head: true,
    })
    .eq("user_id", userId);

  if (Number(totalFlights || 0) >= 1) {
    const achievement = await unlockAchievement({
      userId,
      code: "first_flight",
      progress: Number(totalFlights || 0),
    });

    if (achievement) unlocked.push(achievement);
  }

  if (Number(totalFlights || 0) >= 10) {
    const achievement = await unlockAchievement({
      userId,
      code: "ten_flights",
      progress: Number(totalFlights || 0),
    });

    if (achievement) unlocked.push(achievement);
  }

  if (Number(totalFlights || 0) >= 50) {
    const achievement = await unlockAchievement({
      userId,
      code: "fifty_flights",
      progress: Number(totalFlights || 0),
    });

    if (achievement) unlocked.push(achievement);
  }

  if (evaluation?.landingGrade === "Excelente") {
    const achievement = await unlockAchievement({
      userId,
      code: "first_excellent_landing",
      progress: 1,
    });

    if (achievement) unlocked.push(achievement);
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
    const achievement = await unlockAchievement({
      userId,
      code: "ten_excellent_landings",
      progress: Number(excellentLandings || 0),
    });

    if (achievement) unlocked.push(achievement);
  }

  const { count: visitedAirports } = await supabaseClient
    .from("visited_airports")
    .select("*", {
      count: "exact",
      head: true,
    })
    .eq("user_id", userId);

  if (Number(visitedAirports || 0) >= 1) {
    const achievement = await unlockAchievement({
      userId,
      code: "first_airport_discovered",
      progress: Number(visitedAirports || 0),
    });

    if (achievement) unlocked.push(achievement);
  }

  if (Number(visitedAirports || 0) >= 5) {
    const achievement = await unlockAchievement({
      userId,
      code: "five_airports_discovered",
      progress: Number(visitedAirports || 0),
    });

    if (achievement) unlocked.push(achievement);
  }

  if (Number(activeMission?.distance_nm || 0) >= 80) {
    const achievement = await unlockAchievement({
      userId,
      code: "longest_flight_record",
      progress: Number(activeMission.distance_nm || 0),
    });

    if (achievement) unlocked.push(achievement);
  }

  return unlocked;
}