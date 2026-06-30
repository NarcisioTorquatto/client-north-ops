import { supabaseClient } from "./services/supabaseClient";

function getTodayKey() {
  return new Date().toISOString().split("T")[0];
}

export async function processDailyObjectives({
  userId,
  activeMission,
  evaluation,
  discoveredNewAirport,
}: {
  userId: string;
  activeMission: any;
  evaluation: any;
  discoveredNewAirport: boolean;
}) {
  const todayKey = getTodayKey();

  const { data: objectives } = await supabaseClient
    .from("objective_catalog")
    .select("*")
    .eq("is_active", true)
    .eq("period", "daily");

  if (!objectives || objectives.length === 0) return [];

  const completedObjectives: any[] = [];

  for (const objective of objectives) {
    let progressToAdd = 0;

    if (objective.code === "daily_complete_flight") {
      progressToAdd = 1;
    }

    if (
      objective.code === "daily_excellent_landing" &&
      evaluation?.landingGrade === "Excelente"
    ) {
      progressToAdd = 1;
    }

    if (
      objective.code === "daily_discover_airport" &&
      discoveredNewAirport
    ) {
      progressToAdd = 1;
    }

    if (
      objective.code === "daily_long_flight" &&
      Number(activeMission?.distance_nm || 0) >= Number(objective.target_value || 0)
    ) {
      progressToAdd = Number(activeMission?.distance_nm || 0);
    }

    if (progressToAdd <= 0) continue;

    const { data: existing } = await supabaseClient
      .from("pilot_objectives")
      .select("*")
      .eq("user_id", userId)
      .eq("objective_code", objective.code)
      .eq("period_key", todayKey)
      .maybeSingle();

    if (existing?.completed) continue;

    const newProgress = Number(existing?.progress || 0) + progressToAdd;
    const target = Number(objective.target_value || 1);
    const completed = newProgress >= target;

    if (existing) {
      await supabaseClient
        .from("pilot_objectives")
        .update({
          progress: newProgress,
          completed,
          completed_at: completed ? new Date().toISOString() : null,
        })
        .eq("id", existing.id);
    } else {
      await supabaseClient.from("pilot_objectives").insert({
        user_id: userId,
        objective_code: objective.code,
        period: objective.period,
        period_key: todayKey,
        progress: newProgress,
        completed,
        completed_at: completed ? new Date().toISOString() : null,
      });
    }

    if (completed) {
      const xpReward = Number(objective.xp_reward || 0);
      const nocReward = Number(objective.noc_reward || 0);

      if (xpReward > 0) {
        const { data: profile } = await supabaseClient
          .from("profiles")
          .select("xp")
          .eq("id", userId)
          .single();

        await supabaseClient
          .from("profiles")
          .update({
            xp: Number(profile?.xp || 0) + xpReward,
          })
          .eq("id", userId);
      }

      if (nocReward > 0) {
        const { data: wallet } = await supabaseClient
          .from("wallets")
          .select("balance")
          .eq("user_id", userId)
          .single();

        await supabaseClient
          .from("wallets")
          .update({
            balance: Number(wallet?.balance || 0) + nocReward,
          })
          .eq("user_id", userId);

        await supabaseClient.from("financial_transactions").insert({
          user_id: userId,
          type: "objective_reward",
          category: "Objetivos",
          description: `Recompensa do objetivo diário: ${objective.title}`,
          amount: nocReward,
        });
      }

      completedObjectives.push(objective);
    }
  }

  return completedObjectives;
}