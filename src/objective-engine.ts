import { supabaseClient } from "./services/supabaseClient";

  function getTodayKey() {
    const now = new Date();

    const brasiliaDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);

    return brasiliaDate;
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
  function seededRandom(seed: string) {
    let hash = 2166136261;

    for (let i = 0; i < seed.length; i++) {
      hash ^= seed.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }

    return () => {
      hash += hash << 13;
      hash ^= hash >>> 7;
      hash += hash << 3;
      hash ^= hash >>> 17;
      hash += hash << 5;

      return (hash >>> 0) / 4294967296;
    };
  }

  function selectDailyObjectives(objectives: any[], todayKey: string) {
    const random = seededRandom(`north-ops-${todayKey}`);

    const shuffled = [...objectives].sort(() => random() - 0.5);

    return shuffled.slice(0, 4);
  }  



  const { data: objectives } = await supabaseClient
    .from("objective_catalog")
    .select("*")
    .eq("is_active", true)
    .eq("period", "daily");

  if (!objectives || objectives.length === 0) return [];

  const dailyObjectives = selectDailyObjectives(objectives, todayKey);

  const completedObjectives: any[] = [];

  for (const objective of dailyObjectives) {

    let progressToAdd = 0;

    if (objective.code === "daily_complete_1_flight") {
      progressToAdd = 1;
    }

    if (
      objective.code === "daily_good_landing" &&
      ["Bom", "Muito bom", "Excelente"].includes(evaluation?.landingGrade)
    ) {
      progressToAdd = 1;
    }

    if (
      objective.code === "daily_discover_1_airport" &&
      discoveredNewAirport
    ) {
      progressToAdd = 1;
    }

    if (
      objective.code === "daily_earn_10000_noc"
    ) {
      progressToAdd = Number(activeMission?.payment || 0);
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
      const { error } = await supabaseClient
        .from("pilot_objectives")
        .update({
          progress: newProgress,
          completed,
          completed_at: completed ? new Date().toISOString() : null,
        })
        .eq("id", existing.id);

      if (error) {
        console.error("ERRO AO ATUALIZAR OBJETIVO:", error);
      }
    } else {
      const { error } = await supabaseClient.from("pilot_objectives").insert({
        user_id: userId,
        objective_code: objective.code,
        period_key: todayKey,
        progress: newProgress,
        completed,
        completed_at: completed ? new Date().toISOString() : null,
      });

      if (error) {
        console.error("ERRO AO INSERIR OBJETIVO:", error);
      }
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