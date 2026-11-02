import { bundledWebAddons } from "./registry";

export function WebAddonLifecycleHosts() {
  return bundledWebAddons.map(({ id, Lifecycle }) =>
    Lifecycle === undefined ? null : <Lifecycle key={id} />,
  );
}
