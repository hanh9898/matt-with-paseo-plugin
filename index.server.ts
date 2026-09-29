import { registerLifecycleRelay } from "./server/hooks/lifecycle-relay.ts";
import { registerTicketMarker } from "./server/hooks/ticket-marker.ts";
import { registerWaitingCount } from "./server/hooks/waiting-count.ts";
import { connectPaseo, type PaseoServer } from "./server/paseo-host.ts";

export default function contribute(server: PaseoServer) {
  const hooks = connectPaseo(server);
  registerLifecycleRelay(hooks);
  registerWaitingCount(hooks);
  registerTicketMarker(hooks);
  return () => {};
}
