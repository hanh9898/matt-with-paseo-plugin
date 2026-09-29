import { registerLifecycleRelay } from "./server/hooks/lifecycle-relay.ts";
import { connectPaseo, type PaseoServer } from "./server/paseo-host.ts";

export default function contribute(server: PaseoServer) {
  const hooks = connectPaseo(server);
  registerLifecycleRelay(hooks);
  return () => {};
}
