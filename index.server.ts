import { registerAppetite } from "./server/appetite.ts";
import { createDecisionLog } from "./server/decision-log.ts";
import { readDelegatedAnswers, registerDelegatedAnswers } from "./server/delegated-answers.ts";
import { registerGateCap } from "./server/hooks/gate-cap.ts";
import { registerLifecycleRelay } from "./server/hooks/lifecycle-relay.ts";
import { registerStallSensor } from "./server/hooks/stall-sensor.ts";
import { registerTicketMarker } from "./server/hooks/ticket-marker.ts";
import { registerWaitingCount } from "./server/hooks/waiting-count.ts";
import { connectPaseo, type PaseoServer } from "./server/paseo-host.ts";
import { registerQuestionBudget } from "./server/question-budget.ts";
import { createReportCard } from "./server/report-card.ts";
import { budgetOf } from "./shared/question-budget.ts";

export default function contribute(server: PaseoServer) {
  const hooks = connectPaseo(server);
  registerLifecycleRelay(hooks);
  registerWaitingCount(hooks);
  registerTicketMarker(hooks);
  registerStallSensor(hooks);
  registerGateCap(hooks);
  const appetite = registerAppetite(hooks, { updated: (who, host) => card.refresh(who, host) });
  const budget = registerQuestionBudget(hooks);
  const card = createReportCard({
    decided: readDelegatedAnswers,
    spend: appetite.spendOf,
    questions: () => ({ count: budget.count(), budget: budgetOf(process.env) }),
  });
  const log = createDecisionLog();
  registerDelegatedAnswers(hooks, {
    pastAppetite: appetite.pastAppetite,
    left: async (question, host) => {
      log.left(question);
      try {
        await budget.left(question, host);
      } finally {
        await card.refresh(question, host);
      }
    },
    answered: async (answered, host) => {
      log.answered(answered);
      await card.refresh(answered, host);
    },
  });
  return () => hooks.stop();
}
