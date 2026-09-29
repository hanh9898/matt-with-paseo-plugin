import { connectPaseo, type PaseoServer } from "./server/paseo-host.ts";

export default function contribute(server: PaseoServer) {
  const hooks = connectPaseo(server);
  // Each hook handler registers on `hooks` (see the README's Development section); none exists yet.
  void hooks;
  return () => {};
}
